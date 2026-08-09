const { spawn } = require("node:child_process")
const { createReadStream, createWriteStream } = require("node:fs")
const { createInterface } = require("node:readline")

const protocolVersion = 1
const controlInput = createReadStream(null, { fd: 3, autoClose: false })
const controlOutput = createWriteStream(null, { fd: 4, autoClose: false })
const controlLines = createInterface({
  input: controlInput,
  crlfDelay: Infinity,
})

let targetStarted = false
let settled = false

function writeControl(message, callback) {
  controlOutput.write(`${JSON.stringify(message)}\n`, callback)
}

function finish(exitCode) {
  if (settled) {
    return
  }
  settled = true
  controlLines.close()
  controlOutput.end(() => {
    process.exitCode = exitCode
  })
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error)
  writeControl({ kind: "failure", message }, () => {
    process.stderr.write(`Windows launcher failure: ${message}\n`)
    finish(1)
  })
}

function isStringRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  )
}

function parseLaunchCommand(line) {
  const command = JSON.parse(line)
  if (
    !command ||
    command.kind !== "launch" ||
    command.protocolVersion !== protocolVersion ||
    !command.target ||
    typeof command.target.command !== "string" ||
    !Array.isArray(command.target.args) ||
    !command.target.args.every((argument) => typeof argument === "string") ||
    !(
      command.target.cwd === undefined ||
      typeof command.target.cwd === "string"
    ) ||
    !isStringRecord(command.target.env)
  ) {
    throw new Error("Invalid Windows launcher command.")
  }
  return command.target
}

function launchTarget(target) {
  const child = spawn(target.command, target.args, {
    cwd: target.cwd,
    env: target.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  let terminalReported = false

  process.stdin.pipe(child.stdin)
  child.stdout.pipe(process.stdout, { end: false })
  child.stderr.pipe(process.stderr, { end: false })

  child.once("error", (error) => {
    if (terminalReported) {
      return
    }
    terminalReported = true
    fail(error)
  })
  child.once("close", (exitCode, signal) => {
    if (terminalReported) {
      return
    }
    terminalReported = true
    writeControl({ kind: "terminal", exitCode, signal }, () => {
      finish(0)
    })
  })
}

controlLines.on("line", (line) => {
  if (targetStarted || settled) {
    fail(new Error("The Windows launcher accepts exactly one target."))
    return
  }
  targetStarted = true
  try {
    launchTarget(parseLaunchCommand(line))
  } catch (error) {
    fail(error)
  }
})

controlLines.once("close", () => {
  if (!targetStarted && !settled) {
    finish(0)
  }
})

writeControl({
  kind: "ready",
  protocolVersion,
  runtime: "node",
})
