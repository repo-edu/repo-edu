import { performance } from "node:perf_hooks"
import {
  childProcessLifetimeArtifactProbeMarker,
  claimProgramGate,
  finishChildProcessLifetimeArtifactProbe,
  isChildProcessLifetimeArtifactProbe,
  isProgramGateArtifactProbe,
  type ProgramGateClaim,
  programConflictMessage,
  resolveRepoEduAppDataRoot,
  startChildProcessLifetimeArtifactProbe,
  waitForProgramGateArtifactProbeRelease,
  writeProgramGateArtifactProbeMarker,
} from "@repo-edu/host-node"
import type { ChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import { createCommandLineChildProcessLifetimeController } from "./child-process-lifetime.js"
import { createProgram } from "./cli.js"
import { runWithCommandLineLifetime } from "./command-line-lifetime.js"

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runCli(): Promise<void> {
  const artifactProbe = isProgramGateArtifactProbe()
  const childProcessLifetimeArtifactProbe =
    isChildProcessLifetimeArtifactProbe()
  if (artifactProbe && childProcessLifetimeArtifactProbe) {
    throw new Error("Only one command-line artifact probe may run at a time.")
  }
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

  const childProcessLifetimeController =
    await createCommandLineChildProcessLifetimeController()
  let childProcessLifetimeStopConfirmed = false
  const observedChildProcessLifetimeController: ChildProcessLifetimeController =
    childProcessLifetimeArtifactProbe
      ? {
          launch: childProcessLifetimeController.launch,
          async stopAndConfirm() {
            await childProcessLifetimeController.stopAndConfirm()
            childProcessLifetimeStopConfirmed = true
          },
        }
      : childProcessLifetimeController
  let childProcessLifetimeRun:
    | Awaited<ReturnType<typeof startChildProcessLifetimeArtifactProbe>>
    | undefined
  await runWithCommandLineLifetime(
    {
      childProcessLifetimeController: observedChildProcessLifetimeController,
      releaseProgramGate() {
        if (
          childProcessLifetimeArtifactProbe &&
          !childProcessLifetimeStopConfirmed
        ) {
          throw new Error(
            "The program gate was released before child-process shutdown finished.",
          )
        }
        claim.release()
      },
    },
    async (signal) => {
      if (artifactProbe) {
        await writeProgramGateArtifactProbeMarker("held", claimDurationMs)
        await waitForProgramGateArtifactProbeRelease()
        return
      }
      if (childProcessLifetimeArtifactProbe) {
        childProcessLifetimeRun = await startChildProcessLifetimeArtifactProbe(
          observedChildProcessLifetimeController,
        )
        return
      }
      await createProgram({
        childProcessLifetimeController: observedChildProcessLifetimeController,
        signal,
        storageRoot,
      }).parseAsync(process.argv)
    },
  )

  if (childProcessLifetimeArtifactProbe) {
    if (!childProcessLifetimeRun) {
      throw new Error(
        "The command-line child-process lifetime probe did not start.",
      )
    }
    const claims = await finishChildProcessLifetimeArtifactProbe(
      childProcessLifetimeRun,
    )
    process.stdout.write(
      `${JSON.stringify({
        marker: childProcessLifetimeArtifactProbeMarker,
        host: "cli",
        runtime: process.versions.bun === undefined ? "node" : "bun",
        platform: process.platform,
        architecture: process.arch,
        claims: {
          ...claims,
          stopConfirmedBeforeProgramGateRelease: true,
        },
      })}\n`,
    )
  }
}

await runCli()
