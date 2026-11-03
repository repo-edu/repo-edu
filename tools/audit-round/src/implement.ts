import { readFile } from "node:fs/promises"
import { InvalidArgumentError } from "commander"
import type { ExecutionContext } from "./context.js"
import {
  type ImplementationProgress,
  implementationProgress,
  readImplementationLogs,
} from "./default-target.js"
import { readReadyCoder, requireReadyMarker } from "./lifecycle.js"
import type {
  InteractiveSession,
  PhaseInput,
  PhaseResult,
  PhaseRun,
} from "./phase.js"
import { type PlanStep, readPlanSteps } from "./plan-steps.js"
import type { Coder } from "./settings.js"
import type { Repository } from "./subject.js"
import {
  parseStepScope,
  planStem,
  requiredActivePlan,
  roundContext,
} from "./target.js"

export type PreparedImplementation = {
  readonly plan: string
  readonly stem: string
  readonly steps: readonly PlanStep[]
  readonly selectedSteps: readonly PlanStep[]
  readonly coder: Coder
}

/** Resolve the active plan, ready assignment and optional inclusive step scope. */
export async function prepareImplementation(
  context: ExecutionContext,
  requestedStem: string,
  scope?: string,
): Promise<PreparedImplementation> {
  const plan = await requiredActivePlan(
    context.planRoot,
    requestedStem,
    "implement",
  )
  const stem = planStem(plan)
  await requireReadyMarker(context.planRoot, plan)
  const coder = await readReadyCoder(context.planRoot, stem)
  if (coder === null)
    throw new Error(
      `${stem} has a ready marker without a coder assignment. This command accepts only assigned ready plans.`,
    )

  const steps = readPlanSteps(await readFile(plan, "utf8"))
  if (scope === undefined)
    return { plan, stem, steps, selectedSteps: steps, coder }

  const parsed = parseStepScope(scope)
  if (!parsed.ok && parsed.reason === "shape")
    throw new InvalidArgumentError(
      "Implementation scope must be a positive step number or an increasing range, such as 2 or 2-4.",
    )
  if (!parsed.ok)
    throw new InvalidArgumentError(
      "Implementation scope must use safe positive integers in increasing order.",
    )
  if (parsed.last > steps.length)
    throw new InvalidArgumentError(
      `${stem} has ${steps.length} implementation step${steps.length === 1 ? "" : "s"}; scope ${scope} ends at step ${parsed.last}.`,
    )
  return {
    plan,
    stem,
    steps,
    selectedSteps: steps.slice(parsed.first - 1, parsed.last),
    coder,
  }
}

export async function readImplementationProgress(
  context: ExecutionContext,
  stem: string,
  steps: readonly PlanStep[],
): Promise<ImplementationProgress> {
  return implementationProgress(
    await readImplementationLogs(context),
    stem,
    steps,
  )
}

type OpenStep = {
  readonly rulingFile: string
}

type MarkerCommit = {
  readonly sha: string
  readonly subject: string
}

export type ImplementationDependencies = {
  readonly readProgress: () => Promise<ImplementationProgress>
  readonly openStep: (
    step: PlanStep,
    shares: readonly Repository[],
  ) => Promise<OpenStep>
  readonly runWorker: (
    input: PhaseInput<"implement">,
  ) => Promise<PhaseResult<"implement">>
  readonly checkFile: (file: string) => Promise<void>
  readonly requestRuling: (file: string) => Promise<string | null>
  readonly markImplemented: (repository: Repository) => Promise<MarkerCommit>
  readonly message: (text: string) => Promise<void>
}

export type ImplementationInput = PreparedImplementation &
  ExecutionContext & {
    readonly phaseRun: PhaseRun
    readonly release: string
    readonly effort: Coder["effort"]
  }

export type ImplementationResult =
  | {
      readonly status: "finished"
      readonly markers: readonly MarkerCommit[]
    }
  | {
      readonly status: "awaiting-ruling"
      readonly step: number
      readonly session: InteractiveSession
    }
  | {
      readonly status: "failed"
      readonly step: number
      readonly reason: string
      readonly session: InteractiveSession | null
    }

function pendingShares(
  progress: ImplementationProgress,
  step: PlanStep,
): readonly Repository[] {
  return step.repositories.filter((repository) =>
    progress.repositories
      .find((candidate) => candidate.repository === repository)
      ?.pending.includes(step.number),
  )
}

function repositoryNames(repositories: readonly Repository[]): string {
  return repositories
    .map((repository) =>
      repository === "repo-edu" ? "Repo Edu" : "the plan repo",
    )
    .join(" and ")
}

/** Run selected missing shares in plan order, one fresh worker per step. */
export async function runImplementation(
  input: ImplementationInput,
  dependencies: ImplementationDependencies,
): Promise<ImplementationResult> {
  const context = roundContext(
    {
      repoEduRoot: input.repoEduRoot,
      planRoot: input.planRoot,
    },
    "implementation",
  )
  const interactive = (sessionId: string): InteractiveSession => ({
    ...context,
    ...input.phaseRun,
    sessionId,
  })
  let progress = await dependencies.readProgress()

  for (const step of input.selectedSteps) {
    const shares = pendingShares(progress, step)
    if (shares.length === 0) continue

    await dependencies.message(
      `Step ${step.number}: implementing the remaining share${shares.length === 1 ? "" : "s"} in ${repositoryNames(shares)}.`,
    )
    const opened = await dependencies.openStep(step, shares)
    let sessionId: string | null = null
    let rulingReply: string | undefined
    while (true) {
      const common = {
        ...context,
        ...input.phaseRun,
        phase: "implement" as const,
        arguments: [
          input.plan,
          step.number,
          shares,
          input.release,
          input.effort,
        ] as const,
        rulingFile: opened.rulingFile,
      }
      const result = await dependencies.runWorker(
        sessionId === null
          ? { ...common, sessionId: null }
          : { ...common, sessionId, rulingReply: rulingReply as string },
      )
      if (result.status === "failed")
        return {
          status: "failed",
          step: step.number,
          reason: result.reason,
          session:
            result.sessionId === null ? null : interactive(result.sessionId),
        }
      if (result.status === "needs-ruling") {
        try {
          await dependencies.checkFile(opened.rulingFile)
        } catch (error) {
          return {
            status: "failed",
            step: step.number,
            reason: error instanceof Error ? error.message : String(error),
            session: interactive(result.sessionId),
          }
        }
        const reply = await dependencies.requestRuling(opened.rulingFile)
        if (reply === null)
          return {
            status: "awaiting-ruling",
            step: step.number,
            session: interactive(result.sessionId),
          }
        sessionId = result.sessionId
        rulingReply = reply
        continue
      }

      progress = await dependencies.readProgress()
      const missing = pendingShares(progress, step).filter((repository) =>
        shares.includes(repository),
      )
      if (missing.length > 0)
        return {
          status: "failed",
          step: step.number,
          reason: `Worker finished without landing step ${step.number} in ${repositoryNames(missing)}.`,
          session: interactive(result.sessionId),
        }
      await dependencies.message(
        `Step ${step.number}: all requested shares landed.`,
      )
      break
    }
  }

  progress = await dependencies.readProgress()
  const markers: MarkerCommit[] = []
  for (const repository of progress.repositories) {
    if (repository.pending.length > 0 || repository.marker === "current")
      continue
    const marker = await dependencies.markImplemented(repository.repository)
    markers.push(marker)
    await dependencies.message(`Committed ${marker.sha}: ${marker.subject}`)
  }
  return { status: "finished", markers }
}
