import { fileURLToPath } from "node:url"
import { Argument, Command, CommanderError } from "commander"
import { checkRepoRoot } from "./command.js"
import { recordContracts } from "./contract.js"
import { errorMessage } from "./feedback.js"
import type { Assistant } from "./phase.js"
import { createTerminal } from "./terminal.js"

const command = new Command("audit-round:contract")
  .description(
    "Record the TypeScript runner's CLI contracts with trivial live shell probes.",
  )
  .addArgument(
    new Argument("[assistant]", "assistant to record")
      .choices(["claude", "codex", "both"])
      .default("both"),
  )
  .exitOverride()
const terminal = createTerminal()
try {
  command.parse()
  await recordContracts(
    (command.args[0] as Assistant | "both") ?? "both",
    { cwd: await checkRepoRoot(process.cwd()) },
    fileURLToPath(new URL("./__tests__/fixtures/", import.meta.url)),
    terminal,
  )
} catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode
  else {
    process.stderr.write(`Contract check failed: ${errorMessage(error)}\n`)
    process.exitCode = 1
  }
} finally {
  terminal.clear()
}
