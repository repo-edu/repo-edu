import type { ExecutionContext } from "./context.js"
import { errorMessage } from "./feedback.js"
import { type RoundDocuments, transcriptNameStart } from "./output.js"
import {
  type Assistant,
  type AuditorOverride,
  type InteractiveSession,
  noOverride,
  type Phase,
  type PhaseFailure,
  type PhaseResult,
  type PhaseRun,
  type RoundDependencies,
  roundPhases,
  type SessionContext,
} from "./phase.js"
import type { AuditReport } from "./report.js"
import type { RoundSettings } from "./settings.js"
import { parseSubject, type Repository } from "./subject.js"
import { type AuditTarget, planStem } from "./target.js"

/** What names a round before it starts: its target, who audits and on what. */
export type RoundSetup = ExecutionContext & {
  readonly auditor?: Assistant
  /** What the command line asked of the auditor's phases; absent asks nothing. */
  readonly override?: AuditorOverride
} & AuditTarget

/** Where a watch that follows the round writes, and where it keeps its history. */
export type WatchTarget = {
  /** The watch's document, named for the round the watch follows. */
  readonly file: string
  /** The shared `audit-round` cache, which holds the watch's own history. */
  readonly cacheRoot: string
}

export type RoundInput = RoundSetup & {
  readonly documents: RoundDocuments
  /** The round's Markdown transcript, which the brief retells once the fix has returned. */
  readonly transcript: string
  /** Null when the user asked for no watch, whatever the commit record says. */
  readonly watch: WatchTarget | null
}

export type BriefInput = ExecutionContext & {
  readonly transcript: string
  readonly brief: string
}

type RoundFailure = PhaseFailure &
  PhaseRun &
  ExecutionContext & {
    readonly phase: Phase | "handover" | "complete"
  }

export type RoundResult =
  | {
      readonly status: "finished"
      readonly report: string
      /** True only when the audit report itself contained no findings. */
      readonly cleanAudit: boolean
    }
  | {
      readonly status: "handed-over"
      readonly report: string
      readonly session: InteractiveSession
    }
  | RoundFailure

export type BriefResult =
  | { readonly status: "finished"; readonly brief: string }
  | RoundFailure

/** The share of its window at which Codex summarises a session in place. */
const compactionShare = 0.9

/**
 * What a rebuttal spends: the report, its vet twin and the source behind every
 * verdict. A four-finding round measured 30k, doubled here for the findings a
 * round can carry.
 */
const rebuttalTokens = 60_000

/**
 * The single owner of whether the rebuttal answers in the audit session.
 * A summarised session holds a summary where the evidence was, so a measured
 * shortfall starts the rebuttal fresh instead. It loses nothing it may rely on:
 * its workflow grounds every answer in what it reads now. An assistant that
 * reports no window reports no shortfall, and keeps the resume.
 */
export function rebuttalSessionId(
  sessionId: string,
  context: SessionContext | null,
): string | null {
  if (context?.window == null) return sessionId
  const room = context.window * compactionShare - context.tokens
  return room < rebuttalTokens ? null : sessionId
}

/** A completed report phase must have written its supplied output. */
async function reportPhase<R extends PhaseResult>(
  invoke: () => Promise<R>,
  file: string,
  dependencies: Pick<RoundDependencies, "checkFile">,
): Promise<R | PhaseFailure> {
  const result = await invoke()
  if (result.status === "failed") return result
  try {
    await dependencies.checkFile(file)
    return result
  } catch (error) {
    return {
      status: "failed",
      sessionId: result.sessionId,
      reason: errorMessage(error),
    }
  }
}

/**
 * The brief reads only the transcript, so it runs the same way after a round
 * and on its own over an earlier transcript. Its launcher always belongs to
 * the Repo Edu root; output belongs beside the transcript at either root.
 */
export async function runBrief(
  input: BriefInput,
  dependencies: Pick<RoundDependencies, "runPhase" | "checkFile">,
  settings: RoundSettings,
): Promise<BriefResult> {
  // The brief uses its own settings, so no auditor override reaches this phase.
  const run = roundPhases("codex", noOverride, settings).brief
  const { cwd, repoEduRoot, planRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, roundKind }
  const brief = await reportPhase(
    () =>
      dependencies.runPhase.brief({
        phase: "brief",
        ...run,
        ...context,
        arguments: [input.transcript, input.brief],
        sessionId: null,
      }),
    input.brief,
    dependencies,
  )
  if (brief.status === "failed")
    return { ...brief, phase: "brief", ...run, ...context }
  return { status: "finished", brief: input.brief }
}

