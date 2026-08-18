import type { Readable } from "node:stream"
import type { ChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import type { PlanImplementationStep, PlanMachineProof } from "./contracts.js"

const commandOutputLimit = 16 * 1024 * 1024

export type StepCommand = {
  readonly id: string
  readonly label: string
  readonly program: string
  readonly arguments: readonly string[]
}

export type StepCommandRequest = StepCommand & {
  readonly cwd: string
  readonly signal?: AbortSignal
}

export type StepCommandResult = {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly stdout: string
  readonly stderr: string
}

export type StepCommandExecutor = {
  run(request: StepCommandRequest): Promise<StepCommandResult>
}

export type StepCommandObserver = {
  commandStarted(command: StepCommand): void
  commandFinished(
    command: StepCommand,
    status: "succeeded" | "failed" | "stopped",
  ): void
}

export class StepCheckError extends Error {
  readonly command: StepCommand

  constructor(command: StepCommand, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "StepCheckError"
    this.command = command
  }
}

async function collectOutput(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  let retainedBytes = 0
  let truncated = false
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const remaining = commandOutputLimit - retainedBytes
    if (remaining > 0) {
      chunks.push(bytes.subarray(0, remaining))
      retainedBytes += Math.min(bytes.length, remaining)
    }
    if (bytes.length > remaining) truncated = true
  }
  const output = Buffer.concat(chunks).toString("utf8")
  return truncated ? `${output}\n[output truncated]` : output
}

export function createStepCommandExecutor(
  childProcessLifetimeController: ChildProcessLifetimeController,
): StepCommandExecutor {
  return {
    async run(request) {
      const child = await childProcessLifetimeController.launch({
        command: request.program,
        args: request.arguments,
        cwd: request.cwd,
        env: { ...process.env },
        shell: false,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      })
      child.stdin.end()
      const [result, stdout, stderr] = await Promise.all([
        child.result,
        collectOutput(child.stdout),
        collectOutput(child.stderr),
      ])
      return { ...result, stdout, stderr }
    },
  }
}

async function runRequiredCommand(
  repoEduRoot: string,
  command: StepCommand,
  executor: StepCommandExecutor,
  observer: StepCommandObserver,
  stopSignal?: AbortSignal,
): Promise<void> {
  observer.commandStarted(command)
  let result: StepCommandResult
  try {
    result = await executor.run({
      ...command,
      cwd: repoEduRoot,
      ...(stopSignal === undefined ? {} : { signal: stopSignal }),
    })
  } catch (error) {
    observer.commandFinished(
      command,
      stopSignal?.aborted ? "stopped" : "failed",
    )
    throw new StepCheckError(
      command,
      `${command.label} could not start or settle.`,
      { cause: error },
    )
  }
  if (result.exitCode !== 0 || result.signal !== null) {
    observer.commandFinished(
      command,
      stopSignal?.aborted ? "stopped" : "failed",
    )
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new StepCheckError(
      command,
      `${command.label} failed (${result.exitCode ?? "no exit"}, ${result.signal ?? "no signal"})${detail.length > 0 ? `: ${detail}` : "."}`,
    )
  }
  observer.commandFinished(command, "succeeded")
}

function isMachineProof(
  proof: PlanImplementationStep["proofs"]["items"][number],
): proof is PlanMachineProof {
  return "program" in proof
}

export async function repeatDependencyInstall(
  repoEduRoot: string,
  executor: StepCommandExecutor,
  observer: StepCommandObserver,
  stopSignal?: AbortSignal,
): Promise<void> {
  await runRequiredCommand(
    repoEduRoot,
    {
      id: "dependency-install",
      label: "Dependency install",
      program: "pnpm",
      arguments: ["install"],
    },
    executor,
    observer,
    stopSignal,
  )
}

export async function runAdmittedStepChecks(
  repoEduRoot: string,
  step: PlanImplementationStep,
  executor: StepCommandExecutor,
  observer: StepCommandObserver,
  stopSignal?: AbortSignal,
): Promise<void> {
  const fixedCommands: readonly StepCommand[] = [
    {
      id: "git-diff-check",
      label: "Git diff check",
      program: "git",
      arguments: ["diff", "--check"],
    },
    {
      id: "repository-check",
      label: "Repository check",
      program: "pnpm",
      arguments: ["check"],
    },
    {
      id: "repository-test",
      label: "Repository test",
      program: "pnpm",
      arguments: ["test"],
    },
  ]
  for (const command of fixedCommands) {
    await runRequiredCommand(
      repoEduRoot,
      command,
      executor,
      observer,
      stopSignal,
    )
  }

  const machineProofs = step.proofs.items.filter(isMachineProof)
  for (const [index, proof] of machineProofs.entries()) {
    await runRequiredCommand(
      repoEduRoot,
      {
        id: `machine-proof-${index + 1}`,
        label: `Machine proof ${index + 1}`,
        program: proof.program,
        arguments: [...proof.arguments],
      },
      executor,
      observer,
      stopSignal,
    )
  }
}
