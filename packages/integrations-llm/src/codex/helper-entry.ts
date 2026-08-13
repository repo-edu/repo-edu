import { runCodexHelperServer } from "./helper-server.js"

void runCodexHelperServer(process.stdin, process.stdout).catch((error) => {
  const text =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`[codex-helper] ${text}\n`)
  process.exitCode = 1
})
