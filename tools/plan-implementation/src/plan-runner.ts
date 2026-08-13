import { validateStepCommitProposal } from "./commit-proposal.js"
import type {
  CodingAdapter,
  CodingEvent,
  CodingResult,
  CodingRun,
  PlanImplementationFinalResult,
  PlanImplementationRunRequest,
} from "./contracts.js"
import { resolvePlanCursor } from "./git-cursor.js"
import { readCommittedImplementationPlan } from "./plan-reader.js"
import { requireUnchangedPlanSource } from "./plan-source-admission.js"
import {
  type AdmittedRepositoryDiff,
  admitOwnedRepositoryDiff,
  commitAdmittedRepositoryDiff,
  openRepositoryAdmission,
  type RepositoryAdmission,
  type RepositoryStepCommit,
  requireAdmittedRepositoryDiff,
  requireCodingRepositoryControl,
  resolveRepoEduRoot,
  stageAdmittedRepositoryDiff,
} from "./repository-admission.js"
import {
  createRunLifetime,
  type PlanImplementationOwnedChildren,
} from "./run-lifetime.js"
import { resolveRunAuthorization } from "./run-limits.js"
import {
  createRunOwnerState,
  isNewWorkAdmissionOpen,
  type PlanImplementationRunState,
  readRunClosureReason,
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
  readonly signal?: AbortSignal
}

export type PlanImplementationRunObserver = StepCommandObserver & {
  codingEvent(step: number, event: CodingEvent): void
}

export type PlanImplementationRunDependencies = {
  readonly coding: CodingAdapter
  readonly commands: StepCommandExecutor
  readonly ownedChildren: PlanImplementationOwnedChildren
  readonly observer?: PlanImplementationRunObserver
  readonly claimAdmission?: (
    repoEduRoot: string,
  ) => Promise<PlanImplementationRunnerAdmission>
  readonly repositoryCommit?: PlanImplementationRepositoryCommit
}

