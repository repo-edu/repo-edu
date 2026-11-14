import { writeFile } from "node:fs/promises"
import { decodeClaude } from "./claude.js"
import { type CliRuntime, readCliLines, withCliProcess } from "./cli-process.js"
import { decodeCodex } from "./codex.js"
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
} from "./phase.js"
import {
  hasPhaseResult,
  phaseResult,
  watchOutput,
  withoutPhaseResult,
} from "./phase-result.js"
import { type AssistantPrompt, phasePrompt, phaseRequest } from "./requests.js"

export type AssistantRuntime = CliRuntime & { readonly sessionsRoot?: string }

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
    async (sessionId, finalText) => {
      const result = phaseResult(input.phase, sessionId, finalText)
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

async function runAssistantTurn<T>(
  input: AssistantTurnInput,
  prompt: AssistantPrompt,
  output: PhaseOutput,
  runtime: AssistantRuntime,
  admit: (
    sessionId: string,
    finalText: string,
  ) => Promise<{
    readonly phaseResult: PhaseControlResult
    readonly complete: (completion: PhaseCompletion) => T
  }>,
  record?: (value: unknown) => Promise<void>,
): Promise<T | PhaseFailure> {
  let sessionId = input.sessionId
  let recorder: PhaseRecorder | undefined
  const observe = async (feedback: Feedback): Promise<void> => {
    if (recorder === undefined)
      throw new Error("Phase feedback arrived before its phase started")
    await recorder.observe(feedback)
  }
  const usage =
    input.assistant === "codex"
      ? new CodexSessionReader(codexSessionsRoot(runtime))
      : undefined
  const decode = input.assistant === "claude" ? decodeClaude : decodeCodex
  /**
   * One CLI process on the session. A session is one or more turns and ends
   * with its process; the response is the last finished turn's text.
   */
  const respond = async (text: string) => {
    let finalText: string | undefined
    let turns = 0
    const request = phaseRequest(input, sessionId, text)
    await withCliProcess(
      { ...runtime, cwd: input.cwd, openContests: openContests(input) },
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
              finalText = event.text
            } else {
              await observe(event)
            }
          }
          await record?.(value)
        })
      },
      (diagnostic) => observe({ type: "diagnostic", text: diagnostic }),
    )
    if (turns === 0 || sessionId === null || finalText === undefined)
      throw new Error(
        "CLI ended without a completed turn, session identity or final text",
      )
    await usage?.read(sessionId, observe, true)
    return { sessionId, finalText }
  }
  try {
    try {
      runtime.signal?.throwIfAborted()
      recorder = await output.start(input, prompt.log)
      if (sessionId !== null) await usage?.prepareResume(sessionId)
      let response = await respond(prompt.text)
      // The model can leave the line off a finished response. The session is
      // asked once to end again, which repeats no phase work; a second
      // response without the line fails the phase as any other does.
      if (
        prompt.resultRequest !== undefined &&
        !hasPhaseResult(response.finalText)
      ) {
        await observe({
          type: "diagnostic",
          text: "The response ended without its PHASE RESULT line. Asking the session once to end with it.",
        })
        response = await respond(prompt.resultRequest)
      }
      const admitted = await admit(response.sessionId, response.finalText)
      const completion = await recorder.finish(admitted.phaseResult)
      return admitted.complete(completion)
    } finally {
      await usage?.close()
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
      fix: (input) => runAssistantPhase(input, output, runtime),
      watch: (input) => runAssistantPhase(input, output, runtime),
      close: (input) => runAssistantPhase(input, output, runtime),
    },
  }
}
