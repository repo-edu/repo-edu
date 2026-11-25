import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeClaude } from "./claude.js"
import { type CliRuntime, readCliLines, withCliProcess } from "./cli-process.js"
import { decodeCodex, decodeCodexMessage } from "./codex.js"
import { CodexSessionReader, codexSessionsRoot } from "./codex-session.js"
import {
  errorMessage,
  type Feedback,
  type PhaseCompletion,
  type PhaseOutput,
  type PhaseRecorder,
} from "./feedback.js"
import type {
  AssistantTurnInput,
  ContestScope,
  Phase,
  PhaseControlResult,
  PhaseFailure,
  PhaseInput,
  PhaseResult,
  RoundDependencies,
  RulerScope,
} from "./phase.js"
import {
  hasPhaseResult,
  phaseResult,
  watchOutput,
  withoutPhaseResult,
} from "./phase-result.js"
import {
  closingNote,
  outputSchema,
  structuredPhaseResult,
  usesStructuredResult,
} from "./phase-result-schema.js"
import {
  type AssistantPrompt,
  phasePrompt,
  phaseRequest,
  rulerSourceRequest,
} from "./requests.js"
import {
  type RulerReading,
  readRulerReport,
  unopenedSources,
} from "./ruler-report.js"

export type AssistantRuntime = CliRuntime & { readonly sessionsRoot?: string }

/**
 * The phases whose Claude sessions keep their prompt cache for five minutes
 * instead of an hour. The Cache lifetime section of `references/sessions.md`
 * gives the measured reason.
 */
const fiveMinuteCachePhases: ReadonlySet<Phase> = new Set([
  "audit",
  "vet",
  "rebut",
  "rule",
  "watch",
])

/** The child's environment: the caller's, with the selected phases' cache lifetime. */
function childEnvironment(
  input: AssistantTurnInput,
  env: CliRuntime["env"],
): CliRuntime["env"] {
  return input.assistant === "claude" && fiveMinuteCachePhases.has(input.phase)
    ? { ...env, CLAUDE_CODE_PROMPT_CACHE_TTL: "5m" }
    : env
}

/** Derive the fix commit block from the contest arguments the runner already owns. */
function openContests(input: AssistantTurnInput): readonly number[] {
  if (input.phase !== "fix") return []
  const scope = input.arguments.find(
    (argument): argument is ContestScope =>
      typeof argument === "object" &&
      argument !== null &&
      "contests" in argument,
  )
  return (
    scope?.contests
      .filter((contest) => contest.winner === undefined)
      .map((contest) => contest.finding) ?? []
  )
}

/**
 * Read a ruler's finished response against the findings it was given and the
 * round's panel, and name the sources its session did not open. A response
 * that did not finish returns null, because its phase result fails it anyway.
 */
function readRuling(
  input: PhaseInput<"rule">,
  finalText: string,
  toolLines: readonly string[],
  supplied: readonly string[],
): {
  readonly reading: RulerReading
  readonly missed: readonly string[]
} | null {
  if (phaseResult("", finalText).status !== "finished") return null
  const scope = input.arguments.at(-1) as RulerScope
  const reading = readRulerReport(
    withoutPhaseResult(finalText),
    scope.findings.map(({ finding, tier }) => ({ number: finding, tier })),
    input.panel,
  )
  return {
    reading,
    missed: unopenedSources(reading.sources, toolLines, supplied),
  }
}

export function runAssistantPhase<P extends Phase>(
  input: PhaseInput<P>,
  output: PhaseOutput,
  runtime: AssistantRuntime,
): Promise<PhaseResult<P>>
export function runAssistantPhase(
  input: PhaseInput,
  output: PhaseOutput,
  runtime: AssistantRuntime,
): Promise<PhaseResult> {
  return runAssistantInvocation(input, phasePrompt(input), output, runtime)
}

