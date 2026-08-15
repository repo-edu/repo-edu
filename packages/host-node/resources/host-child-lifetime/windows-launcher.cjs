const { spawn } = require("node:child_process")
const { createReadStream, createWriteStream } = require("node:fs")
const { createInterface } = require("node:readline")

const protocolVersion = 2
const controlInput = createReadStream(null, { fd: 3, autoClose: false })
const controlOutput = createWriteStream(null, { fd: 4, autoClose: false })
const controlLines = createInterface({
  input: controlInput,
  crlfDelay: Infinity,
})

let targetAdmitted = false
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
    !isStringRecord(command.target.env) ||
    !(
      command.target.shell === undefined ||
      typeof command.target.shell === "boolean" ||
      typeof command.target.shell === "string"
    )
  ) {
    throw new Error("Invalid Windows launcher command.")
  }
  return command.target
}

function launchTarget(target) {
  const child = spawn(target.command, target.args, {
    cwd: target.cwd,
    env: target.env,
    shell: target.shell,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  let targetSettled = false
  let exited
  let exitReported = false
  let openOutputStreams = 2
  let terminalReported = false

  function maybeReportTerminal() {
    if (
      !exited ||
      !exitReported ||
      openOutputStreams !== 0 ||
      terminalReported
    ) {
      return
    }
    terminalReported = true
    writeControl({ kind: "terminal", ...exited }, () => {
      finish(0)
    })
  }

  function outputStreamClosed() {
    openOutputStreams -= 1
    maybeReportTerminal()
  }

  process.stdin.pipe(child.stdin)
  child.stdout.pipe(process.stdout, { end: false })
  child.stderr.pipe(process.stderr, { end: false })
  child.stdout.once("close", outputStreamClosed)
  child.stderr.once("close", outputStreamClosed)

  child.once("error", (error) => {
    if (targetSettled) {
      return
    }
    targetSettled = true
    fail(error)
  })
  child.once("spawn", () => {
    writeControl({ kind: "started" })
  })
  child.once("exit", (exitCode, signal) => {
    if (targetSettled) {
      return
    }
    targetSettled = true
    exited = { exitCode, signal }
    writeControl({ kind: "exited", ...exited }, () => {
      exitReported = true
      maybeReportTerminal()
    })
  })
}

controlLines.on("line", (line) => {
  if (targetAdmitted || settled) {
    fail(new Error("The Windows launcher accepts exactly one target."))
    return
  }
  targetAdmitted = true
  try {
    launchTarget(parseLaunchCommand(line))
  } catch (error) {
    fail(error)
  }
})

controlLines.once("close", () => {
  if (!targetAdmitted && !settled) {
    finish(0)
  }
})

writeControl({
  kind: "ready",
  protocolVersion,
  runtime: "node",
})
