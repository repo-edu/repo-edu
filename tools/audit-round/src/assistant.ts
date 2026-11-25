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
  PhaseInput,
  PhaseResult,
  RoundDependencies,
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
  roundReportContract,
  structuredPhaseResult,
  usesClosingNote,
} from "./phase-result-schema.js"
import {
  type AssistantPrompt,
  phasePrompt,
  phaseRequest,
  rulerSourceRequest,
} from "./requests.js"
import { unopenedSources } from "./ruler-report.js"

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
  return runAssistantTurn(
    input,
    prompt,
    output,
    runtime,
    (sessionId, finalText, structuredOutput) => {
      if (usesClosingNote(input.phase)) {
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
  )
}

async function runAssistantTurn(
  input: AssistantTurnInput,
  prompt: AssistantPrompt,
  output: PhaseOutput,
  runtime: AssistantRuntime,
  admit: (
    sessionId: string,
    finalText: string | undefined,
    structuredOutput: unknown,
  ) => {
    readonly phaseResult: PhaseControlResult
    readonly text?: string
    readonly complete: (completion: PhaseCompletion) => PhaseResult
  },
  record?: (value: unknown) => Promise<void>,
): Promise<PhaseResult> {
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
  const notePhase = usesClosingNote(input.phase) ? input.phase : null
  const report = roundReportContract(input)
  const schema =
    report?.schema ?? (notePhase === null ? undefined : outputSchema(notePhase))
  const codexStructured = input.assistant === "codex" && schema !== undefined
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
              if (codexStructured && finalText !== undefined) {
                const note =
                  notePhase === null
                    ? undefined
                    : closingNote(notePhase, decodeCodexMessage(finalText))
                await observe({ type: "text", text: note ?? finalText })
              }
              finalText = event.text
              structuredOutput = event.structuredOutput
            } else if (!codexStructured || event.type !== "text") {
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
    return {
      sessionId,
      finalText,
      structuredOutput:
        codexStructured && finalText !== undefined
          ? decodeCodexMessage(finalText)
          : structuredOutput,
    }
  }
  try {
    try {
      runtime.signal?.throwIfAborted()
      recorder = await output.start(input, prompt.log)
      if (sessionId !== null) await usage?.prepareResume(sessionId)
      let schemaArgument = schema
      if (codexStructured) {
        schemaDirectory = await mkdtemp(join(tmpdir(), "audit-round-schema-"))
        schemaArgument = join(schemaDirectory, "result.json")
        await writeFile(schemaArgument, schema as string, "utf8")
      }
      // The model can leave the line off a finished response. The session is
      // asked once to end again, which repeats no phase work; a second
      // response without the line fails the phase as any other does.
      let response = await respond(prompt.text, schemaArgument)
      if (
        schema === undefined &&
        prompt.resultRequest !== undefined &&
        response.finalText !== undefined &&
        !hasPhaseResult(response.finalText)
      ) {
        await observe({
          type: "diagnostic",
          text: "The response ended without its PHASE RESULT line. Asking the session once to end with it.",
        })
        response = await respond(prompt.resultRequest)
      }
      const readStructured = async (
        ending: typeof response,
      ): Promise<unknown> => {
        if (ending.structuredOutput === undefined)
          throw new Error("CLI ended without a structured phase result")
        await observe({
          type: "structured-result",
          value: ending.structuredOutput,
        })
        return ending.structuredOutput
      }
      if (report !== undefined) {
        const read = async (ending: typeof response) =>
          report.read(ending.sessionId, await readStructured(ending))
        const missed = (answer: Awaited<ReturnType<typeof read>>) =>
          "reading" in answer.result
            ? unopenedSources(
                answer.result.reading.sources,
                toolLines,
                prompt.supplied,
              )
            : []
        let answer = await read(response)
        const unopened = missed(answer)
        if (unopened.length > 0) {
          await observe({
            type: "diagnostic",
            text: "The ruler report names sources the session did not open. Sending the session back once to open them.",
          })
          answer = await read(
            await respond(rulerSourceRequest(input, unopened), schemaArgument),
          )
          const remaining = missed(answer)
          if (remaining.length > 0)
            throw new Error(
              `The ruler report names sources its session did not open: ${remaining.join(", ")}`,
            )
        }
        if ("text" in answer) {
          await writeFile(report.file, `${answer.text}\n`, "utf8")
          await observe({ type: "text", text: answer.text })
        }
        await recorder.finish(answer.result)
        return answer.result
      }
      const admitted = await admit(
        response.sessionId,
        response.finalText,
        schema === undefined ? undefined : await readStructured(response),
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