/** Also used by the contract recorder with a probe prompt and a raw-record sink. */
export function runAssistantInvocation<P extends Phase>(
  input: PhaseInput<P>,
  prompt: AssistantPrompt,
  output: PhaseOutput,
  runtime: AssistantRuntime,
  record?: (value: unknown) => Promise<void>,
): Promise<PhaseResult<P>>
export function runAssistantInvocation(
  input: PhaseInput,
  prompt: AssistantPrompt,
  output: PhaseOutput,
  runtime: AssistantRuntime,
  record?: (value: unknown) => Promise<void>,
): Promise<PhaseResult> {
  // The ruler's reading check reads its report before the runner admits it,
  // and sends the session back once when the report names an unopened source.
  const review =
    input.phase === "rule"
      ? (finalText: string, toolLines: readonly string[]) => {
          const ruling = readRuling(
            input,
            finalText,
            toolLines,
            prompt.supplied,
          )
          return ruling === null || ruling.missed.length === 0
            ? null
            : rulerSourceRequest(input, ruling.missed)
        }
      : undefined
  return runAssistantTurn(
    input,
    prompt,
    output,
    runtime,
    async (sessionId, finalText, toolLines, structuredOutput) => {
      if (usesStructuredResult(input.phase)) {
        const { result, text } = structuredPhaseResult(
          input.phase,
          sessionId,
          structuredOutput,
        )
        return { phaseResult: result, text, complete: () => result }
      }
      if (finalText === undefined)
        throw new Error("CLI ended without final text")
      const result = phaseResult(sessionId, finalText)
      if (input.phase === "rule" && result.status === "finished") {
        const ruling = readRuling(input, finalText, toolLines, prompt.supplied)
        if (ruling === null) throw new Error("The ruler did not finish")
        if (ruling.missed.length > 0)
          throw new Error(
            `The ruler report names sources its session did not open: ${ruling.missed.join(", ")}`,
          )
        // The ruler's output follows every vet report and the rebuttal report.
        await writeFile(
          input.arguments[input.arguments.length - 2] as string,
          `${withoutPhaseResult(finalText)}\n`,
          "utf8",
        )
        return {
          phaseResult: result,
          complete: () => ({ ...result, reading: ruling.reading }),
        }
      }
      if (result.status === "finished") {
        const report =
          input.phase === "audit"
            ? input.arguments[0]
            : input.phase === "vet"
              ? input.arguments[1]
              : input.phase === "rebut"
                ? // The rebuttal's output follows every vet report of the panel.
                  input.arguments[input.arguments.length - 1]
                : null
        if (report !== null)
          await writeFile(report, `${withoutPhaseResult(finalText)}\n`, "utf8")
      }
      // The runner reads and saves split answers from the session's final text.
      if (
        (input.phase === "design" || input.phase === "pick") &&
        result.status === "finished"
      ) {
        const document = withoutPhaseResult(finalText)
        return {
          phaseResult: result,
          complete: () => ({ ...result, document }),
        }
      }
      if (input.phase === "watch" && result.status === "finished") {
        const output = watchOutput(finalText)
        return {
          phaseResult: result,
          complete: ({ compactions }: PhaseCompletion) => ({
            ...result,
            ...output,
            compactions,
          }),
        }
      }
      return {
        phaseResult: result,
        complete: () => result as PhaseResult,
      }
    },
    record,
    review,
  )
}

