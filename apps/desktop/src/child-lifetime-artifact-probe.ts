import { join } from "node:path"
import type { Readable } from "node:stream"
import {
  childProcessLifetimeArtifactProbeMarker,
  finishChildProcessLifetimeArtifactProbe,
  isChildProcessLifetimeArtifactProbe,
  launchNodeCodexSdkHost,
  type NodeCodexSdkHostCommand,
  startChildProcessLifetimeArtifactProbe,
} from "@repo-edu/host-node"
import type { ChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import {
  proveWindowsLauncherReadiness,
  runWindowsChildLifetimeTarget,
  type WindowsChildLifetimeRuntime,
} from "@repo-edu/host-node/windows-child-lifetime"

const expectedStdout = "stdout:REPO-EDU"
const expectedStderr = "stderr:repo-edu"
const expectedExitCode = 7

export const isChildLifetimeArtifactProbe = isChildProcessLifetimeArtifactProbe

export function resolvePackagedWindowsChildLifetimeRuntime(
  resourcesPath: string,
  executablePath: string,
): WindowsChildLifetimeRuntime {
  return {
    executablePath,
    launcherEntryPath: join(
      resourcesPath,
      "host-child-lifetime",
      "windows-launcher.cjs",
    ),
    runAsNode: true,
  }
}

function powershellExecutable(): string {
  const windowsRoot = process.env.SystemRoot ?? "C:\\Windows"
  return join(
    windowsRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  )
}

function streamProbeScript(): string {
  return [
    "$text = [Console]::In.ReadToEnd()",
    '[Console]::Out.Write("stdout:" + $text.ToUpperInvariant())',
    '[Console]::Error.Write("stderr:repo-edu")',
    "if ($null -ne $env:ELECTRON_RUN_AS_NODE) { exit 23 }",
    `exit ${expectedExitCode}`,
  ].join("; ")
}

function captureText(stream: Readable): () => string {
  let output = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    output += chunk
  })
  return () => output
}

async function proveCodexSdkHost(options: {
  readonly childProcessLifetimeController: ChildProcessLifetimeController
  readonly command: NodeCodexSdkHostCommand
}): Promise<true> {
  const sdkHostTree = await launchNodeCodexSdkHost(
    options.childProcessLifetimeController,
    options.command,
    new AbortController().signal,
    "target-exit",
  )
  sdkHostTree.stdout.resume()
  const stderr = captureText(sdkHostTree.stderr)
  sdkHostTree.stdin.end()

  const outcome = await sdkHostTree.outcome
  if (outcome.outcome === "unknown" || outcome.outcome === "cancelled") {
    throw new Error(
      `The Codex SDK host process ended ${outcome.outcome}: ${stderr().trim() || "<no stderr>"}`,
    )
  }
  const result = outcome.value
  if (result.exitCode !== 0 || result.signal !== null) {
    throw new Error(
      `The Codex SDK host process did not load and exit cleanly: ${stderr().trim() || JSON.stringify(result)}`,
    )
  }
  return true
}

async function provePackagedWindowsClaims(
  runtime: WindowsChildLifetimeRuntime,
): Promise<Record<string, true>> {
  const readiness = await proveWindowsLauncherReadiness(runtime)
  const run = await runWindowsChildLifetimeTarget(runtime, {
    command: powershellExecutable(),
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      streamProbeScript(),
    ],
    stdinText: "repo-edu",
  })

  const streamContract =
    run.result.exitCode === expectedExitCode &&
    run.result.signal === null &&
    run.result.stdout === expectedStdout &&
    run.result.stderr === expectedStderr
  const fixedLauncherEntry =
    readiness.launcherArguments.length === 1 &&
    readiness.launcherArguments[0] === runtime.launcherEntryPath &&
    run.evidence.launcherArguments.length === 1 &&
    run.evidence.launcherArguments[0] === runtime.launcherEntryPath
  const claims = {
    assignmentUnderEnclosingJob:
      readiness.assignedToJob && run.evidence.assignedToJob,
    sameTurnSavedIdentity:
      readiness.identitySavedInSpawnTurn &&
      run.evidence.identitySavedInSpawnTurn,
    beforeAssignmentCommandGate: run.evidence.targetAdmittedAfterAssignment,
    launcherAndKoffiLoading: readiness.koffiLoaded && run.evidence.koffiLoaded,
    streamContract,
    explicitRunAsNode:
      readiness.runAsNode && run.evidence.runAsNode && fixedLauncherEntry,
    launcherReadyThenExited: readiness.exitCode === 0,
    productInputCannotChooseLauncher: fixedLauncherEntry,
    electronRunAsNodeExcluded: run.result.exitCode === expectedExitCode,
    jobHandleNotInherited:
      !readiness.jobHandleInherited && !run.evidence.jobHandleInherited,
  }
  if (Object.values(claims).some((passed) => !passed)) {
    throw new Error(
      `The packaged Windows child-process lifetime claims failed: ${JSON.stringify(claims)}`,
    )
  }
  return claims as Record<string, true>
}

export async function runChildLifetimeArtifactProbe(options: {
  readonly childProcessLifetimeController: ChildProcessLifetimeController
  readonly codexSdkHostCommand: NodeCodexSdkHostCommand
  readonly executablePath: string
  readonly isPackaged: boolean
  readonly resourcesPath: string
}): Promise<void> {
  let directProbe:
    | Awaited<ReturnType<typeof startChildProcessLifetimeArtifactProbe>>
    | undefined
  try {
    const windowsClaims =
      process.platform === "win32" && options.isPackaged
        ? await provePackagedWindowsClaims(
            resolvePackagedWindowsChildLifetimeRuntime(
              options.resourcesPath,
              options.executablePath,
            ),
          )
        : {}
    const codexSdkHostLoaded = await proveCodexSdkHost({
      childProcessLifetimeController: options.childProcessLifetimeController,
      command: options.codexSdkHostCommand,
    })
    directProbe = await startChildProcessLifetimeArtifactProbe(
      options.childProcessLifetimeController,
    )
    await options.childProcessLifetimeController.stopAndConfirm()
    const directClaims =
      await finishChildProcessLifetimeArtifactProbe(directProbe)
    const report = {
      marker: childProcessLifetimeArtifactProbeMarker,
      host: "desktop",
      runtime: "electron",
      isPackaged: options.isPackaged,
      platform: process.platform,
      architecture: process.arch,
      claims: {
        ...directClaims,
        codexSdkHostLoaded,
        ...windowsClaims,
      },
    }

    await new Promise<void>((resolve, reject) => {
      process.stdout.write(`${JSON.stringify(report)}\n`, (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  } finally {
    await options.childProcessLifetimeController.stopAndConfirm()
  }
}
