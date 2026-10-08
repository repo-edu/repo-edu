import { basename } from "node:path"
import { errorMessage } from "./feedback.js"
import type { WatchGrade } from "./glance.js"
import type { RoundDocuments } from "./output.js"
import {
  type Assistant,
  type AuditorOverride,
  type AuditSlot,
  type InteractiveSession,
  noOverride,
  type Phase,
  type PhaseFailure,
  type PhaseInput,
  type PhaseResult,
  type PhaseRun,
  type RoundDependencies,
  roundPhases,
} from "./phase.js"
import type { AuditReport, RoundRecommendation } from "./report.js"
import type { LandedCommit } from "./round-data.js"
import { transcriptNameStart } from "./round-paths.js"
import type { RoundSettings } from "./settings.js"
import { parseSubject, type Repository } from "./subject.js"
import { type AuditTarget, planStem, type RoundContext } from "./target.js"

/** What names a round before it starts: its target, who audits and on what. */
export type RoundSetup = RoundContext & {
  readonly auditor?: Assistant
  /** What the command line asked of the auditor's phases; absent asks nothing. */
  readonly override?: AuditorOverride
  /** Which member of a configured audit pair this round runs. */
  readonly auditSlot?: AuditSlot
  /** True adds the brief to every round in the command; absent runs none. */
  readonly brief?: boolean
  /** True only when this round belongs to the recommendation-led series. */
  readonly automatic?: boolean
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
  /** The round's Markdown transcript, which the brief retells once the fix has finished. */
  readonly transcript: string
  /** Null when the user asked for no watch, whatever the commit record says. */
  readonly watch: WatchTarget | null
}

export type BriefInput = RoundContext & {
  readonly transcript: string
  readonly brief: string
}

type RoundFailure = PhaseFailure &
  PhaseRun &
  RoundContext & {
    readonly phase: Phase | "ruling-input" | "complete"
  }

export type RoundResult = (
  | {
      readonly status: "finished"
      readonly report: string
      /** True only when the audit report itself contained no findings. */
      readonly cleanAudit: boolean
      /** The settled auditor's advice; widening rounds have none. */
      readonly recommendation: RoundRecommendation | null
      /** The grade the watch that followed the round recorded; null when none ran. */
      readonly watch: WatchGrade | null
    }
  | {
      readonly status: "awaiting-ruling"
      readonly report: string
      readonly session: InteractiveSession
    }
  | RoundFailure
) & { readonly commits: readonly LandedCommit[] }

export type BriefResult =
  | { readonly status: "finished"; readonly brief: string }
  | RoundFailure

export type CloseInput = RoundContext & {
  /** The active plan the close archives. */
  readonly plan: string
  /** The close session's own capability tag and model record for its commits. */
  readonly tag: string
  readonly record: string
  /** Why an episode that never shipped is abandoned; null for a completed plan. */
  readonly reason: string | null
}

export type CloseResult = { readonly status: "finished" } | RoundFailure

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
 * and on its own over an earlier transcript. Its workflow always belongs to
 * the Repo Edu root; output belongs beside the transcript at the plan root.
 */
export async function runBrief(
  input: BriefInput,
  dependencies: Pick<RoundDependencies, "runPhase" | "checkFile" | "showBrief">,
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
  try {
    await dependencies.showBrief(input.brief)
  } catch (error) {
    return {
      status: "failed",
      sessionId: brief.sessionId,
      phase: "brief",
      ...run,
      ...context,
      reason: errorMessage(error),
    }
  }
  return { status: "finished", brief: input.brief }
}

/**
 * Loop-close runs alone, on its own settings, and belongs to no round. The
 * session cannot tell its own capability, so it receives the tag and model
 * record its commits carry; its workflow owns the move, the commits and the
 * sidecars it deletes.
 */
