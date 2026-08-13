export type {
  CodexHelperLaunch,
  CodexHelperProcess,
  CodexHelperProcessResult,
  CreateCodexLlmTextClientOptions,
} from "./helper-client.js"
export { createCodexLlmTextClient } from "./helper-client.js"
export type { TraceSink } from "./trace.js"

export function resolveCodexManagedHelperEntryUrl(): URL {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js"
  return new URL(`./helper-entry.${extension}`, import.meta.url)
}
