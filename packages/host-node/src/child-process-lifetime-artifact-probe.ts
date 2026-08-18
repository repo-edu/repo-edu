import { readFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import type { Readable } from "node:stream"
import { setTimeout as delay } from "node:timers/promises"
import type {
  ChildProcessLifetimeController,
  OwnedChildProcessTree,
} from "./child-process-lifetime.js"

export const childProcessLifetimeArtifactProbeEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_PROBE"
export const childProcessLifetimeArtifactProbeFixtureEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_FIXTURE"
export const childProcessLifetimeArtifactProbeMarkerEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_MARKER"
export const childProcessLifetimeArtifactProbeRuntimeEnvironmentVariable =
  "REPO_EDU_CHILD_LIFETIME_ARTIFACT_RUNTIME"
export const childProcessLifetimeArtifactProbeMarker =
  "repo-edu-child-lifetime-artifact"

const readyOutput = "ready\n"
const stabilityDurationMs = 120

export type ChildProcessLifetimeArtifactProbeTarget = {
  readonly fixturePath: string
  readonly markerPath: string
  readonly runtimePath: string
}

export type ChildProcessLifetimeArtifactProbeRun = {
  readonly markerPath: string
  readonly stderr: () => string
  readonly tree: OwnedChildProcessTree
}

export type ChildProcessLifetimeArtifactProbeClaims = {
  readonly ownedDescendantStopped: true
  readonly ownedDescendantStable: true
}

function requiredAbsoluteEnvironmentPath(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim()
  if (!value || !isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path.`)
  }
  return value
}

export function isChildProcessLifetimeArtifactProbe(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment[
      childProcessLifetimeArtifactProbeEnvironmentVariable
    ]?.trim() === "1"
  )
}

export function resolveChildProcessLifetimeArtifactProbeTarget(
  environment: NodeJS.ProcessEnv = process.env,
): ChildProcessLifetimeArtifactProbeTarget {
  return {
    fixturePath: requiredAbsoluteEnvironmentPath(
      environment,
      childProcessLifetimeArtifactProbeFixtureEnvironmentVariable,
    ),
    markerPath: requiredAbsoluteEnvironmentPath(
      environment,
      childProcessLifetimeArtifactProbeMarkerEnvironmentVariable,
    ),
    runtimePath: requiredAbsoluteEnvironmentPath(
      environment,
      childProcessLifetimeArtifactProbeRuntimeEnvironmentVariable,
    ),
  }
}

function captureText(stream: Readable): () => string {
  let output = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    output += chunk
  })
  return () => output
}

async function waitForReady(
  stream: Readable,
  output: () => string,
): Promise<void> {
  if (output().includes(readyOutput)) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const onData = () => {
      if (output().includes(readyOutput)) {
        cleanup()
        resolve()
      }
    }
    const onEnd = () => {
      cleanup()
      reject(
        new Error(
          `The child-lifetime artifact target exited before readiness: ${output().trim() || "<no output>"}`,
        ),
      )
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      stream.off("data", onData)
      stream.off("end", onEnd)
      stream.off("error", onError)
    }

    stream.on("data", onData)
    stream.once("end", onEnd)
    stream.once("error", onError)
  })
}

export async function startChildProcessLifetimeArtifactProbe(
  controller: ChildProcessLifetimeController,
  target: ChildProcessLifetimeArtifactProbeTarget = resolveChildProcessLifetimeArtifactProbeTarget(),
): Promise<ChildProcessLifetimeArtifactProbeRun> {
  const tree = await controller.launch({
    command: target.runtimePath,
    args: [target.fixturePath, "tree-waits", target.markerPath],
  })
  const stdout = captureText(tree.stdout)
  const stderr = captureText(tree.stderr)
  await waitForReady(tree.stdout, stdout)

  return {
    markerPath: target.markerPath,
    stderr,
    tree,
  }
}

export async function finishChildProcessLifetimeArtifactProbe(
  run: ChildProcessLifetimeArtifactProbeRun,
): Promise<ChildProcessLifetimeArtifactProbeClaims> {
  const result = await run.tree.result
  if (result.exitCode !== 0 || result.signal !== null) {
    throw new Error(
      `The child-lifetime artifact target exited with ${result.exitCode ?? result.signal ?? "unknown"}: ${run.stderr().trim() || "<no stderr>"}`,
    )
  }
  const marker = await readFile(run.markerPath, "utf8")
  if (!marker.includes("parent-stopped")) {
    throw new Error("The artifact target parent was not confirmed stopped.")
  }
  if (!marker.includes("grandchild-stopped")) {
    throw new Error("The artifact target descendant was not confirmed stopped.")
  }

  await delay(stabilityDurationMs)
  if ((await readFile(run.markerPath, "utf8")) !== marker) {
    throw new Error(
      "The artifact target descendant changed state after shutdown.",
    )
  }

  return {
    ownedDescendantStopped: true,
    ownedDescendantStable: true,
  }
}
