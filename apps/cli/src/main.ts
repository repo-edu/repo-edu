import { performance } from "node:perf_hooks"
import {
  claimProgramGate,
  isProgramGateArtifactProbe,
  type ProgramGateClaim,
  programConflictMessage,
  resolveRepoEduAppDataRoot,
  waitForProgramGateArtifactProbeRelease,
  writeProgramGateArtifactProbeMarker,
} from "@repo-edu/host-node"
import { createProgram } from "./cli.js"

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runCli(): Promise<void> {
  const artifactProbe = isProgramGateArtifactProbe()
  let storageRoot: string
  let claim: ProgramGateClaim
  let claimStartedAt = 0
  try {
    storageRoot = resolveRepoEduAppDataRoot()
    claimStartedAt = performance.now()
    claim = await claimProgramGate(storageRoot)
  } catch (error) {
    process.stderr.write(`Program gate failed: ${errorText(error)}\n`)
    process.exitCode = 1
    return
  }
  const claimDurationMs = performance.now() - claimStartedAt

  if (claim.status === "busy") {
    if (artifactProbe) {
      await writeProgramGateArtifactProbeMarker("busy", claimDurationMs)
    }
    process.stderr.write(`${programConflictMessage}\n`)
    process.exitCode = 1
    return
  }

  try {
    if (artifactProbe) {
      await writeProgramGateArtifactProbeMarker("held", claimDurationMs)
      await waitForProgramGateArtifactProbeRelease()
      return
    }
    await createProgram({ storageRoot }).parseAsync(process.argv)
  } finally {
    claim.release()
  }
}

await runCli()
