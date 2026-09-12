import { dirname } from "node:path"
import {
  type Assistant,
  type InteractiveSession,
  type Phase,
  type PhaseFailure,
  phaseAssistants,
  type RoundDependencies,
  type SessionContext,
} from "./phase.js"

/** What names a round before it starts: the plan, the scope and who audits. */
export type RoundSetup = {
  readonly repoRoot: string
  readonly plan: string
  readonly scope?: string
  readonly auditor?: Assistant
}

export type RoundInput = RoundSetup & {
  /** The round's Markdown transcript, which the brief retells once the fix has returned. */
  readonly transcript: string
}

export type BriefInput = {
  readonly repoRoot: string
  readonly transcript: string
}

type RoundFailure = PhaseFailure & {
  readonly phase: Phase | "handover"
  readonly assistant: Assistant
  readonly cwd: string
}

export type RoundResult =
  | { readonly status: "finished"; readonly report: string }
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

/**
 * The brief reads only the transcript, so it runs the same way after a round
 * and on its own over an earlier transcript. Its launcher always belongs to
 * the Repo Edu root, because every transcript is written there.
 */
export async function runBrief(
  input: BriefInput,
  dependencies: Pick<RoundDependencies, "runPhase">,
): Promise<BriefResult> {
  const assistant = phaseAssistants("codex").brief
  const brief = await dependencies.runPhase.brief({
    phase: "brief",
    assistant,
    cwd: input.repoRoot,
    ownerRoot: input.repoRoot,
    arguments: [input.transcript],
    sessionId: null,
  })
  if (brief.status === "failed")
    return { ...brief, phase: "brief", assistant, cwd: input.repoRoot }
  return { status: "finished", brief: brief.file }
}

export async function runRound(
  input: RoundInput,
  dependencies: RoundDependencies,
): Promise<RoundResult> {
  const assistants = phaseAssistants(input.auditor ?? "codex")
  const cwd = input.repoRoot
  const audit = await dependencies.runPhase.audit({
    phase: "audit",
    assistant: assistants.audit,
    cwd,
    ownerRoot: cwd,
    arguments:
      input.scope === undefined ? [input.plan] : [input.plan, input.scope],
    sessionId: null,
  })
  if (audit.status === "failed") {
    return { ...audit, phase: "audit", assistant: assistants.audit, cwd }
  }

  const report = audit.file
  const ownerRoot = dirname(report)
  const vet = await dependencies.runPhase.vet({
    phase: "vet",
    assistant: assistants.vet,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: null,
  })
  if (vet.status === "failed") {
    return { ...vet, phase: "vet", assistant: assistants.vet, cwd }
  }

  const rebut = await dependencies.runPhase.rebut({
    phase: "rebut",
    assistant: assistants.rebut,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: rebuttalSessionId(audit.sessionId, audit.context),
  })
  if (rebut.status === "failed") {
    return { ...rebut, phase: "rebut", assistant: assistants.rebut, cwd }
  }

  const fix = await dependencies.runPhase.fix({
    phase: "fix",
    assistant: assistants.fix,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: null,
  })
  if (fix.status === "failed") {
    return { ...fix, phase: "fix", assistant: assistants.fix, cwd }
  }

  // The brief precedes a ruling, because the ruling is read from it.
  const brief = await runBrief(
    { repoRoot: cwd, transcript: input.transcript },
    dependencies,
  )
  if (brief.status === "failed") return brief
  if (fix.status === "finished") {
    return { status: "finished", report }
  }

  const session: InteractiveSession = {
    assistant: assistants.fix,
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
