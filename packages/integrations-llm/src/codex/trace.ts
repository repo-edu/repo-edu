// Trace recorder for Codex turns. The Codex prompt/reply adapter disables
// tools, so the only assistant content of interest is `agent_message`. The
// shape mirrors the Claude trace recorder so consumers (e.g. the fixture
// engine's `_xtrace.md` writer) can use one TraceSink for both providers.

export type TraceSink = (text: string) => void

interface AgentMessageItem {
  type: string
  text?: string
}

export type CodexTraceRecorder = {
  recordAgentMessage(item: AgentMessageItem): void
  recordReasoning(item: AgentMessageItem): void
  recordError(message: string): void
}

export function createCodexTraceRecorder(
  sink: TraceSink | undefined,
): CodexTraceRecorder {
  if (!sink) {
    return {
      recordAgentMessage: () => {},
      recordReasoning: () => {},
      recordError: () => {},
    }
  }
  return {
    recordAgentMessage(item) {
      if (item.text) sink(`\n#### Assistant\n\n${item.text}`)
    },
    recordReasoning(item) {
      if (item.text) sink(`\n#### Reasoning\n\n${item.text}`)
    },
    recordError(message) {
      sink(`\n#### Error\n\n${message}`)
    },
  }
}
