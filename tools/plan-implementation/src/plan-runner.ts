import { validateStepCommitProposal } from "./commit-proposal.js"
import type {
  CodingAdapter,
  CodingEvent,
  CodingResult,
  PlanImplementationFinalResult,
  PlanImplementationRunRequest,
} from "./contracts.js"
import { resolvePlanCursor } from "./git-cursor.js"
import { readCommittedImplementationPlan } from "./plan-reader.js"
import { requireUnchangedPlanSource } from "./plan-source-admission.js"
import {
  admitOwnedRepositoryDiff,
  commitAdmittedRepositoryDiff,
  openRepositoryAdmission,
  requireAdmittedRepositoryDiff,
  requireCodingRepositoryControl,
  resolveRepoEduRoot,
  stageAdmittedRepositoryDiff,
} from "./repository-admission.js"
import { resolveRunAuthorization } from "./run-limits.js"
import {
  createRunOwnerState,
  type PlanImplementationRunState,
  reduceRunOwnerState,
} from "./run-owner.js"
import {
  claimPlanImplementationRunnerAdmission,
  type PlanImplementationRunnerAdmission,
} from "./runner-admission.js"
import {
  repeatDependencyInstall,
  runAdmittedStepChecks,
  type StepCommandExecutor,
  type StepCommandObserver,
} from "./step-checks.js"

export type RunPlanImplementationRequest = {
  readonly repoEduRoot: string
  readonly planPath: string
  readonly run: PlanImplementationRunRequest
}

export type PlanImplementationRunObserver = StepCommandObserver & {
  codingEvent(step: number, event: CodingEvent): void
}

export type PlanImplementationRunDependencies = {
  readonly coding: CodingAdapter
  readonly commands: StepCommandExecutor
  readonly observer?: PlanImplementationRunObserver
  readonly claimAdmission?: (
    repoEduRoot: string,
  ) => Promise<PlanImplementationRunnerAdmission>
}

export class PlanImplementationRunError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "PlanImplementationRunError"
  }
}

const noObserver: PlanImplementationRunObserver = {
  codingEvent() {},
  commandStarted() {},
}

function safeObserver(
  observer: PlanImplementationRunObserver,
): PlanImplementationRunObserver {
  return {
    codingEvent(step, event) {
      try {
        observer.codingEvent(step, event)
      } catch {
        // Presentation cannot move the run owner.
      }
    },
    commandStarted(command) {
      try {
        observer.commandStarted(command)
      } catch {
        // Presentation cannot move the run owner.
      }
    },
  }
}

async function drainCodingEvents(
  step: number,
  events: AsyncIterable<CodingEvent>,
  observer: PlanImplementationRunObserver,
): Promise<void> {
  for await (const event of events) {
    observer.codingEvent(step, event)
  }
}

function stoppedResult(
  request: PlanImplementationRunRequest,
  resolvedCeiling: number,
  reason: string,
): PlanImplementationFinalResult {
  return {
    ...request,
    resolvedCeiling,
    transcriptPath: null,
    outcome: "stopped",
    reason,
  }
}

function successfulResult(
  request: PlanImplementationRunRequest,
  resolvedCeiling: number,
  state: PlanImplementationRunState,
): PlanImplementationFinalResult {
  if (state.status !== "completed" && state.status !== "bound-reached") {
    throw new PlanImplementationRunError(
      `Run state ${state.status} cannot produce a successful final result.`,
    )
  }
  return {
    ...request,
    resolvedCeiling,
    transcriptPath: null,
    outcome: state.status,
  }
}

function blockedReason(result: CodingResult): string | null {
  return result.status === "blocked" ? result.reason : null
}

async function runCodingStep(
  coding: CodingAdapter,
  repoEduRoot: string,
  plan: Awaited<ReturnType<typeof readCommittedImplementationPlan>>,
  step: number,
  observer: PlanImplementationRunObserver,
): Promise<CodingResult> {
  const run = await coding.start({ repoEduRoot, plan, activeStep: step })
  const [result] = await Promise.all([
    run.result,
    drainCodingEvents(step, run.events, observer),
  ])
  return result
}

export async function runPlanImplementation(
  request: RunPlanImplementationRequest,
  dependencies: PlanImplementationRunDependencies,
): Promise<PlanImplementationFinalResult> {
  const repoEduRoot = await resolveRepoEduRoot(request.repoEduRoot)
  const plan = await readCommittedImplementationPlan(request.planPath)
  const claim =
    dependencies.claimAdmission ?? claimPlanImplementationRunnerAdmission
  const admissionClaim = await claim(repoEduRoot)
  if (admissionClaim.status === "busy") {
    throw new PlanImplementationRunError(
      "Another plan implementation runner owns this checkout.",
    )
  }

  const observer = safeObserver(dependencies.observer ?? noObserver)
  try {
    let repository = await openRepositoryAdmission(repoEduRoot)
    const cursor = await resolvePlanCursor(repoEduRoot, plan)
    const authorization = resolveRunAuthorization(plan, cursor, request.run)
    let state = reduceRunOwnerState(createRunOwnerState(authorization), {
      kind: "admission-completed",
    })

    while (state.status === "implementing") {
      const stepNumber = state.step
      const step = plan.steps[stepNumber - 1]
      if (step?.number !== stepNumber) {
        throw new PlanImplementationRunError(
          `The run owner selected missing implementation step ${stepNumber}.`,
        )
      }

      await requireUnchangedPlanSource(plan.source)
      await requireCodingRepositoryControl(repository)
      const codingResult = await runCodingStep(
        dependencies.coding,
        repoEduRoot,
        plan,
        stepNumber,
        observer,
      )
      await requireCodingRepositoryControl(repository)

      const reason = blockedReason(codingResult)
      if (reason !== null) {
        state = reduceRunOwnerState(state, { kind: "stop", reason })
        return stoppedResult(
          authorization.request,
          authorization.resolvedCeiling,
          reason,
        )
      }
      if (codingResult.status !== "succeeded") {
        throw new PlanImplementationRunError(
          "The coding helper returned an unknown result status.",
        )
      }
      validateStepCommitProposal(codingResult.commit)
      state = reduceRunOwnerState(state, {
        kind: "implementation-completed",
        step: stepNumber,
      })

      const preliminaryDiff = await admitOwnedRepositoryDiff(repository)
      if (preliminaryDiff.dependencyManifestChanged) {
        await repeatDependencyInstall(
          repoEduRoot,
          dependencies.commands,
          observer,
        )
      }
      const admittedDiff = await admitOwnedRepositoryDiff(repository)
      await runAdmittedStepChecks(
        repoEduRoot,
        step,
        dependencies.commands,
        observer,
      )
      await requireAdmittedRepositoryDiff(repository, admittedDiff)
      await requireUnchangedPlanSource(plan.source)

      state = reduceRunOwnerState(state, {
        kind: "checks-completed",
        step: stepNumber,
      })
      await stageAdmittedRepositoryDiff(repository, admittedDiff)
      await requireUnchangedPlanSource(plan.source)
      const committed = await commitAdmittedRepositoryDiff(
        repository,
        admittedDiff,
        plan.source,
        stepNumber,
        codingResult.commit,
      )
      repository = committed.nextAdmission
      state = reduceRunOwnerState(state, {
        kind: "commit-completed",
        step: stepNumber,
        checkout: "clean",
      })
    }

    return successfulResult(
      authorization.request,
      authorization.resolvedCeiling,
      state,
    )
  } finally {
    admissionClaim.release()
  }
}
