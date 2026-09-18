import { dirname } from "node:path"
import {
  type Assistant,
  type AuditorOverride,
  type InteractiveSession,
  noOverride,
  type Phase,
  type PhaseFailure,
  type PhaseRun,
  type RoundDependencies,
  roundPhases,
  type SessionContext,
  type Tier,
} from "./phase.js"
import { workflowPath } from "./requests.js"
import type { AuditTarget } from "./target.js"

/** What names a round before it starts: its target, who audits and on what. */
export type RoundSetup = {
  readonly repoRoot: string
  readonly auditor?: Assistant
  /** What the command line asked of the auditor's phases; absent asks nothing. */
  readonly override?: AuditorOverride
} & AuditTarget

export type RoundInput = RoundSetup & {
  /** The output owner's claimed target and number, reused at either report root. */
  readonly nameStart: string
  /** The round's Markdown transcript, which the brief retells once the fix has returned. */
  readonly transcript: string
  /** Where the watch writes its verdict, named for the round the watch follows. */
  readonly verdict: string
  /** The shared `audit-round` cache, which holds the watch's own history. */
  readonly cacheRoot: string
}

export type BriefInput = {
  readonly repoRoot: string
  readonly transcript: string
}

type RoundFailure = PhaseFailure &
  PhaseRun & {
    readonly phase: Phase | "handover"
    readonly cwd: string
  }

