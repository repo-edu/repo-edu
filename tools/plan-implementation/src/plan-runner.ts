import { validateStepCommitProposal } from "./commit-proposal.js"
import type {
  CodingAdapter,
  CodingEvent,
  CodingResult,
  CommittedImplementationPlan,
  PlanImplementationFinalResult,
  PlanImplementationRunRequest,
} from "./contracts.js"
import { resolvePlanCursor } from "./git-cursor.js"
import {
  parseCommittedImplementationPlan,
  readCommittedPlanSource,
} from "./plan-reader.js"
import { requireUnchangedPlanSource } from "./plan-source-admission.js"
import type { PlanImplementationEventObserver } from "./progress-events.js"
import {
  type AdmittedRepositoryDiff,
  admitOutsideWork,
  admitRepositoryDiffWithOutsideWork,
  commitAdmittedRepositoryDiff,
  type OutsideWorkAdmission,
  openRepositoryAdmission,
  type RepositoryAdmission,
  type RepositoryDiffWithOutsideWork,
  type RepositoryStepCommit,
  requireMatchingRepositoryDiff,
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
  createPlanImplementationRunProgress,
  type PlanImplementationRunProgress,
} from "./run-progress.js"
import {
  claimPlanImplementationRunnerAdmission,
  type PlanImplementationRunnerAdmission,
} from "./runner-admission.js"
import {
  repeatDependencyInstall,
  runAdmittedStepChecks,
  type StepCommandExecutor,
} from "./step-checks.js"
import type { PlanImplementationTranscriptFactory } from "./transcript.js"

export type RunPlanImplementationRequest = {
  readonly repoEduRoot: string
  readonly planPath: string
  readonly run: PlanImplementationRunRequest
  readonly signal?: AbortSignal
}