export async function runClose(
  input: CloseInput,
  dependencies: Pick<RoundDependencies, "runPhase" | "fileExists">,
  settings: RoundSettings,
): Promise<CloseResult> {
  const run = roundPhases(settings.defaultAuditor, noOverride, settings).close
  const { cwd, repoEduRoot, planRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, roundKind }
  const close = await dependencies.runPhase.close({
    phase: "close",
    ...run,
    ...context,
    arguments:
      input.reason === null
        ? [input.plan, input.tag, input.record]
        : [input.plan, input.tag, input.record, input.reason],
    sessionId: null,
  })
  if (close.status === "failed")
    return { ...close, phase: "close", ...run, ...context }
  // The move is the close; a session that finished without it closed nothing.
  const failed = (reason: string): CloseResult => ({
    status: "failed",
    sessionId: close.sessionId,
    phase: "close",
    ...run,
    ...context,
    reason,
  })
  try {
    if (await dependencies.fileExists(input.plan))
      return failed(`The finished close left ${input.plan} at the plan root`)
  } catch (error) {
    return failed(errorMessage(error))
  }
  return { status: "finished" }
}

/**
 * The watch that follows a round. It reads the commit record and never the
 * round, so nothing it is given comes from the round's own files: the glance
 * decides from the log and the watch's own history alone, and the watch
 * grounds itself in the code the log points at. The glance exists because the
 * watch is expensive and most rounds do not move the record far enough to
 * change its reading; `glance.ts` owns its rule.
 *
 * Only a round that finished runs it. A round awaiting a ruling has not proved
 * that its work landed, so the record it would grade may be missing its own
 * commit. Nothing is lost by waiting: the glance counts what the log has
 * gained in corrections since the last watch, not how many rounds have run. A user who asked
 * for no watch gets none, whatever the record says.
 *
 * Returns the failure that stops the round, or the grade the watch recorded.
 * The grade is null when the watch was not due or was not asked for.
 */
