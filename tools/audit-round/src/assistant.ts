import { homedir } from "node:os"
import { join } from "node:path"
import { decodeClaude } from "./claude.js"
import {
  type CliRuntime,
  openAssistantSession,
  readCliLines,
  withCliProcess,
} from "./cli-process.js"
import { decodeCodex } from "./codex.js"
import { CodexUsageReader } from "./codex-usage.js"
import { errorMessage, type PhaseOutput } from "./feedback.js"
import type {
  Phase,
  PhaseInput,
  PhaseResult,
  RoundDependencies,
} from "./phase.js"
import { phaseResult } from "./phase-result.js"
import { phasePrompt, phaseRequest } from "./requests.js"

export type AssistantRuntime = CliRuntime & { readonly sessionsRoot?: string }

export function runAssistantPhase<P extends Phase>(
  input: PhaseInput<P>,
  output: PhaseOutput,
  runtime: AssistantRuntime,
): Promise<PhaseResult<P>>
export async function runAssistantPhase(
  input: PhaseInput,
  output: PhaseOutput,
  runtime: AssistantRuntime,
): Promise<PhaseResult> {
  let sessionId = input.sessionId
  let finalText: string | undefined
  let completed = false
  const usage =
    input.assistant === "codex"
      ? new CodexUsageReader(
          runtime.sessionsRoot ??
            join(
              runtime.env?.CODEX_HOME ??
                process.env.CODEX_HOME ??
                join(homedir(), ".codex"),
              "sessions",
            ),
        )
      : undefined
  try {
    try {
      const prompt = phasePrompt(input)
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
            if (sessionId !== null) await usage?.read(sessionId, output.observe)
            for (const event of decode(JSON.parse(line))) {
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
                await output.observe(event)
              }
            }
          })
        },
        (text) => output.observe({ type: "diagnostic", text }),
      )
      if (!completed || sessionId === null || finalText === undefined)
        throw new Error(
          "CLI ended without a completed turn, session identity or final text",
        )
      await usage?.read(sessionId, output.observe, true)
      const result = phaseResult(input.phase, sessionId, finalText)
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
): RoundDependencies {
  return {
    runPhase: {
      audit: (input) => runAssistantPhase(input, output, runtime),
      vet: (input) => runAssistantPhase(input, output, runtime),
      rebut: (input) => runAssistantPhase(input, output, runtime),
      fix: (input) => runAssistantPhase(input, output, runtime),
    },
    prepareHandover,
    openSession: (session) => openAssistantSession(session, runtime),
  }
}
