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
  let storageRoot: string
  let claim: ProgramGateClaim
  try {
    storageRoot = resolveRepoEduAppDataRoot()
    claim = await claimProgramGate(storageRoot)
  } catch (error) {
    process.stderr.write(`Program gate failed: ${errorText(error)}\n`)
    process.exitCode = 1
    return
  }

  if (claim.status === "busy") {
    if (isProgramGateArtifactProbe()) {
      writeProgramGateArtifactProbeMarker("busy")
    }
    process.stderr.write(`${programConflictMessage}\n`)
    process.exitCode = 1
    return
  }

  try {
    if (isProgramGateArtifactProbe()) {
      writeProgramGateArtifactProbeMarker("held")
      await waitForProgramGateArtifactProbeRelease()
      return
    }
    await createProgram({ storageRoot }).parseAsync(process.argv)
  } finally {
    claim.release()
  }
}

await runCli()