export type RoundResult =
  | {
      readonly status: "finished"
      readonly report: string
      /** The fix's own grade, which the chain rule reads. Null when the round was clean. */
      readonly tier: Tier | null
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

/** The most rounds one chained run may spend on its scope. */
export const chainCap = 3

/** Why a chained run stopped, which the output turns into words. */
export type ChainStop = "cap" | "crossed" | "open" | "failed"

export type ChainDecision =
  | { readonly next: Assistant }
  | { readonly next: null; readonly stop: ChainStop }

function other(assistant: Assistant): Assistant {
  return assistant === "codex" ? "claude" : "codex"
}

/**
 * The single owner of whether a chained run audits the same scope again, and
 * with whom. While the current auditor still lands an A or B it keeps looking,
 * because a second opinion buys nothing where findings are still coming. Once
 * it falls to C, D or clean, the other assistant takes exactly one round and
 * the chain ends, so the crossover is taken once and never iterated. A round
 * that handed over or failed ends the chain where it stands: the user is in
 * the session or the reason is on screen.
 */
export function chainDecision(
  result: RoundResult,
  current: Assistant,
  start: Assistant,
  completed: number,
): ChainDecision {
  if (result.status === "failed") return { next: null, stop: "failed" }
  if (result.status === "handed-over") return { next: null, stop: "open" }
  if (current !== start) return { next: null, stop: "crossed" }
  if (completed >= chainCap) return { next: null, stop: "cap" }
  return {
    next: result.tier === "a" || result.tier === "b" ? current : other(current),
  }
}

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

/**
 * The brief reads only the transcript, so it runs the same way after a round
 * and on its own over an earlier transcript. Its launcher always belongs to
 * the Repo Edu root, because every transcript is written there.
 */
export async function runBrief(
  input: BriefInput,
  dependencies: Pick<RoundDependencies, "runPhase">,
): Promise<BriefResult> {
  // The brief pins its own model, so no override reaches this phase.
  const run = roundPhases("codex", noOverride).brief
  const brief = await dependencies.runPhase.brief({
    phase: "brief",
    ...run,
    cwd: input.repoRoot,
    ownerRoot: input.repoRoot,
    arguments: [input.transcript],
    sessionId: null,
  })
  if (brief.status === "failed")
    return { ...brief, phase: "brief", ...run, cwd: input.repoRoot }
  return { status: "finished", brief: brief.file }
}

/**
 * The watch that follows a round. It reads the commit record and never the
 * round, so nothing it is given comes from the round's own files: the glance
 * decides from the log alone and the verdict grounds itself in the code the
 * log points at. The glance exists because the watch is expensive and most
 * rounds do not move the record far enough to change its reading.
 *
 * Only a round that finished runs it. A round that handed over has not proved
 * that its work landed, so the record it would grade may be missing its own
 * commit. Nothing is lost by waiting: the glance counts what the log has
 * gained since the last watch, not how many rounds have run.
 *
 * Returns the failure that stops the round, or null when the watch ran or was
 * not due.
 */
async function runWatch(
  input: Pick<RoundInput, "repoRoot" | "verdict" | "cacheRoot">,
  dependencies: Pick<RoundDependencies, "runPhase">,
): Promise<RoundFailure | null> {
  // The watch is Claude's whoever audited, and the override binds only the auditor.
  const phases = roundPhases("codex", noOverride)
  const cwd = input.repoRoot
  const glance = await dependencies.runPhase.glance({
    phase: "glance",
    ...phases.glance,
    cwd,
    ownerRoot: cwd,
    arguments: [input.cacheRoot],
    sessionId: null,
  })
  if (glance.status === "failed")
    return { ...glance, phase: "glance", ...phases.glance, cwd }
  if (!glance.due) return null

  const verdict = await dependencies.runPhase.verdict({
    phase: "verdict",
    ...phases.verdict,
    cwd,
    ownerRoot: cwd,
    arguments: [input.verdict, input.cacheRoot],
    sessionId: null,
  })
  if (verdict.status === "failed")
    return { ...verdict, phase: "verdict", ...phases.verdict, cwd }

  // The verdict is a document the user decides from, so a session that did not
  // write it reads it once before the user does. It re-grounds in the record
  // and the code, never in the round, so it is given no other source.
  const revise = await dependencies.runPhase.revise({
    phase: "revise",
    ...phases.revise,
    cwd,
    ownerRoot: cwd,
    arguments: [workflowPath(cwd, "verdict"), verdict.file],
    sessionId: null,
  })
  if (revise.status === "failed")
    return { ...revise, phase: "revise", ...phases.revise, cwd }
  return null
}

export async function runRound(
  input: RoundInput,
  dependencies: RoundDependencies,
): Promise<RoundResult> {
  const phases = roundPhases(
    input.auditor ?? "codex",
    input.override ?? noOverride,
  )
  const cwd = input.repoRoot
  const audit = await dependencies.runPhase.audit({
    phase: "audit",
    ...phases.audit,
    cwd,
    ownerRoot: cwd,
    arguments:
      "commits" in input
        ? [input.nameStart, ...input.commits]
        : input.scope === undefined
          ? [input.nameStart, input.plan]
          : [input.nameStart, input.plan, input.scope],
    sessionId: null,
  })
  if (audit.status === "failed") {
    return { ...audit, phase: "audit", ...phases.audit, cwd }
  }

  const report = audit.file
  const ownerRoot = dirname(report)
  const vet = await dependencies.runPhase.vet({
    phase: "vet",
    ...phases.vet,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: null,
  })
  if (vet.status === "failed") {
    return { ...vet, phase: "vet", ...phases.vet, cwd }
  }

  const rebut = await dependencies.runPhase.rebut({
    phase: "rebut",
    ...phases.rebut,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: rebuttalSessionId(audit.sessionId, audit.context),
  })
  if (rebut.status === "failed") {
    return { ...rebut, phase: "rebut", ...phases.rebut, cwd }
  }

  const fix = await dependencies.runPhase.fix({
    phase: "fix",
    ...phases.fix,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: null,
  })
  if (fix.status === "failed") {
    return { ...fix, phase: "fix", ...phases.fix, cwd }
  }

  // The brief precedes a ruling, because the ruling is read from it.
  const brief = await runBrief(
    { repoRoot: cwd, transcript: input.transcript },
    dependencies,
  )
  if (brief.status === "failed") return brief
  if (fix.status === "finished") {
    if ("plan" in input) {
      const watched = await runWatch(input, dependencies)
      if (watched !== null) return watched
    }
    return { status: "finished", report, tier: fix.tier }
  }

  // The ruling explains the open item and argues a choice, in a draft and then
  // a rewrite by a session that did not write the draft.
  const rule = await dependencies.runPhase.rule({
    phase: "rule",
    ...phases.rule,
    cwd,
    ownerRoot: cwd,
    arguments: [input.transcript, report],
    sessionId: null,
  })
  if (rule.status === "failed")
    return { ...rule, phase: "rule", ...phases.rule, cwd }

  const revise = await dependencies.runPhase.revise({
    phase: "revise",
    ...phases.revise,
    cwd,
    ownerRoot: cwd,
    arguments: [workflowPath(cwd, "rule"), rule.file, input.transcript, report],
    sessionId: null,
  })
  if (revise.status === "failed")
    return { ...revise, phase: "revise", ...phases.revise, cwd }

  const session: InteractiveSession = {
    ...phases.fix,
    sessionId: fix.sessionId,
    cwd,
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
