import { runCodexSdkHostServer } from "./sdk-host-server.js"

void runCodexSdkHostServer(process.stdin, process.stdout).catch((error) => {
  const text =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`[codex-sdk-host] ${text}\n`)
  process.exitCode = 1
})
