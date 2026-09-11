import { dirname } from "node:path"
import type {
  Assistant,
  InteractiveSession,
  Phase,
  PhaseFailure,
  RoundDependencies,
} from "./phase.js"

export type RoundInput = {
  readonly repoRoot: string
  readonly plan: string
  readonly scope?: string
  readonly auditor?: Assistant
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

export async function runRound(
  input: RoundInput,
  dependencies: RoundDependencies,
): Promise<RoundResult> {
  const auditor = input.auditor ?? "codex"
  const vetter = auditor === "claude" ? "codex" : "claude"
  const cwd = input.repoRoot
  const audit = await dependencies.runPhase.audit({
    phase: "audit",
    assistant: auditor,
    cwd,
    ownerRoot: cwd,
    arguments:
      input.scope === undefined ? [input.plan] : [input.plan, input.scope],
    sessionId: null,
  })
  if (audit.status === "failed") {
    return { ...audit, phase: "audit", assistant: auditor, cwd }
  }

  const report = audit.file
  const ownerRoot = dirname(report)
  const vet = await dependencies.runPhase.vet({
    phase: "vet",
    assistant: vetter,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: null,
  })
  if (vet.status === "failed") {
    return { ...vet, phase: "vet", assistant: vetter, cwd }
  }

  const rebut = await dependencies.runPhase.rebut({
    phase: "rebut",
    assistant: auditor,
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: audit.sessionId,
  })
  if (rebut.status === "failed") {
    return { ...rebut, phase: "rebut", assistant: auditor, cwd }
  }

  const fix = await dependencies.runPhase.fix({
    phase: "fix",
    assistant: "codex",
    cwd,
    ownerRoot,
    arguments: [report],
    sessionId: null,
  })
  if (fix.status === "failed") {
    return { ...fix, phase: "fix", assistant: "codex", cwd }
  }
  if (fix.status === "finished") {
    return { status: "finished", report }
  }

  const session: InteractiveSession = {
    assistant: "codex",
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
