import { setTimeout } from "node:timers/promises"
import type { AssistantRuntime } from "./assistant.js"
import { openAssistantSession } from "./cli-process.js"
import { CodexSessionReader, codexSessionsRoot } from "./codex-session.js"
import { decodeCodexSessionFeedback } from "./codex-session-feedback.js"
import type { Feedback } from "./feedback.js"
import type { InteractiveSession } from "./phase.js"

/** The interactive process and its recording settle together, including the final append. */
export async function recordInteractiveSession(
  session: InteractiveSession,
  runtime: AssistantRuntime,
  observe: (feedback: Feedback) => Promise<void>,
): Promise<void> {
  if (session.assistant !== "codex")
    throw new Error("Only Codex fixes have an interactive round continuation")
  const reader = new CodexSessionReader(
    codexSessionsRoot(runtime),
    decodeCodexSessionFeedback,
  )
  try {
    runtime.signal?.throwIfAborted()
    await reader.prepareResume(session.sessionId)
    await openAssistantSession(session, runtime, async (stopped) => {
      while (true) {
        // Observe process settlement before the read, so the final read covers its last write.
        const final = stopped.aborted
        await reader.read(session.sessionId, observe, final)
        if (final) return
        try {
          await setTimeout(200, undefined, { signal: stopped })
        } catch (error) {
          if (!stopped.aborted) throw error
        }
      }
    })
  } finally {
    await reader.close()
  }
}
