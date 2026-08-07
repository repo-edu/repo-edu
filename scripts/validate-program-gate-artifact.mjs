import { spawn } from "node:child_process"
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

const conflictMessage = "Another Repo Edu program is running"
const marker = "repo-edu-program-gate-artifact"
const probeEnvironmentVariable = "REPO_EDU_PROGRAM_GATE_ARTIFACT_PROBE"
const processTimeoutMs = 30_000

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function withTimeout(promise, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error(`${label} timed out.`))
    }, processTimeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolvePromise(value)
      },
      (error) => {
        clearTimeout(timeout)
        rejectPromise(error)
      },
    )
  })
}

function parseMarker(stdout) {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line)
      if (
        value &&
        typeof value === "object" &&
        value.marker === marker &&
        (value.state === "busy" || value.state === "held")
      ) {
        return value.state
      }
    } catch {
      // Ignore unrelated runtime output and incomplete lines.
    }
  }
  return undefined
}

function launchArtifact(artifact, root) {
  const child = spawn(artifact.command, artifact.arguments ?? [], {
    env: {
      ...process.env,
      REPO_EDU_STORAGE_ROOT: root,
      [probeEnvironmentVariable]: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")

  const output = { stdout: "", stderr: "" }
  let markerSettled = false
  let resolveMarker
  let rejectMarker
  const markerPromise = new Promise((resolvePromise, rejectPromise) => {
    resolveMarker = resolvePromise
    rejectMarker = rejectPromise
  })

  child.stdout.on("data", (chunk) => {
    output.stdout += chunk
    const state = parseMarker(output.stdout)
    if (state && !markerSettled) {
      markerSettled = true
      resolveMarker(state)
    }
  })
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk
  })

  const exitPromise = new Promise((resolveExit, rejectExit) => {
    child.once("error", (error) => {
      if (!markerSettled) {
        markerSettled = true
        rejectMarker(error)
      }
      rejectExit(error)
    })
    child.once("close", (code, signal) => {
      if (!markerSettled) {
        markerSettled = true
        rejectMarker(
          new Error(
            `${artifact.label} exited before its marker: ${output.stderr.trim() || output.stdout.trim() || "<no output>"}`,
          ),
        )
      }
      resolveExit({ code, signal })
    })
  })

  return {
    artifact,
    child,
    output,
    marker: withTimeout(markerPromise, `${artifact.label} marker`),
    exit: withTimeout(exitPromise, `${artifact.label} exit`),
  }
}

async function stopArtifact(running) {
  running.child.kill()
  try {
    await running.exit
  } catch {
    // Preserve the failure that required cleanup.
  }
}

async function startHolder(artifact, root) {
  const running = launchArtifact(artifact, root)
  try {
    const state = await running.marker
    if (state !== "held") {
      throw new Error(`${artifact.label} reported ${state} instead of held.`)
    }
    return running
  } catch (error) {
    await stopArtifact(running)
    throw error
  }
}

async function releaseHolder(running) {
  running.child.stdin.end("release\n")
  const result = await running.exit
  if (result.code !== 0) {
    throw new Error(
      `${running.artifact.label} normal release exited with ${result.code ?? result.signal ?? "unknown"}: ${running.output.stderr.trim() || running.output.stdout.trim() || "<no output>"}`,
    )
  }
}

async function killHolder(running) {
  running.child.kill()
  await running.exit
}

async function requireBusy(artifact, root) {
  const contender = launchArtifact(artifact, root)
  try {
    const state = await contender.marker
    if (state !== "busy") {
      throw new Error(`${artifact.label} reported ${state} instead of busy.`)
    }
    const result = await contender.exit
    if (result.code === 0) {
      throw new Error(`${artifact.label} accepted an already-held program gate.`)
    }
    if (!contender.output.stderr.includes(conflictMessage)) {
      throw new Error(
        `${artifact.label} did not report the generic program conflict: ${contender.output.stderr.trim() || "<no stderr>"}`,
      )
    }
  } catch (error) {
    await stopArtifact(contender)
    throw error
  }
}

function isBusyError(error) {
  if (!(error instanceof Error)) {
    return false
  }
  if ("code" in error && error.code === "SQLITE_BUSY") {
    return true
  }
  return "errcode" in error && (error.errcode & 0xff) === 5
}

async function claimFromProof(root) {
  await mkdir(root, { recursive: true })
  const connection = new DatabaseSync(join(root, "program-gate.db"), {
    timeout: 0,
  })
  try {
    connection.exec("PRAGMA busy_timeout = 0")
    connection.exec("BEGIN EXCLUSIVE")
  } catch (error) {
    connection.close()
    if (isBusyError(error)) {
      return { status: "busy" }
    }
    throw error
  }
  return {
    status: "held",
    release() {
      connection.close()
    },
  }
}

async function requireProofCanClaim(root, label) {
  const claim = await claimFromProof(root)
  if (claim.status !== "held") {
    throw new Error(`The proof connection could not claim after ${label}.`)
  }
  claim.release()
}

async function validateDesktopOnly(desktop, root) {
  const proofOwner = await claimFromProof(root)
  if (proofOwner.status !== "held") {
    throw new Error("The proof connection could not acquire the initial gate.")
  }
  try {
    await requireBusy(desktop, root)
  } finally {
    proofOwner.release()
  }

  const normalHolder = await startHolder(desktop, root)
  const proofContender = await claimFromProof(root)
  if (proofContender.status !== "busy") {
    proofContender.release()
    await stopArtifact(normalHolder)
    throw new Error("The proof connection acquired the desktop-held gate.")
  }
  await releaseHolder(normalHolder)
  await requireProofCanClaim(root, "normal desktop exit")

  const deathHolder = await startHolder(desktop, root)
  await killHolder(deathHolder)
  await requireProofCanClaim(root, "desktop process death")
}

async function validateCliOnly(cli, root) {
  const normalHolder = await startHolder(cli, root)
  await requireBusy(cli, root)
  await releaseHolder(normalHolder)

  const successor = await startHolder(cli, root)
  await releaseHolder(successor)

  const deathHolder = await startHolder(cli, root)
  await killHolder(deathHolder)
  const deathSuccessor = await startHolder(cli, root)
  await releaseHolder(deathSuccessor)
}

async function validateCrossProgram(owner, contender, root) {
  const holder = await startHolder(owner, root)
  try {
    await requireBusy(contender, root)
  } finally {
    await releaseHolder(holder)
  }
}

export async function validateProgramGateArtifacts(options) {
  if (!options.desktop && !options.cli) {
    throw new Error("At least one desktop or CLI artifact is required.")
  }
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "repo-edu-program-gate-artifact-")),
  )
  try {
    if (options.desktop) {
      await validateDesktopOnly(options.desktop, root)
      process.stdout.write(`PASS ${options.desktop.label} program gate\n`)
    }
    if (options.cli) {
      await validateCliOnly(options.cli, root)
      process.stdout.write(`PASS ${options.cli.label} program gate\n`)
    }
    if (options.desktop && options.cli) {
      await validateCrossProgram(options.desktop, options.cli, root)
      await validateCrossProgram(options.cli, options.desktop, root)
      process.stdout.write("PASS desktop and CLI cross-program gate\n")
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument !== "--desktop" && argument !== "--cli") {
      throw new Error(
        "Usage: node scripts/validate-program-gate-artifact.mjs [--desktop <executable>] [--cli <executable>]",
      )
    }
    const executable = argv[index + 1]
    if (!executable) {
      throw new Error(`${argument} requires an executable path.`)
    }
    index += 1
    const command = resolve(executable)
    options[argument.slice(2)] = {
      command,
      label: basename(command),
    }
  }
  return options
}

async function main() {
  await validateProgramGateArtifacts(parseArguments(process.argv.slice(2)))
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    process.stderr.write(`FAIL program gate\n  ${errorText(error)}\n`)
    process.exitCode = 1
  })
}
