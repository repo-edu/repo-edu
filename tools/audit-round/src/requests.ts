import { join as joinPath } from "node:path"
import { join as shellJoin } from "shellwords"
import { peerRoot } from "./context.js"
import type { InteractiveSession, PhaseInput, PinnedModel } from "./phase.js"
import { phaseOwnerRoot } from "./phase.js"

export const claudeSettingsRequest = {
  type: "control_request",
  request_id: "audit-round-settings",
  request: { subtype: "get_settings" },
} as const

/** How Claude names a phase's model and effort. An unnamed field is left out. */
function claudePin(model: PinnedModel): string[] {
  return [
    ...(model.model === null ? [] : ["--model", model.model.value]),
    ...(model.effort === null ? [] : ["--effort", model.effort.value]),
  ]
}

/**
 * How Codex names them. A pin precedes any subcommand, where `codex exec` and
 * `codex resume` take their own options, so a resumed session keeps it.
 */
function codexPin(model: PinnedModel): string[] {
  return [
    ...(model.model === null ? [] : ["-m", model.model.value]),
    ...(model.effort === null
      ? []
      : ["-c", `model_reasoning_effort=${model.effort.value}`]),
  ]
}

export function claudeArguments(
  additionalDirectory: string | null,
  sessionId: string | null,
  model: PinnedModel,
): string[] {
  return [
    "-p",
    ...(sessionId === null ? [] : ["--resume", sessionId]),
    ...claudePin(model),
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "auto",
    ...(additionalDirectory === null ? [] : ["--add-dir", additionalDirectory]),
  ]
}

export function codexArguments(
  prompt: string,
  sessionId: string | null,
  model: PinnedModel,
): string[] {
  const pin = codexPin(model)
  return sessionId === null
    ? ["exec", "--approve-for-me", ...pin, "--json", prompt]
    : [
        "exec",
        "--approve-for-me",
        ...pin,
        "resume",
        "--json",
        sessionId,
        prompt,
      ]
}

export function interactiveArguments(session: InteractiveSession): string[] {
  const { model } = session
  return session.assistant === "codex"
    ? [...codexPin(model), "resume", "--approve-for-me", session.sessionId]
    : [
        "--resume",
        session.sessionId,
        ...claudePin(model),
        "--permission-mode",
        "auto",
        "--add-dir",
        peerRoot(session),
      ]
}

export function recoveryCommand(session: InteractiveSession): string {
  return `${shellJoin(["cd", session.cwd])} && ${shellJoin([session.assistant, ...interactiveArguments(session)])}`
}

export function phasePrompt(input: PhaseInput): string {
  const { phase, assistant, repoEduRoot, cwd } = input
  const ownerRoot = phaseOwnerRoot(input)
  const launcher =
    assistant === "claude"
      ? joinPath(ownerRoot, ".claude", "commands", `${phase}.md`)
      : joinPath(ownerRoot, ".agents", "skills", phase, "SKILL.md")
  return `Run the ${phase} phase of an unattended ${input.roundKind === "planning" ? "planning" : "implementation-audit"} round in this ${input.sessionId === null ? "fresh" : "resumed"} session.
Working directory: ${cwd}
Repo Edu checkout: ${repoEduRoot}
Plan checkout: ${input.planRoot}
Read and follow this launcher: ${launcher}
Phase arguments (JSON array): ${JSON.stringify(input.arguments)}
Resolve the launcher's workflow paths from its owning repository: ${ownerRoot}
You are explicitly authorised to follow that repository's route and local substitutions even if this session started in the other repository. This invokes the selected phase with its ordinary authority and gates.
For every ending, follow the shared Runner result rule in ${repoEduRoot}/.agents/skills/audit/references/workflow.md#runner-result. Put its PHASE RESULT JSON line last in the final response, outside the report.`
}

export function phaseRequest(input: PhaseInput, prompt: string) {
  const { assistant, sessionId, model } = input
  return assistant === "codex"
    ? {
        args: codexArguments(prompt, sessionId, model),
        input: "",
      }
    : {
        args: claudeArguments(peerRoot(input), sessionId, model),
        input: `${JSON.stringify(claudeSettingsRequest)}\n${JSON.stringify({ type: "user", message: { role: "user", content: prompt } })}\n`,
      }
}
