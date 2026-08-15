const { appendFileSync, createReadStream, createWriteStream } = require("node:fs")
const { createInterface } = require("node:readline")

const mode = process.env.REPO_EDU_WINDOWS_LAUNCHER_STALL
const markerPath = process.env.REPO_EDU_WINDOWS_LAUNCHER_STALL_MARKER

if (mode === undefined || markerPath === undefined) {
  throw new Error("The stalled Windows launcher is missing its test settings.")
}

const controlInput = createReadStream(null, { fd: 3, autoClose: false })
const controlOutput = createWriteStream(null, { fd: 4, autoClose: false })
const keepAlive = setInterval(() => undefined, 1_000)

function mark(value) {
  appendFileSync(markerPath, `${value}\n`)
}

function exitWhenTargetInputCloses() {
  process.stdin.resume()
  process.stdin.once("end", () => {
    clearInterval(keepAlive)
    controlOutput.end(() => {
      process.exitCode = 0
    })
  })
}

controlOutput.on("error", () => undefined)

if (mode === "readiness") {
  mark("readiness-pending")
} else if (mode === "target-start") {
  const controlLines = createInterface({
    input: controlInput,
    crlfDelay: Infinity,
  })
  controlLines.once("line", () => {
    mark("target-start-pending")
    exitWhenTargetInputCloses()
  })
  controlOutput.write(
    `${JSON.stringify({ kind: "ready", protocolVersion: 2, runtime: "node" })}\n`,
  )
} else {
  throw new Error(`Unknown stalled Windows launcher mode: ${mode}`)
}
