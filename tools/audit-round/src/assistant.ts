import { decodeClaude } from "./claude.js"
import { type CliRuntime, readCliLines, withCliProcess } from "./cli-process.js"
import { decodeCodex } from "./codex.js"
import { CodexSessionReader, codexSessionsRoot } from "./codex-session.js"
import { errorMessage, type Feedback, type PhaseOutput } from "./feedback.js"
import { recordInteractiveSession } from "./interactive.js"
import type {
  Phase,
  PhaseInput,
  PhaseResult,
  RoundDependencies,
  SessionContext,
} from "./phase.js"
import { phaseResult } from "./phase-result.js"
import { phasePrompt, phaseRequest } from "./requests.js"

export type AssistantRuntime = CliRuntime & { readonly sessionsRoot?: string }

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
  prompt: string,
  output: PhaseOutput,
  runtime: AssistantRuntime,
  record?: (value: unknown) => Promise<void>,
): Promise<PhaseResult<P>>
export async function runAssistantInvocation(
  input: PhaseInput,
  prompt: string,
  output: PhaseOutput,
  runtime: AssistantRuntime,
  record?: (value: unknown) => Promise<void>,
): Promise<PhaseResult> {
  let sessionId = input.sessionId
  let finalText: string | undefined
  let completed = false
  let context: SessionContext | null = null
  /** The last measurement leaves the display, because the round resumes on it. */
  const observe = async (feedback: Feedback): Promise<void> => {
    if (feedback.type === "context")
      context = { tokens: feedback.tokens, window: feedback.window }
    await output.observe(feedback)
  }
  const usage =
    input.assistant === "codex"
      ? new CodexSessionReader(codexSessionsRoot(runtime))
      : undefined
  try {
    try {
      runtime.signal?.throwIfAborted()
      await output.start(input, prompt)
      if (sessionId !== null) await usage?.prepareResume(sessionId)
      const request = phaseRequest(
        input.assistant,
        input.cwd,
        sessionId,
        prompt,
      )
      const decode = input.assistant === "claude" ? decodeClaude : decodeCodex
      await withCliProcess(
        { ...runtime, cwd: input.cwd },
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
                if (completed)
                  throw new Error("CLI reported completion more than once")
                completed = true
              } else if (event.type === "final") {
                if (completed)
                  throw new Error("CLI reported final text after completion")
                finalText = event.text
              } else {
                await observe(event)
              }
            }
            await record?.(value)
          })
        },
        (text) => observe({ type: "diagnostic", text }),
      )
      if (!completed || sessionId === null || finalText === undefined)
        throw new Error(
          "CLI ended without a completed turn, session identity or final text",
        )
      await usage?.read(sessionId, observe, true)
      const result = phaseResult(input.phase, sessionId, finalText, context)
      await output.finish(result)
      return result
    } finally {
      await usage?.close()
    }
  } catch (error) {
    return { status: "failed", sessionId, reason: errorMessage(error) }
  } finally {
    output.release()
  }
}

export function assistantDependencies(
  runtime: AssistantRuntime,
  output: PhaseOutput,
  prepareHandover: RoundDependencies["prepareHandover"],
  recordInteractive: (feedback: Feedback) => Promise<void>,
): RoundDependencies {
  return {
    runPhase: {
      audit: (input) => runAssistantPhase(input, output, runtime),
      vet: (input) => runAssistantPhase(input, output, runtime),
      rebut: (input) => runAssistantPhase(input, output, runtime),
      fix: (input) => runAssistantPhase(input, output, runtime),
      brief: (input) => runAssistantPhase(input, output, runtime),
    },
    prepareHandover,
    openSession: (session) =>
      recordInteractiveSession(session, runtime, recordInteractive),
  }
}
