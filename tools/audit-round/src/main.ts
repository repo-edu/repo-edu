import { runCommand } from "./command.js"
import { createTerminal } from "./terminal.js"

const interruption = new AbortController()
const interrupt = () => interruption.abort(new Error("Interrupted"))
const outputFailed = (error: Error) => interruption.abort(error)
process.on("SIGINT", interrupt)
process.stdout.on("error", outputFailed)
try {
  process.exitCode = await runCommand(
    process.argv.slice(2),
    { cwd: process.cwd(), signal: interruption.signal },
    {
      terminal: createTerminal(),
      emergency: (text) => process.stderr.write(`${text}\n`),
    },
  )
} finally {
  process.off("SIGINT", interrupt)
  process.stdout.off("error", outputFailed)
}
