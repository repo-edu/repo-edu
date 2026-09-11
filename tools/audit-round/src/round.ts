import { dirname } from "node:path"
import {
  type Assistant,
  type InteractiveSession,
  type Phase,
  type PhaseFailure,
  phaseAssistants,
  type RoundDependencies,
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
    sessionId: audit.sessionId,
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
