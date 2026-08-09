import { join } from "node:path"
import {
  proveWindowsLauncherReadiness,
  runWindowsChildLifetimeTarget,
  type WindowsChildLifetimeRuntime,
} from "@repo-edu/host-node/windows-child-lifetime"

export const childLifetimeArtifactProbeEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_PROBE"
export const childLifetimeArtifactProbeMarker =
  "repo-edu-child-lifetime-artifact"

const expectedStdout = "stdout:REPO-EDU"
const expectedStderr = "stderr:repo-edu"
const expectedExitCode = 7

export function isChildLifetimeArtifactProbe(): boolean {
  return (
    process.env[childLifetimeArtifactProbeEnvironmentVariable]?.trim() === "1"
  )
}

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

export async function runChildLifetimeArtifactProbe(options: {
  readonly resourcesPath: string
  readonly executablePath: string
}): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("The child-lifetime artifact probe requires Windows.")
  }

  const runtime = resolvePackagedWindowsChildLifetimeRuntime(
    options.resourcesPath,
    options.executablePath,
  )
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
    env: {
      ELECTRON_RUN_AS_NODE: "must-not-reach-target",
    },
    stdinText: "repo-edu",
  })

  const streamContract =
    run.result.exitCode === expectedExitCode &&
    run.result.signal === null &&
    run.result.stdout === expectedStdout &&
    run.result.stderr === expectedStderr
  const fixedHelperEntry =
    readiness.launcherArguments.length === 1 &&
    readiness.launcherArguments[0] === runtime.launcherEntryPath &&
    run.evidence.launcherArguments.length === 1 &&
    run.evidence.launcherArguments[0] === runtime.launcherEntryPath

  const report = {
    marker: childLifetimeArtifactProbeMarker,
    architecture: process.arch,
    claims: {
      assignmentUnderEnclosingJob:
        readiness.assignedToJob && run.evidence.assignedToJob,
      sameTurnSavedIdentity:
        readiness.identitySavedInSpawnTurn &&
        run.evidence.identitySavedInSpawnTurn,
      beforeAssignmentCommandGate: run.evidence.targetAdmittedAfterAssignment,
      launcherAndKoffiLoading:
        readiness.koffiLoaded && run.evidence.koffiLoaded,
      streamContract,
      explicitRunAsNode:
        readiness.runAsNode && run.evidence.runAsNode && fixedHelperEntry,
      launcherReadyThenExited: readiness.exitCode === 0,
      productInputCannotChooseHelper: fixedHelperEntry,
      electronRunAsNodeExcluded:
        run.result.exitCode === expectedExitCode &&
        !run.result.stderr.includes("ELECTRON_RUN_AS_NODE"),
      jobHandleNotInherited:
        !readiness.jobHandleInherited && !run.evidence.jobHandleInherited,
    },
  }

  if (Object.values(report.claims).some((passed) => !passed)) {
    throw new Error(
      `The child-lifetime artifact probe failed: ${JSON.stringify(report)}`,
    )
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
}
