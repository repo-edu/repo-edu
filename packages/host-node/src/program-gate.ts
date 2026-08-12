import { access } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { claimExclusive, type ExclusiveClaim } from "./exclusive-claim.js"

export const programConflictMessage = "Another Repo Edu program is running"
export const programGateArtifactProbeEnvironmentVariable =
  "REPO_EDU_PROGRAM_GATE_ARTIFACT_PROBE"
export const programGateArtifactProbeReleaseEnvironmentVariable =
  "REPO_EDU_PROGRAM_GATE_ARTIFACT_PROBE_RELEASE"
export const programGateArtifactProbeMarker = "repo-edu-program-gate-artifact"

const artifactProbeReleasePollIntervalMs = 25

export type ProgramGateClaim = ExclusiveClaim

export async function claimProgramGate(
  appDataRoot: string,
): Promise<ProgramGateClaim> {
  return await claimExclusive(join(appDataRoot, "program-gate.db"))
}

export function isProgramGateArtifactProbe(): boolean {
  return (
    process.env[programGateArtifactProbeEnvironmentVariable]?.trim() === "1"
  )
}

export async function writeProgramGateArtifactProbeMarker(
  state: ProgramGateClaim["status"],
  claimDurationMs: number,
): Promise<void> {
  if (!Number.isFinite(claimDurationMs) || claimDurationMs < 0) {
    throw new Error(
      "The program-gate probe claim duration must be non-negative.",
    )
  }

  const line = `${JSON.stringify({
    marker: programGateArtifactProbeMarker,
    state,
    claimDurationMs,
  })}\n`
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(line, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export async function waitForProgramGateArtifactProbeRelease(): Promise<void> {
  const releasePath =
    process.env[programGateArtifactProbeReleaseEnvironmentVariable]?.trim()
  if (!releasePath || !isAbsolute(releasePath)) {
    throw new Error(
      "The program-gate artifact probe requires an absolute release path.",
    )
  }

  while (true) {
    try {
      await access(releasePath)
      return
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error
      }
    }
    await setTimeout(artifactProbeReleasePollIntervalMs)
  }
}
