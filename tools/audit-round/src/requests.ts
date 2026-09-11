import { join as joinPath, resolve } from "node:path"
import { join as shellJoin } from "shellwords"
import type { Assistant, InteractiveSession, PhaseInput } from "./phase.js"

export const claudeSettingsRequest = {
  type: "control_request",
  request_id: "audit-round-settings",
  request: { subtype: "get_settings" },
} as const

export function claudeArguments(
  cwd: string,
  sessionId: string | null,
): string[] {
  return [
    "-p",
    ...(sessionId === null ? [] : ["--resume", sessionId]),
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
    "--add-dir",
    resolve(cwd, "../plan"),
  ]
}

export function codexArguments(
  prompt: string,
  sessionId: string | null,
): string[] {
  return sessionId === null
    ? ["exec", "--approve-for-me", "--json", prompt]
    : ["exec", "--approve-for-me", "resume", "--json", sessionId, prompt]
}

export function interactiveArguments(session: InteractiveSession): string[] {
  return session.assistant === "codex"
    ? ["resume", "--approve-for-me", session.sessionId]
    : [
        "--resume",
        session.sessionId,
        "--add-dir",
        resolve(session.cwd, "../plan"),
      ]
}

export function recoveryCommand(session: InteractiveSession): string {
  return shellJoin([session.assistant, ...interactiveArguments(session)])
}

export function phasePrompt(input: PhaseInput): string {
  const { phase, ownerRoot, assistant, cwd } = input
  const launcher =
    assistant === "claude"
      ? joinPath(ownerRoot, ".claude", "commands", `${phase}.md`)
      : joinPath(ownerRoot, ".agents", "skills", phase, "SKILL.md")
  return `Run the ${phase} phase of an unattended implementation-audit round in this ${input.sessionId === null ? "fresh" : "resumed"} session.
Read and follow this launcher: ${launcher}
Phase arguments (JSON array): ${JSON.stringify(input.arguments)}
Resolve the launcher's workflow paths from its owning repository: ${ownerRoot}
You are explicitly authorised to follow that repository's route and local substitutions even if this session started in the other repository. This invokes the selected phase with its ordinary authority and gates.
For every ending, follow the shared Runner result rule in ${cwd}/.agents/skills/audit/references/workflow.md#runner-result. Put its PHASE RESULT JSON line last in the final response, outside the report.`
}

export function phaseRequest(
  assistant: Assistant,
  cwd: string,
  sessionId: string | null,
  prompt: string,
) {
  return assistant === "codex"
    ? { args: codexArguments(prompt, sessionId), input: "" }
    : {
        args: claudeArguments(cwd, sessionId),
        input: `${JSON.stringify(claudeSettingsRequest)}\n${JSON.stringify({ type: "user", message: { role: "user", content: prompt } })}\n`,
      }
}
