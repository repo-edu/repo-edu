import { spawn } from "node:child_process"
import { stopSignals } from "./cli-process.js"
import { runCommand } from "./command.js"
import { createPager } from "./pager.js"
import { macRulingDialog } from "./ruling-wait.js"
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
// A closed terminal fails every later write to both streams. An unobserved
// failure would end the process before the run's ending lands, and a write's
// failure can arrive after the command returns, so these listeners stay.
const outputFailed = (error: Error) => interruption.abort(error)
process.stdout.on("error", outputFailed)
process.stderr.on("error", outputFailed)
for (const signal of stopSignals) process.on(signal, interrupt)
try {
  process.exitCode = await runCommand(
    process.argv.slice(2),
    { cwd: process.cwd(), signal: interruption.signal },
    {
      terminal: createTerminal(),
      pager: createPager(),
      // Linux shows no dialog; the printed notice alone asks for the ruling.
      dialog: process.platform === "darwin" ? macRulingDialog : undefined,
      emergency: (text) => process.stderr.write(`${text}\n`),
    },
  )
} finally {
  for (const signal of stopSignals) process.off(signal, interrupt)
}
