import type { Readable } from "node:stream"
import type { ProcessResult } from "@repo-edu/host-runtime-contract"
import {
  childProcessForcedStopConfirmationPeriodMs,
  childProcessStopGracePeriodMs,
} from "./child-process-lifetime-controller.js"
import {
  launchAssignedTarget,
  type WindowsChildLifetimeEvidence,
  type WindowsChildLifetimeRuntime,
} from "./windows-child-process-lifetime-adapter.js"
import type { WindowsChildLifetimeTarget } from "./windows-launcher-protocol.js"

export type WindowsChildLifetimeRun = {
  readonly evidence: WindowsChildLifetimeEvidence & {
    readonly targetAdmittedAfterAssignment: true
  }
  readonly result: ProcessResult
}

function collectOutput(stream: Readable): Promise<string> {
  stream.setEncoding("utf8")
  let output = ""
  stream.on("data", (chunk: string) => {
    output += chunk
  })
  return new Promise((resolve, reject) => {
    stream.once("error", reject)
    stream.once("end", () => {
      resolve(output)
    })
  })
}

export async function runWindowsChildLifetimeTarget(
  runtime: WindowsChildLifetimeRuntime,
  target: WindowsChildLifetimeTarget,
): Promise<WindowsChildLifetimeRun> {
  const run = await launchAssignedTarget(runtime, target, {
    forcedStopConfirmationPeriodMs: childProcessForcedStopConfirmationPeriodMs,
    gracefulStopPeriodMs: childProcessStopGracePeriodMs,
  })
  const stdout = collectOutput(run.tree.stdout)
  const stderr = collectOutput(run.tree.stderr)
  const output = Promise.all([stdout, stderr]).then(
    ([capturedStdout, capturedStderr]) =>
      ({ status: "fulfilled", capturedStdout, capturedStderr }) as const,
    (failure: unknown) => ({ status: "rejected", failure }) as const,
  )
  run.tree.stdin.end(target.stdinText)

  const terminal = await run.tree.result
  if ("outcome" in terminal) {
    let failure = terminal.failure
    try {
      await run.tree.stopAndConfirm()
    } catch (cleanupFailure) {
      failure = new AggregateError(
        [failure, cleanupFailure],
        "The Windows lifetime proof was lost and its target could not be confirmed stopped.",
      )
    }
    for (const stream of [run.tree.stdin, run.tree.stdout, run.tree.stderr]) {
      if (!stream.destroyed) {
        stream.once("error", () => {})
        stream.destroy(failure instanceof Error ? failure : undefined)
      }
    }
    await output
    throw failure instanceof Error ? failure : new Error(String(failure))
  }

  const captured = await output
  if (captured.status === "rejected") {
    throw captured.failure
  }
  if (run.admission !== "confirmed") {
    throw new Error(
      "The Windows launcher returned a known result without confirmed target admission.",
    )
  }

  return {
    evidence: run.evidence,
    result: {
      ...terminal,
      stdout: captured.capturedStdout,
      stderr: captured.capturedStderr,
    },
  }
}
