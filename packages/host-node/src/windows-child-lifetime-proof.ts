import type { Readable } from "node:stream"
import type { ProcessResult } from "@repo-edu/host-runtime-contract"
import { childProcessStopGracePeriodMs } from "./child-process-lifetime-controller.js"
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
    gracefulStopPeriodMs: childProcessStopGracePeriodMs,
  })
  const stdout = collectOutput(run.tree.stdout)
  const stderr = collectOutput(run.tree.stderr)
  run.tree.stdin.end(target.stdinText)

  const [result, capturedStdout, capturedStderr] = await Promise.all([
    run.tree.result,
    stdout,
    stderr,
  ])

  return {
    evidence: run.evidence,
    result: {
      ...result,
      stdout: capturedStdout,
      stderr: capturedStderr,
    },
  }
}
