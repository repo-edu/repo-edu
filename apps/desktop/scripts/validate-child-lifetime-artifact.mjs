import { spawn } from "node:child_process"
import { access, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import {
  findPackagedElectronExecutable,
  packagedElectronExecutableCandidates,
} from "./packaged-electron-executable.mjs"

const marker = "repo-edu-child-lifetime-artifact"
const probeEnvironmentVariable = "REPO_EDU_CHILD_LIFETIME_ARTIFACT_PROBE"
const probeFixtureEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_FIXTURE"
const probeMarkerEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_MARKER"
const probeRuntimeEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_RUNTIME"
const compiledCliEnvironmentVariable =
  "REPO_EDU_PROGRAM_GATE_CLI_ARTIFACT"
const timeoutMs = 60_000
const desktopRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(desktopRoot, "../..")
const fixturePath = join(
  repoRoot,
  "packages/host-node/src/__tests__/fixtures/child-process-tree.cjs",
)
const desktopDevelopmentEntry = join(desktopRoot, "out/main/main.js")
const cliDevelopmentEntry = join(repoRoot, "apps/cli/src/main.ts")
const requireFromScript = createRequire(import.meta.url)

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function parseReport(stdout) {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line)
      if (value?.marker === marker) {
        return value
      }
    } catch {
      // Ignore unrelated runtime output and incomplete lines.
    }
  }
  return undefined
}

function runtimeArguments(...arguments_) {
  return process.platform === "linux"
    ? ["--no-sandbox", ...arguments_]
    : arguments_
}

async function runProbe(specification) {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-child-lifetime-artifact-"))
  const markerPath = join(root, "tree.txt")
  const environment = {
    ...process.env,
    REPO_EDU_STORAGE_ROOT: join(root, "storage"),
    [probeEnvironmentVariable]: "1",
    [probeFixtureEnvironmentVariable]: fixturePath,
    [probeMarkerEnvironmentVariable]: markerPath,
    [probeRuntimeEnvironmentVariable]: process.execPath,
  }
  delete environment.ELECTRON_RUN_AS_NODE

  try {
    const child = spawn(specification.command, specification.arguments ?? [], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")

    const output = { stdout: "", stderr: "" }
    child.stdout.on("data", (chunk) => {
      output.stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      output.stderr += chunk
    })

    await new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        child.kill()
        rejectPromise(new Error(`${specification.label} timed out.`))
      }, timeoutMs)
      child.once("error", (error) => {
        clearTimeout(timeout)
        rejectPromise(error)
      })
      child.once("close", (code, signal) => {
        clearTimeout(timeout)
        if (code !== 0 || signal !== null) {
          rejectPromise(
            new Error(
              `${specification.label} exited with ${code ?? signal ?? "unknown"}: ${output.stderr.trim() || output.stdout.trim() || "<no output>"}`,
            ),
          )
          return
        }
        resolvePromise()
      })
    })

    const report = parseReport(output.stdout)
    if (!report) {
      throw new Error(
        `${specification.label} did not report its result: ${output.stderr.trim() || output.stdout.trim() || "<no output>"}`,
      )
    }
    if (report.host !== specification.host) {
      throw new Error(
        `${specification.label} reported host ${String(report.host)}; expected ${specification.host}.`,
      )
    }
    if (report.runtime !== specification.runtime) {
      throw new Error(
        `${specification.label} reported runtime ${String(report.runtime)}; expected ${specification.runtime}.`,
      )
    }
    if (
      specification.isPackaged !== undefined &&
      report.isPackaged !== specification.isPackaged
    ) {
      throw new Error(
        `${specification.label} reported isPackaged=${String(report.isPackaged)}; expected ${String(specification.isPackaged)}.`,
      )
    }
    if (
      report.platform !== process.platform ||
      report.architecture !== process.arch
    ) {
      throw new Error(
        `${specification.label} reported ${String(report.platform)}-${String(report.architecture)}; expected ${process.platform}-${process.arch}.`,
      )
    }
    if (
      !report.claims ||
      Object.values(report.claims).some((passed) => passed !== true)
    ) {
      throw new Error(
        `${specification.label} reported a failed claim: ${JSON.stringify(report)}`,
      )
    }

    process.stdout.write(`PASS ${specification.label} (${process.arch})\n`)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

async function requiredPackagedElectronExecutable() {
  const executable = await findPackagedElectronExecutable()
  if (!executable) {
    throw new Error(
      `No packaged Electron executable was found. Checked: ${packagedElectronExecutableCandidates().join(", ")}`,
    )
  }
  return executable
}

function compiledCliArtifact() {
  const artifact = process.env[compiledCliEnvironmentVariable]?.trim()
  if (!artifact) {
    if (
      process.env.CI === "true" &&
      (process.platform === "darwin" || process.platform === "linux")
    ) {
      throw new Error(
        `${compiledCliEnvironmentVariable} is required for the shipped Bun artifact matrix.`,
      )
    }
    return undefined
  }
  if (!isAbsolute(artifact)) {
    throw new Error(`${compiledCliEnvironmentVariable} must be an absolute path.`)
  }
  return artifact
}

async function main() {
  const packagedElectron = await requiredPackagedElectronExecutable()
  const electronDevelopment = requireFromScript("electron")
  await Promise.all([
    access(fixturePath),
    access(desktopDevelopmentEntry),
    access(cliDevelopmentEntry),
    access(electronDevelopment),
  ])

  await runProbe({
    label: "packaged Electron child lifetime",
    command: packagedElectron,
    arguments: runtimeArguments(),
    host: "desktop",
    runtime: "electron",
    isPackaged: true,
  })
  await runProbe({
    label: "Node development desktop child lifetime",
    command: electronDevelopment,
    arguments: runtimeArguments(desktopDevelopmentEntry),
    host: "desktop",
    runtime: "electron",
    isPackaged: false,
  })
  await runProbe({
    label: "Node development CLI child lifetime",
    command: process.execPath,
    arguments: ["--import", "tsx", cliDevelopmentEntry],
    host: "cli",
    runtime: "node",
  })

  const compiledCli = compiledCliArtifact()
  if (compiledCli) {
    await access(compiledCli)
    await runProbe({
      label: "compiled Bun CLI child lifetime",
      command: compiledCli,
      host: "cli",
      runtime: "bun",
    })
  }
}

main().catch((error) => {
  process.stderr.write(`FAIL shipped child-lifetime matrix\n  ${errorText(error)}\n`)
  process.exitCode = 1
})
