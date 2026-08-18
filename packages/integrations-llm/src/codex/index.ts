export type {
  CodexSdkHostLaunch,
  CodexSdkHostProcess,
  CodexSdkHostProcessResult,
  CreateCodexLlmTextClientOptions,
} from "./sdk-host-client.js"
export { createCodexLlmTextClient } from "./sdk-host-client.js"
export type {
  CodexSdkHostProtocolFailure,
  CodexSdkHostRunResult,
} from "./sdk-host-protocol.js"
export type { TraceSink } from "./trace.js"

export function resolveCodexSdkHostEntryUrl(): URL {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js"
  return new URL(`./sdk-host-entry.${extension}`, import.meta.url)
}