/**
 * The watch that follows a round. It reads the commit record and never the
 * round, so nothing it is given comes from the round's own files: the glance
 * decides from the log and the watch's own history alone, and the watch
 * grounds itself in the code the log points at. The glance exists because the
 * watch is expensive and most rounds do not move the record far enough to
 * change its reading; `glance.ts` owns its rule.
 *
 * Only a round that finished runs it. A round that handed over has not proved
 * that its work landed, so the record it would grade may be missing its own
 * commit. Nothing is lost by waiting: the glance counts what the log has
 * gained in corrections since the last watch, not how many rounds have run. A user who asked
 * for no watch gets none, whatever the record says.
 *
 * Returns the failure that stops the round, or null when the watch ran, was
 * not due or was not asked for.
 */
async function runWatch(
  input: ExecutionContext &
    Pick<RoundInput, "watch"> & { readonly plan: string },
  dependencies: Pick<
    RoundDependencies,
    "runPhase" | "checkFile" | "glance" | "watchEvidence"
  >,
  settings: RoundSettings,
): Promise<RoundFailure | null> {
  const target = input.watch
  if (target === null) return null
  // The watch uses its configured assistant, independently of the auditor.
  const phases = roundPhases("codex", noOverride, settings)
  const { cwd, repoEduRoot, planRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, roundKind }
  const stem = planStem(input.plan)
  const glance = await dependencies.glance({
    cwd,
    repoEduRoot,
    repository: roundKind === "planning" ? "plan" : "repo-edu",
    cacheRoot: target.cacheRoot,
    stem,
  })
  if (!glance.due) return null
  const evidence = await dependencies.watchEvidence({ ...context, stem })

  const watch = await reportPhase(
    () =>
      dependencies.runPhase.watch({
        phase: "watch",
        ...phases.watch,
        ...context,
        arguments: [target.file, target.cacheRoot],
        evidence,
        sessionId: null,
      }),
    target.file,
    dependencies,
  )
  if (watch.status === "failed")
    return { ...watch, phase: "watch", ...phases.watch, ...context }

  // The watch is a document the user decides from, so a session that did not
  // write it reads it once before the user does, against the same Git evidence.
  const edit = await reportPhase(
    () =>
      dependencies.runPhase["watch-edit"]({
        phase: "watch-edit",
        ...phases["watch-edit"],
        ...context,
        arguments: [target.file],
        evidence,
        sessionId: null,
      }),
    target.file,
    dependencies,
  )
  if (edit.status === "failed")
    return {
      ...edit,
      phase: "watch-edit",
      ...phases["watch-edit"],
      ...context,
    }
  return null
}