export type PlanImplementationRepositoryCommit = {
  stage(
    admission: RepositoryAdmission,
    diff: AdmittedRepositoryDiff,
  ): Promise<void>
  commit(
    admission: RepositoryAdmission,
    diff: AdmittedRepositoryDiff,
    source: Parameters<typeof commitAdmittedRepositoryDiff>[2],
    step: number,
    proposal: Parameters<typeof commitAdmittedRepositoryDiff>[4],
    stopSignal?: AbortSignal,
  ): Promise<RepositoryStepCommit>
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

const defaultRepositoryCommit: PlanImplementationRepositoryCommit = {
  stage: stageAdmittedRepositoryDiff,
  commit: commitAdmittedRepositoryDiff,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runCodingStep(
  coding: CodingAdapter,
  repoEduRoot: string,
  plan: Awaited<ReturnType<typeof readCommittedImplementationPlan>>,
  step: number,
  observer: PlanImplementationRunObserver,
  setActiveRun: (run: CodingRun | null) => void,
): Promise<CodingResult> {
  const run = await coding.start({ repoEduRoot, plan, activeStep: step })
  setActiveRun(run)
  try {
    const [result] = await Promise.all([
      run.result,
      drainCodingEvents(step, run.events, observer),
    ])
    return result
  } finally {
    setActiveRun(null)
  }
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
  const repositoryCommit =
    dependencies.repositoryCommit ?? defaultRepositoryCommit
  let state: PlanImplementationRunState | null = null
  let pendingStopReason: string | null = null
  const closeNewWork = (reason: string): void => {
    pendingStopReason ??= reason
    if (
      state !== null &&
      state.status !== "completed" &&
      state.status !== "bound-reached" &&
      state.status !== "stopped"
    ) {
      state = reduceRunOwnerState(state, {
        kind: "close-new-work",
        reason,
      })
    }
  }
  const lifetime = createRunLifetime({
    signal: request.signal,
    ownedChildren: dependencies.ownedChildren,
    stopRequested: closeNewWork,
  })

  try {
    let repository = await openRepositoryAdmission(repoEduRoot)
    const cursor = await resolvePlanCursor(repoEduRoot, plan)
    const authorization = resolveRunAuthorization(plan, cursor, request.run)
    state = createRunOwnerState(authorization)
    if (pendingStopReason !== null) {
      closeNewWork(pendingStopReason)
    }
    state = reduceRunOwnerState(state, {
      kind: "admission-completed",
    })

    const finishStoppedRun =
      async (): Promise<PlanImplementationFinalResult> => {
        await lifetime.stopAndConfirm()
        if (state === null) {
          throw new PlanImplementationRunError(
            "A stopped run lost its owner state.",
          )
        }
        if (state.status !== "stopped") {
          const reason = readRunClosureReason(state)
          if (reason === null) {
            throw new PlanImplementationRunError(
              "A stopped run did not close new-work admission.",
            )
          }
          state = reduceRunOwnerState(state, { kind: "closed-work-settled" })
        }
        if (state.status !== "stopped") {
          throw new PlanImplementationRunError(
            "Closed work did not produce a stopped run.",
          )
        }
        return stoppedResult(
          authorization.request,
          authorization.resolvedCeiling,
          state.reason,
        )
      }

    if (state.status === "stopped") {
      return await finishStoppedRun()
    }

    try {
      while (state.status === "implementing") {
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }
        const stepNumber = state.step
        const step = plan.steps[stepNumber - 1]
        if (step?.number !== stepNumber) {
          throw new PlanImplementationRunError(
            `The run owner selected missing implementation step ${stepNumber}.`,
          )
        }

        await requireUnchangedPlanSource(plan.source)
        await requireCodingRepositoryControl(repository)
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }
        const codingResult = await runCodingStep(
          dependencies.coding,
          repoEduRoot,
          plan,
          stepNumber,
          observer,
          lifetime.setActiveCodingRun,
        )
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }
        await requireCodingRepositoryControl(repository)

        if (codingResult.status === "blocked") {
          closeNewWork(codingResult.reason)
          return await finishStoppedRun()
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
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }
        if (preliminaryDiff.dependencyManifestChanged) {
          await repeatDependencyInstall(
            repoEduRoot,
            dependencies.commands,
            observer,
          )
          if (!isNewWorkAdmissionOpen(state)) {
            return await finishStoppedRun()
          }
        }
        const admittedDiff = await admitOwnedRepositoryDiff(repository)
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }
        await runAdmittedStepChecks(
          repoEduRoot,
          step,
          dependencies.commands,
          observer,
        )
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }
        await requireAdmittedRepositoryDiff(repository, admittedDiff)
        await requireUnchangedPlanSource(plan.source)
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }

        state = reduceRunOwnerState(state, {
          kind: "checks-completed",
          step: stepNumber,
        })
        await repositoryCommit.stage(repository, admittedDiff)
        await requireUnchangedPlanSource(plan.source)
        if (!isNewWorkAdmissionOpen(state)) {
          return await finishStoppedRun()
        }
        const committed = await repositoryCommit.commit(
          repository,
          admittedDiff,
          plan.source,
          stepNumber,
          codingResult.commit,
          request.signal,
        )
        repository = committed.nextAdmission
        state = reduceRunOwnerState(state, {
          kind: "commit-completed",
          step: stepNumber,
          checkout: "clean",
        })
        if (state.status === "stopped") {
          return await finishStoppedRun()
        }
      }
    } catch (error) {
      closeNewWork(readRunClosureReason(state) ?? errorMessage(error))
      return await finishStoppedRun()
    }

    return successfulResult(
      authorization.request,
      authorization.resolvedCeiling,
      state,
    )
  } finally {
    lifetime.dispose()
    await lifetime.stopAndConfirm()
    admissionClaim.release()
  }
}
