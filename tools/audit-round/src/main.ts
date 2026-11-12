import { spawn } from "node:child_process"
import { runCommand } from "./command.js"
import { createTerminal } from "./terminal.js"

// An unattended run must outlive the display's sleep on battery too, and
// `-w` ends the hold with this process however it exits.
if (process.platform === "darwin") {
  spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" })
    .on("error", (error) =>
      process.stderr.write(
        `audit-round: cannot keep the Mac awake: ${error.message}\n`,
      ),
    )
    .unref()
}

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