export async function runRound(
  input: RoundInput,
  dependencies: RoundDependencies,
  settings: RoundSettings,
): Promise<RoundResult> {
  const phases = roundPhases(
    input.auditor ?? settings.defaultAuditor,
    input.override ?? noOverride,
    settings,
  )
  const { cwd, repoEduRoot, planRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, roundKind }
  const audit = await reportPhase(
    () =>
      dependencies.runPhase.audit({
        phase: "audit",
        ...phases.audit,
        ...context,
        arguments:
          "commits" in input
            ? [input.documents.report, ...input.commits]
            : input.scope === undefined
              ? [input.documents.report, input.plan]
              : [input.documents.report, input.plan, input.scope],
        sessionId: null,
      }),
    input.documents.report,
    dependencies,
  )
  if (audit.status === "failed") {
    return { ...audit, phase: "audit", ...phases.audit, ...context }
  }

  const report = input.documents.report
  let evidence: AuditReport
  try {
    evidence = await dependencies.readReport(report, roundKind)
  } catch (error) {
    return {
      status: "failed",
      sessionId: audit.sessionId,
      phase: "audit",
      ...phases.audit,
      ...context,
      reason: errorMessage(error),
    }
  }
  // Zero findings complete in the runner. No later assistant or historical
  // watch can add anything needed to close this audit.
  if (evidence.findings.length === 0) {
    try {
      await dependencies.completeClean({
        ...input,
        report,
        judgedRepos: evidence.judgedRepos,
      })
      return { status: "finished", report, cleanAudit: true }
    } catch (error) {
      return {
        status: "failed",
        sessionId: null,
        phase: "complete",
        ...phases.audit,
        ...context,
        reason: errorMessage(error),
      }
    }
  }
  const twins = [input.documents.vet]
  {
    const vet = await reportPhase(
      () =>
        dependencies.runPhase.vet({
          phase: "vet",
          ...phases.vet,
          ...context,
          arguments: [report, input.documents.vet],
          sessionId: null,
        }),
      input.documents.vet,
      dependencies,
    )
    if (vet.status === "failed") {
      return { ...vet, phase: "vet", ...phases.vet, ...context }
    }

    let accepted: boolean
    try {
      accepted = await dependencies.readVet(
        input.documents.vet,
        evidence.findings,
      )
    } catch (error) {
      return {
        status: "failed",
        sessionId: vet.sessionId,
        phase: "vet",
        ...phases.vet,
        ...context,
        reason: errorMessage(error),
      }
    }
    if (!accepted) {
      const rebut = await reportPhase(
        () =>
          dependencies.runPhase.rebut({
            phase: "rebut",
            ...phases.rebut,
            ...context,
            arguments: [report, input.documents.vet, input.documents.rebut],
            sessionId: rebuttalSessionId(audit.sessionId, audit.context),
          }),
        input.documents.rebut,
        dependencies,
      )
      if (rebut.status === "failed") {
        return { ...rebut, phase: "rebut", ...phases.rebut, ...context }
      }
      twins.push(input.documents.rebut)
    }
  }

  const repositories: readonly { root: string; repository: Repository }[] = [
    { root: repoEduRoot, repository: "repo-edu" },
    { root: planRoot, repository: "plan" },
  ]
  let before: readonly string[]
  try {
    before = await Promise.all(
      repositories.map(({ root }) => dependencies.readHead(root)),
    )
  } catch (error) {
    return {
      status: "failed",
      sessionId: null,
      phase: "fix",
      ...phases.fix,
      ...context,
      reason: errorMessage(error),
    }
  }
  const fix = await dependencies.runPhase.fix({
    phase: "fix",
    ...phases.fix,
    ...context,
    arguments: [report, ...twins],
    rulingFile: input.documents.ruling,
    sessionId: null,
  })
  if (fix.status === "failed") {
    return { ...fix, phase: "fix", ...phases.fix, ...context }
  }

  if (fix.status === "needs-ruling") {
    try {
      await dependencies.checkFile(input.documents.ruling)
    } catch (error) {
      return {
        status: "failed",
        phase: "fix",
        sessionId: fix.sessionId,
        ...phases.fix,
        ...context,
        reason: errorMessage(error),
      }
    }
  }

  if (fix.status === "finished") {
    try {
      await dependencies.closeRound(cwd, transcriptNameStart(input.transcript))
      const landed = await Promise.all(
        repositories.map(({ root }, index) =>
          dependencies.readSubjects(root, before[index]),
        ),
      )
      if ("plan" in input && landed.every((subjects) => subjects.length === 0))
        throw new Error("The finished fix landed no commit for a plan target")
      for (const [index, subjects] of landed.entries()) {
        for (const subject of subjects) {
          parseSubject(subject, repositories[index].repository)
        }
      }
    } catch (error) {
      return {
        status: "failed",
        sessionId: fix.sessionId,
        phase: "fix",
        ...phases.fix,
        ...context,
        reason: errorMessage(error),
      }
    }
  }

  // Complete the brief before handing the fix session back to the user.
  const brief = await runBrief(
    { ...context, transcript: input.transcript, brief: input.documents.brief },
    dependencies,
    settings,
  )
  if (brief.status === "failed") return brief
  if (fix.status === "finished") {
    if ("plan" in input) {
      const watched = await runWatch(input, dependencies, settings)
      if (watched !== null) return watched
    }
    return { status: "finished", report, cleanAudit: false }
  }

  const session: InteractiveSession = {
    ...phases.fix,
    sessionId: fix.sessionId,
    ...context,
  }
  try {
    await dependencies.prepareHandover(session)
    await dependencies.openSession(session)
  } catch (error) {
    return {
      status: "failed",
      phase: "handover",
      ...session,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  // An interactive CLI exit does not prove that the workflow finished its work.
  return { status: "handed-over", report, session }
}
