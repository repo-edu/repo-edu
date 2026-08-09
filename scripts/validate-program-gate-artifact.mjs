import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

const conflictMessage = "Another Repo Edu program is running"
const marker = "repo-edu-program-gate-artifact"
const probeEnvironmentVariable = "REPO_EDU_PROGRAM_GATE_ARTIFACT_PROBE"
const probeReleaseEnvironmentVariable =
  "REPO_EDU_PROGRAM_GATE_ARTIFACT_PROBE_RELEASE"
const processTimeoutMs = 30_000
const cleanupTimeoutMs = 5_000
const maximumBusyClaimDurationMs = 2_000

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function withTimeout(promise, label, timeoutMs = processTimeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error(`${label} timed out.`))
    }, timeoutMs)
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
        return {
          state: value.state,
          claimDurationMs: value.claimDurationMs,
        }
      }
    } catch {
      // Ignore unrelated runtime output and incomplete lines.
    }
  }
  return undefined
}

function launchArtifact(artifact, root) {
  const releasePath = join(root, `program-gate-release-${randomUUID()}`)
  const child = spawn(artifact.command, artifact.arguments ?? [], {
    env: {
      ...process.env,
      REPO_EDU_STORAGE_ROOT: root,
      [probeEnvironmentVariable]: "1",
      [probeReleaseEnvironmentVariable]: releasePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
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
    releasePath,
    marker: markerPromise,
    exit: exitPromise,
  }
}

function isArtifactRunning(running) {
  return running.child.exitCode === null && running.child.signalCode === null
}

async function readArtifactMarker(running) {
  const report = await withTimeout(
    running.marker,
    `${running.artifact.label} marker`,
  )
  if (
    typeof report.claimDurationMs !== "number" ||
    !Number.isFinite(report.claimDurationMs) ||
    report.claimDurationMs < 0
  ) {
    throw new Error(
      `${running.artifact.label} reported an invalid gate-claim duration.`,
    )
  }
  return report
}

async function waitForArtifactExit(running, label) {
  return await withTimeout(running.exit, `${running.artifact.label} ${label}`)
}

async function stopArtifact(running) {
  if (isArtifactRunning(running)) {
    running.child.kill()
  }
  try {
    await withTimeout(
      running.exit,
      `${running.artifact.label} cleanup`,
      cleanupTimeoutMs,
    )
  } catch {
    if (isArtifactRunning(running)) {
      running.child.kill("SIGKILL")
    }
    running.child.stdout.destroy()
    running.child.stderr.destroy()
  }
}

async function startHolder(artifact, root) {
  const running = launchArtifact(artifact, root)
  try {
    const report = await readArtifactMarker(running)
    if (report.state !== "held") {
      throw new Error(
        `${artifact.label} reported ${report.state} instead of held.`,
      )
    }
    return running
  } catch (error) {
    await stopArtifact(running)
    throw error
  }
}

async function withHolder(artifact, root, operation) {
  const holder = await startHolder(artifact, root)
  try {
    return await operation(holder)
  } finally {
    await stopArtifact(holder)
  }
}

async function releaseHolder(running) {
  await writeFile(running.releasePath, "", { flag: "wx" })
  const result = await waitForArtifactExit(running, "normal release")
  if (result.code !== 0) {
    throw new Error(
      `${running.artifact.label} normal release exited with ${result.code ?? result.signal ?? "unknown"}: ${running.output.stderr.trim() || running.output.stdout.trim() || "<no output>"}`,
    )
  }
}

async function killHolder(running) {
  running.child.kill()
  await waitForArtifactExit(running, "process death")
}

async function requireBusy(artifact, root) {
  const contender = launchArtifact(artifact, root)
  try {
    const report = await readArtifactMarker(contender)
    if (report.state !== "busy") {
      throw new Error(
        `${artifact.label} reported ${report.state} instead of busy.`,
      )
    }
    if (report.claimDurationMs > maximumBusyClaimDurationMs) {
      throw new Error(
        `${artifact.label} took ${report.claimDurationMs.toFixed(0)}ms to refuse the held gate; maximum is ${maximumBusyClaimDurationMs}ms.`,
      )
    }
    const result = await waitForArtifactExit(contender, "busy refusal")
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

  await withHolder(desktop, root, async (normalHolder) => {
    const proofContender = await claimFromProof(root)
    if (proofContender.status !== "busy") {
      proofContender.release()
      throw new Error("The proof connection acquired the desktop-held gate.")
    }
    await releaseHolder(normalHolder)
  })
  await requireProofCanClaim(root, "normal desktop exit")

  await withHolder(desktop, root, async (deathHolder) => {
    await killHolder(deathHolder)
    await requireProofCanClaim(root, "desktop process death")
  })
}

async function validateCliOnly(cli, root) {
  await withHolder(cli, root, async (normalHolder) => {
    await requireBusy(cli, root)
    await releaseHolder(normalHolder)
  })

  await withHolder(cli, root, async (successor) => {
    await releaseHolder(successor)
  })

  await withHolder(cli, root, async (deathHolder) => {
    await killHolder(deathHolder)
    await withHolder(cli, root, async (deathSuccessor) => {
      await releaseHolder(deathSuccessor)
    })
  })
}

async function validateCrossProgram(owner, contender, root) {
  await withHolder(owner, root, async (holder) => {
    await requireBusy(contender, root)
    await releaseHolder(holder)
  })
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