export type PlanImplementationRunDependencies = {
  readonly coding: CodingAdapter
  readonly commands: StepCommandExecutor
  readonly ownedChildren: PlanImplementationOwnedChildren
  readonly presentation?: PlanImplementationEventObserver
  readonly createTranscript?: PlanImplementationTranscriptFactory
  readonly now?: () => Date
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

const defaultRepositoryCommit: PlanImplementationRepositoryCommit = {
  stage: stageAdmittedRepositoryDiff,
  commit: commitAdmittedRepositoryDiff,
}

async function drainCodingEvents(
  step: number,
  events: AsyncIterable<CodingEvent>,
  progress: PlanImplementationRunProgress,
): Promise<void> {
  for await (const event of events) {
    progress.codingEvent(step, event)
  }
}

function stoppedResult(
  request: PlanImplementationRunRequest,
  resolvedCeiling: number | null,
  transcriptPath: string,
  reason: string,
): PlanImplementationFinalResult {
  return {
    ...request,
    resolvedCeiling,
    transcriptPath,
    outcome: "stopped",
    reason,
  }
}

function successfulResult(
  request: PlanImplementationRunRequest,
  resolvedCeiling: number,
  transcriptPath: string,
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
    transcriptPath,
    outcome: state.status,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function requireActiveStepCursor(
  outsideWork: OutsideWorkAdmission,
  plan: CommittedImplementationPlan,
  step: number,
): Promise<RepositoryAdmission> {
  if (!outsideWork.outsideWorkFound) {
    return outsideWork.admission
  }
  const cursor = await resolvePlanCursor(
    outsideWork.admission.repoEduRoot,
    plan,
  )
  if (cursor.nextStep !== step) {
    throw new PlanImplementationRunError(
      `The current branch plan cursor moved from step ${step} to step ${cursor.nextStep} during implementation.`,
    )
  }
  return outsideWork.admission
}

async function admitActiveStepDiff(
  repository: RepositoryAdmission,
  plan: CommittedImplementationPlan,
  step: number,
): Promise<RepositoryDiffWithOutsideWork> {
  const withOutsideWork = await admitRepositoryDiffWithOutsideWork(repository)
  await requireActiveStepCursor(withOutsideWork, plan, step)
  return withOutsideWork
}

async function runCodingStep(
  coding: CodingAdapter,
  repoEduRoot: string,
  plan: CommittedImplementationPlan,
  step: number,
  progress: PlanImplementationRunProgress,
  signal?: AbortSignal,
): Promise<CodingResult> {
  const run = await coding.start(
    { repoEduRoot, plan, activeStep: step },
    signal,
  )
  const [result] = await Promise.all([
    run.result,
    drainCodingEvents(step, run.events, progress),
  ])
  return result
}

export async function runPlanImplementation(
  request: RunPlanImplementationRequest,
  dependencies: PlanImplementationRunDependencies,
): Promise<PlanImplementationFinalResult> {
  const repoEduRoot = await resolveRepoEduRoot(request.repoEduRoot)
  const committedSource = await readCommittedPlanSource(request.planPath)
  const claim =
    dependencies.claimAdmission ?? claimPlanImplementationRunnerAdmission
  const repositoryCommit =
    dependencies.repositoryCommit ?? defaultRepositoryCommit
  let plan: CommittedImplementationPlan
  try {
    plan = parseCommittedImplementationPlan(committedSource)
  } catch (error) {
    const progress = await createPlanImplementationRunProgress({
      repoEduRoot,
      source: committedSource.source,
      request: request.run,
      totalSteps: 0,
      presentation: dependencies.presentation,
      createTranscript: dependencies.createTranscript,
      now: dependencies.now,
    })
    try {
      progress.start(null)
      const result = stoppedResult(
        request.run,
        null,
        progress.transcriptPath,
        errorMessage(error),
      )
      progress.finish(result)
      return result
    } finally {
      progress.close()
    }
  }
  const progress = await createPlanImplementationRunProgress({
    repoEduRoot,
    source: plan.source,
    request: request.run,
    totalSteps: plan.steps.length,
    presentation: dependencies.presentation,
    createTranscript: dependencies.createTranscript,
    now: dependencies.now,
  })
  let state: PlanImplementationRunState | null = null
  let releaseAdmission: (() => void) | null = null
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
  const finishPreflightStop = (
    reason: string,
  ): PlanImplementationFinalResult => {
    progress.start(null)
    const result = stoppedResult(
      request.run,
      null,
      progress.transcriptPath,
      reason,
    )
    progress.finish(result)
    return result
  }
  const lifetime = createRunLifetime({
    signal: request.signal,
    ownedChildren: dependencies.ownedChildren,
    stopRequested(reason) {
      progress.requestStop()
      closeNewWork(reason)
    },
  })

  try {
    if (pendingStopReason !== null) {
      return finishPreflightStop(pendingStopReason)
    }
    let admissionClaim: Awaited<ReturnType<typeof claim>>
    try {
      admissionClaim = await claim(repoEduRoot)
    } catch (error) {
      return finishPreflightStop(errorMessage(error))
    }
    if (admissionClaim.status === "busy") {
      return finishPreflightStop(
        "Another plan implementation runner owns this checkout.",
      )
    }
    releaseAdmission = admissionClaim.release

    let repository: RepositoryAdmission
    let cursor: Awaited<ReturnType<typeof resolvePlanCursor>>
    let authorization: ReturnType<typeof resolveRunAuthorization>
    try {
      repository = await openRepositoryAdmission(repoEduRoot)
      cursor = await resolvePlanCursor(repoEduRoot, plan)
      authorization = resolveRunAuthorization(plan, cursor, request.run)
    } catch (error) {
      return finishPreflightStop(errorMessage(error))
    }
    progress.start(authorization.resolvedCeiling)
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
          progress.transcriptPath,
          state.reason,
        )
      }

    const finishRun = (
      result: PlanImplementationFinalResult,
    ): PlanImplementationFinalResult => {
      progress.finish(result)
      return result
    }

    if (state.status === "stopped") {
      return finishRun(await finishStoppedRun())
    }

    try {
      while (state.status === "implementing") {
        if (!isNewWorkAdmissionOpen(state)) {
          return finishRun(await finishStoppedRun())
        }
        const stepNumber = state.step
        const step = plan.steps[stepNumber - 1]
        if (step?.number !== stepNumber) {
          throw new PlanImplementationRunError(
            `The run owner selected missing implementation step ${stepNumber}.`,
          )
        }
        progress.stepStarted(stepNumber, step.title)
        progress.phaseChanged("implementing")

        await requireUnchangedPlanSource(plan.source)
        const beforeCoding = await admitOutsideWork(repository)
        let dependencyInstallRequired =
          beforeCoding.outsideWorkDependencyManifestChanged
        repository = await requireActiveStepCursor(
          beforeCoding,
          plan,
          stepNumber,
        )
        if (!isNewWorkAdmissionOpen(state)) {
          return finishRun(await finishStoppedRun())
        }
        const codingResult = await runCodingStep(
          dependencies.coding,
          repoEduRoot,
          plan,
          stepNumber,
          progress,
          request.signal,
        )
        if (!isNewWorkAdmissionOpen(state)) {
          return finishRun(await finishStoppedRun())
        }
        if (codingResult.status === "blocked") {
          closeNewWork(codingResult.reason)
          return finishRun(await finishStoppedRun())
        }
        if (codingResult.status !== "succeeded") {
          throw new PlanImplementationRunError(
            "The plan-step Codex SDK host process returned an unknown result status.",
          )
        }
        validateStepCommitProposal(codingResult.commit)
        state = reduceRunOwnerState(state, {
          kind: "implementation-completed",
          step: stepNumber,
        })
        progress.phaseChanged("checking")

        let admittedDiff: AdmittedRepositoryDiff
        while (true) {
          const preliminary = await admitActiveStepDiff(
            repository,
            plan,
            stepNumber,
          )
          repository = preliminary.admission
          if (!isNewWorkAdmissionOpen(state)) {
            return finishRun(await finishStoppedRun())
          }
          dependencyInstallRequired ||=
            preliminary.diff.dependencyManifestChanged ||
            preliminary.outsideWorkDependencyManifestChanged
          if (dependencyInstallRequired) {
            await repeatDependencyInstall(
              repoEduRoot,
              dependencies.commands,
              progress.commands,
              request.signal,
            )
            if (!isNewWorkAdmissionOpen(state)) {
              return finishRun(await finishStoppedRun())
            }
            dependencyInstallRequired = false
            const afterInstall = await admitActiveStepDiff(
              repository,
              plan,
              stepNumber,
            )
            repository = afterInstall.admission
            if (afterInstall.outsideWorkFound) {
              dependencyInstallRequired ||=
                afterInstall.outsideWorkDependencyManifestChanged
              continue
            }
            admittedDiff = afterInstall.diff
          } else {
            admittedDiff = preliminary.diff
          }
          await runAdmittedStepChecks(
            repoEduRoot,
            step,
            {
              paths: admittedDiff.paths,
              finalStep: stepNumber === plan.steps.length,
            },
            dependencies.commands,
            progress.commands,
            request.signal,
          )
          if (!isNewWorkAdmissionOpen(state)) {
            return finishRun(await finishStoppedRun())
          }
          const afterChecks = await admitActiveStepDiff(
            repository,
            plan,
            stepNumber,
          )
          repository = afterChecks.admission
          if (afterChecks.outsideWorkFound) {
            dependencyInstallRequired ||=
              afterChecks.outsideWorkDependencyManifestChanged
            continue
          }
          requireMatchingRepositoryDiff(admittedDiff, afterChecks.diff)
          break
        }
        await requireUnchangedPlanSource(plan.source)
        if (!isNewWorkAdmissionOpen(state)) {
          return finishRun(await finishStoppedRun())
        }

        state = reduceRunOwnerState(state, {
          kind: "checks-completed",
          step: stepNumber,
        })
        progress.phaseChanged("committing")
        await repositoryCommit.stage(repository, admittedDiff)
        await requireUnchangedPlanSource(plan.source)
        if (!isNewWorkAdmissionOpen(state)) {
          return finishRun(await finishStoppedRun())
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
        progress.stepCommitted(
          stepNumber,
          committed.commitOid,
          codingResult.commit.subject,
        )
        if (state.status === "stopped") {
          return finishRun(await finishStoppedRun())
        }
      }
    } catch (error) {
      closeNewWork(readRunClosureReason(state) ?? errorMessage(error))
      return finishRun(await finishStoppedRun())
    }

    return finishRun(
      successfulResult(
        authorization.request,
        authorization.resolvedCeiling,
        progress.transcriptPath,
        state,
      ),
    )
  } finally {
    try {
      lifetime.dispose()
      await lifetime.stopAndConfirm()
      releaseAdmission?.()
    } finally {
      progress.close()
    }
  }
}