async function runAssistantTurn<T>(
  input: AssistantTurnInput,
  prompt: AssistantPrompt,
  output: PhaseOutput,
  runtime: AssistantRuntime,
  admit: (
    sessionId: string,
    finalText: string | undefined,
    toolLines: readonly string[],
    structuredOutput: unknown,
  ) => Promise<{
    readonly phaseResult: PhaseControlResult
    readonly text?: string
    readonly complete: (completion: PhaseCompletion) => T
  }>,
  record?: (value: unknown) => Promise<void>,
  /** Returns a request that sends the session back once, or null to admit the response. */
  review?: (finalText: string, toolLines: readonly string[]) => string | null,
): Promise<T | PhaseFailure> {
  let sessionId = input.sessionId
  let recorder: PhaseRecorder | undefined
  // The invocation's tool lines, as the round log keeps them, for the reading check.
  const toolLines: string[] = []
  const observe = async (feedback: Feedback): Promise<void> => {
    if (recorder === undefined)
      throw new Error("Phase feedback arrived before its phase started")
    if (feedback.type === "tool" && feedback.invocation !== null)
      toolLines.push(feedback.invocation)
    await recorder.observe(feedback)
  }
  const usage =
    input.assistant === "codex"
      ? new CodexSessionReader(codexSessionsRoot(runtime))
      : undefined
  const decode = input.assistant === "claude" ? decodeClaude : decodeCodex
  const env = childEnvironment(input, runtime.env)
  const structuredPhase = usesStructuredResult(input.phase) ? input.phase : null
  const schema =
    structuredPhase === null ? undefined : outputSchema(structuredPhase)
  const codexPhase = input.assistant === "codex" ? structuredPhase : null
  let schemaDirectory: string | undefined
  /**
   * One CLI process on the session. A session is one or more turns and ends
   * with its process; the response is the last finished turn's text.
   */
  const respond = async (text: string, schemaArgument?: string) => {
    let finalText: string | undefined
    let structuredOutput: unknown
    let turns = 0
    const request = phaseRequest(input, sessionId, text, schemaArgument)
    await withCliProcess(
      { ...runtime, cwd: input.cwd, env, openContests: openContests(input) },
      input.assistant,
      request.args,
      request.input,
      async (child) => {
        await readCliLines(child, "stdout", async (line) => {
          if (sessionId !== null) await usage?.read(sessionId, observe)
          const value: unknown = JSON.parse(line)
          const events = decode(value)
          for (const event of events) {
            if (event.type === "session") {
              if (sessionId !== null && event.sessionId !== sessionId)
                throw new Error("CLI reported a different session")
              sessionId = event.sessionId
            }
            if (event.type === "complete") {
              turns += 1
            } else if (event.type === "final") {
              // Codex's newest message may be the result. Display it as
              // commentary only when another message takes its place.
              if (codexPhase !== null && finalText !== undefined) {
                const note = closingNote(
                  codexPhase,
                  decodeCodexMessage(finalText),
                )
                await observe({ type: "text", text: note ?? finalText })
              }
              finalText = event.text
              structuredOutput = event.structuredOutput
            } else if (codexPhase === null || event.type !== "text") {
              await observe(event)
            }
          }
          await record?.(value)
        })
      },
      (diagnostic) => observe({ type: "diagnostic", text: diagnostic }),
    )
    if (turns === 0 || sessionId === null)
      throw new Error("CLI ended without a completed turn or session identity")
    await usage?.read(sessionId, observe, true)
    return { sessionId, finalText, structuredOutput }
  }
  try {
    try {
      runtime.signal?.throwIfAborted()
      recorder = await output.start(input, prompt.log)
      if (sessionId !== null) await usage?.prepareResume(sessionId)
      let schemaArgument = schema
      if (schema !== undefined && codexPhase !== null) {
        schemaDirectory = await mkdtemp(join(tmpdir(), "audit-round-schema-"))
        schemaArgument = join(schemaDirectory, "result.json")
        await writeFile(schemaArgument, schema, "utf8")
      }
      let resultRequested = false
      // The model can leave the line off a finished response. The session is
      // asked once to end again, which repeats no phase work; a second
      // response without the line fails the phase as any other does.
      const ended = async (
        response: Awaited<ReturnType<typeof respond>>,
      ): Promise<Awaited<ReturnType<typeof respond>>> => {
        if (
          resultRequested ||
          prompt.resultRequest === undefined ||
          response.finalText === undefined ||
          hasPhaseResult(response.finalText)
        )
          return response
        resultRequested = true
        await observe({
          type: "diagnostic",
          text: "The response ended without its PHASE RESULT line. Asking the session once to end with it.",
        })
        return respond(prompt.resultRequest)
      }
      let response = await ended(await respond(prompt.text, schemaArgument))
      const sendBack =
        response.finalText === undefined
          ? null
          : (review?.(response.finalText, toolLines) ?? null)
      if (sendBack !== null) {
        await observe({
          type: "diagnostic",
          text: "The ruler report names sources the session did not open. Sending the session back once to open them.",
        })
        response = await ended(await respond(sendBack))
      }
      const structuredOutput =
        codexPhase !== null && response.finalText !== undefined
          ? decodeCodexMessage(response.finalText)
          : response.structuredOutput
      if (schema !== undefined) {
        if (structuredOutput === undefined)
          throw new Error("CLI ended without a structured phase result")
        await observe({ type: "structured-result", value: structuredOutput })
      }
      const admitted = await admit(
        response.sessionId,
        response.finalText,
        toolLines,
        structuredOutput,
      )
      if (admitted.text) await observe({ type: "text", text: admitted.text })
      const completion = await recorder.finish(admitted.phaseResult)
      return admitted.complete(completion)
    } finally {
      try {
        await usage?.close()
      } finally {
        if (schemaDirectory !== undefined)
          await rm(schemaDirectory, { recursive: true, force: true })
      }
    }
  } catch (error) {
    return { status: "failed", sessionId, reason: errorMessage(error) }
  } finally {
    recorder?.release()
  }
}

export function assistantDependencies(
  runtime: AssistantRuntime,
  output: PhaseOutput,
): Pick<RoundDependencies, "runPhase"> {
  return {
    runPhase: {
      audit: (input) => runAssistantPhase(input, output, runtime),
      vet: (input) => runAssistantPhase(input, output, runtime),
      rebut: (input) => runAssistantPhase(input, output, runtime),
      rule: (input) => runAssistantPhase(input, output, runtime),
      fix: (input) => runAssistantPhase(input, output, runtime),
      watch: (input) => runAssistantPhase(input, output, runtime),
      close: (input) => runAssistantPhase(input, output, runtime),
    },
  }
}
