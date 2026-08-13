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
import {
  type ChildProcessLifetimeAdapter,
  createChildProcessLifetimeAdapter,
} from "@repo-edu/host-node/child-process-lifetime"
import { createProgram } from "./cli.js"
import { runWithCommandLineLifetime } from "./command-line-lifetime.js"

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runCli(): Promise<void> {
  const artifactProbe = isProgramGateArtifactProbe()
  const childLifetimeArtifactProbe = isChildProcessLifetimeArtifactProbe()
  if (artifactProbe && childLifetimeArtifactProbe) {
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

  const childProcessLifetime = createChildProcessLifetimeAdapter()
  let childLifetimeStopConfirmed = false
  const observedChildProcessLifetime: ChildProcessLifetimeAdapter =
    childLifetimeArtifactProbe
      ? {
          launch: childProcessLifetime.launch,
          async stopAndConfirm() {
            await childProcessLifetime.stopAndConfirm()
            childLifetimeStopConfirmed = true
          },
        }
      : childProcessLifetime
  let childLifetimeRun:
    | Awaited<ReturnType<typeof startChildProcessLifetimeArtifactProbe>>
    | undefined
  await runWithCommandLineLifetime(
    {
      childProcessLifetime: observedChildProcessLifetime,
      releaseProgramGate() {
        if (childLifetimeArtifactProbe && !childLifetimeStopConfirmed) {
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
      if (childLifetimeArtifactProbe) {
        childLifetimeRun = await startChildProcessLifetimeArtifactProbe(
          observedChildProcessLifetime,
        )
        return
      }
      await createProgram({
        childProcessLifetime: observedChildProcessLifetime,
        signal,
        storageRoot,
      }).parseAsync(process.argv)
    },
  )

  if (childLifetimeArtifactProbe) {
    if (!childLifetimeRun) {
      throw new Error("The command-line child-lifetime probe did not start.")
    }
    const claims =
      await finishChildProcessLifetimeArtifactProbe(childLifetimeRun)
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