async function runWatch(
  input: RoundContext & Pick<RoundInput, "watch"> & { readonly plan: string },
  dependencies: Pick<
    RoundDependencies,
    "runPhase" | "checkFile" | "glance" | "watchEvidence" | "watchGrade"
  >,
  settings: RoundSettings,
): Promise<RoundFailure | { readonly grade: WatchGrade | null }> {
  const target = input.watch
  if (target === null) return { grade: null }
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
  if (!glance.due) return { grade: null }
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
  try {
    return { grade: await dependencies.watchGrade(target.cacheRoot, stem) }
  } catch (error) {
    return {
      status: "failed",
      sessionId: watch.sessionId,
      phase: "watch",
      ...phases.watch,
      ...context,
      reason: errorMessage(error),
    }
  }
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
    input.auditSlot,
  )
  const { cwd, repoEduRoot, planRoot, roundKind } = input
  const context = { cwd, repoEduRoot, planRoot, roundKind }
  const auditInput: PhaseInput<"audit"> = {
    phase: "audit",
    ...phases.audit,
    ...context,
    arguments:
      "commits" in input
        ? [input.documents.report, ...input.commits]
        : input.roundKind === "planning"
          ? [input.documents.report, input.plan]
          : [input.documents.report, input.plan, input.scope],
    sessionId: null,
  }
  const audit = await reportPhase(
    () => dependencies.runPhase.audit(auditInput),
    input.documents.report,
    dependencies,
  )
  if (audit.status === "failed") {
    return {
      ...audit,
      phase: "audit",
      ...phases.audit,
      ...context,
      commits: [],
    }
  }

  const report = input.documents.report
  let evidence: AuditReport
  try {
    evidence = await dependencies.readReport(
      report,
      roundKind === "implementation"
        ? "implementation"
        : basename(input.plan).endsWith("-widen.md")
          ? "widening"
          : "detailing",
    )
  } catch (error) {
    return {
      status: "failed",
      sessionId: audit.sessionId,
      phase: "audit",
      ...phases.audit,
      ...context,
      reason: errorMessage(error),
      commits: [],
    }
  }
  // Zero findings complete in the runner. No later assistant or historical
  // watch can add anything needed to close this audit.
  if (evidence.findings.length === 0) {
    try {
      const completion = await dependencies.completeClean({
        ...input,
        report,
        judgedRepos: evidence.judgedRepos,
      })
      return {
        status: "finished",
        report,
        cleanAudit: true,
        recommendation: evidence.recommendation,
        watch: null,
        commits: completion.commits,
      }
    } catch (error) {
      return {
        status: "failed",
        sessionId: null,
        phase: "complete",
        ...phases.audit,
        ...context,
        reason: errorMessage(error),
        commits: [],
      }
    }
  }
  const twins = [input.documents.vet]
  let rebutted = false
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
      return {
        ...vet,
        phase: "vet",
        ...phases.vet,
        ...context,
        commits: [],
      }
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
        commits: [],
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
            sessionId: null,
          }),
        input.documents.rebut,
        dependencies,
      )
      if (rebut.status === "failed") {
        return {
          ...rebut,
          phase: "rebut",
          ...phases.rebut,
          ...context,
          commits: [],
        }
      }
      twins.push(input.documents.rebut)
      rebutted = true
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
      commits: [],
    }
  }
  let fixInput: PhaseInput<"fix"> = {
    phase: "fix",
    ...phases.fix,
    ...context,
    arguments: [report, ...twins],
    rulingFile: input.documents.ruling,
    sessionId: null,
  }
  let commits: readonly LandedCommit[] = []
  while (true) {
    const fix = await dependencies.runPhase.fix(fixInput)
    if (fix.status === "failed") {
      return { ...fix, phase: "fix", ...phases.fix, ...context, commits }
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
          commits,
        }
      }
    }

    if (fix.status === "finished") {
      try {
        const landed = await Promise.all(
          repositories.map(({ root, repository }, index) =>
            dependencies.readRecords(root, before[index], repository),
          ),
        )
        commits = landed
          .flat()
          .map(({ repository, sha }) => ({ repository, sha }))
        if ("plan" in input && landed.every((records) => records.length === 0))
          throw new Error("The finished fix landed no commit for a plan target")
        for (const [index, records] of landed.entries()) {
          for (const { subject } of records) {
            parseSubject(subject, repositories[index].repository)
          }
        }
        if (input.automatic === true && rebutted) {
          let vet: string
          let rebuttal: string
          try {
            const documents = await Promise.all([
              dependencies.readDocument(input.documents.vet),
              dependencies.readDocument(input.documents.rebut),
            ])
            vet = documents[0]
            rebuttal = documents[1]
          } catch (error) {
            return {
              status: "failed",
              sessionId: audit.sessionId,
              phase: "audit",
              ...phases.audit,
              ...context,
              reason: errorMessage(error),
              commits,
            }
          }
          const final = await dependencies.finalRecommendation({
            ...auditInput,
            sessionId: audit.sessionId,
            vet,
            rebuttal,
            records: landed.flat(),
          })
          if (final.status === "failed")
            return {
              ...final,
              phase: "audit",
              ...phases.audit,
              ...context,
              commits,
            }
          evidence = { ...evidence, recommendation: final.recommendation }
        }
        await dependencies.deleteRoundReports(
          planRoot,
          transcriptNameStart(input.transcript),
        )
      } catch (error) {
        return {
          status: "failed",
          sessionId: fix.sessionId,
          phase: "fix",
          ...phases.fix,
          ...context,
          reason: errorMessage(error),
          commits,
        }
      }
      // Retell the complete fix, including every ruling and resumed invocation.
      if (input.documents.brief !== null) {
        const brief = await runBrief(
          {
            ...context,
            transcript: input.transcript,
            brief: input.documents.brief,
          },
          dependencies,
          settings,
        )
        if (brief.status === "failed") return { ...brief, commits }
      }
      const watched =
        "plan" in input
          ? await runWatch(input, dependencies, settings)
          : { grade: null }
      if ("status" in watched) return { ...watched, commits }
      return {
        status: "finished",
        report,
        cleanAudit: false,
        recommendation: evidence.recommendation,
        watch: watched.grade,
        commits,
      }
    }

    const session: InteractiveSession = {
      ...phases.fix,
      sessionId: fix.sessionId,
      ...context,
    }
    try {
      const reply = await dependencies.requestRuling(input.documents.ruling)
      if (reply === null)
        return { status: "awaiting-ruling", report, session, commits }
      fixInput = {
        ...fixInput,
        sessionId: fix.sessionId,
        rulingReply: reply,
      }
    } catch (error) {
      return {
        status: "failed",
        phase: "ruling-input",
        ...session,
        reason: error instanceof Error ? error.message : String(error),
        commits,
      }
    }
  }
}
