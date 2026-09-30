import { readFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { join as shellJoin } from "shellwords"
import { VFile } from "vfile"
import { matter } from "vfile-matter"
import { z } from "zod"
import { peerRoot } from "./context.js"
import type { InteractiveSession, PhaseInput, PinnedModel } from "./phase.js"
import { phaseLauncher, phaseWorkflow } from "./phase.js"

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
  sessionId: string | null,
  model: PinnedModel,
): string[] {
  const pin = codexPin(model)
  return sessionId === null
    ? ["exec", "--approve-for-me", ...pin, "--json"]
    : ["exec", "--approve-for-me", ...pin, "resume", "--json", sessionId, "-"]
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

const workflowHeader = z.strictObject({
  reads: z.array(z.string().trim().min(1)),
})

/** Headers resolve from their own file, including a routed workflow's reads. */
function phaseInstructions(launcher: string, workflow: string): string {
  const files = new Map<string, string>()
  function supply(path: string): void {
    const source = resolve(path)
    if (files.has(source)) return
    const content = readFileSync(source, "utf8")
    files.set(source, content)
    if (basename(source) !== "workflow.md") return
    const file = new VFile({ path: source, value: content })
    matter(file)
    const header = workflowHeader.safeParse(file.data.matter)
    if (!header.success)
      throw new Error(
        `Invalid workflow header in ${source}: ${header.error.message}`,
      )
    for (const reference of header.data.reads)
      supply(resolve(dirname(source), reference))
  }
  supply(launcher)
  supply(workflow)
  return [...files]
    .map(([path, content]) => `Source file: ${path}\n\n${content}`)
    .join("\n\n")
}

export function phasePrompt(input: PhaseInput): string {
  const { phase, repoEduRoot, cwd } = input
  const launcher = phaseLauncher(input)
  const instructions =
    input.sessionId === null
      ? phaseInstructions(launcher, phaseWorkflow(input))
      : null
  const prompt = `Run the ${phase} phase of an unattended ${input.roundKind === "planning" ? "planning" : "implementation-audit"} round in this ${input.sessionId === null ? "fresh" : "resumed"} session.
Working directory: ${cwd}
Repo Edu checkout: ${repoEduRoot}
Plan checkout: ${input.planRoot}
${instructions === null ? `Read and follow this launcher: ${launcher}` : `Follow the supplied launcher and workflow below. Their listed files are supplied whole under their source paths; do not fetch them again.\n\n${instructions}\n\nEnd of supplied phase instructions.`}
Phase arguments (JSON array): ${JSON.stringify(input.arguments)}
Workflow: ${phaseWorkflow(input)}
The supplied workflow and phase arguments are already resolved. Do not run name or paths again. Work in the printed working directory and follow its repository instructions even if this session started elsewhere. This invokes the selected phase with its ordinary authority and gates.
For every ending, follow the shared Runner result rule in ${repoEduRoot}/.agents/references/round-protocol.md#runner-result. Put its PHASE RESULT JSON line last in the final response, outside the report.${input.phase === "watch" ? `\n\nGit episode evidence:\n${input.evidence}` : ""}`
  if (input.phase !== "fix") return prompt
  const fixPrompt = `${prompt}\n\nRuling output path (JSON string): ${JSON.stringify(input.rulingFile)}\nIf a user decision remains open, follow ${repoEduRoot}/.agents/skills/fix/references/ruling.md in this fix session. Write the final ruling to that path and review it for clarity before returning needs-ruling. Reuse established evidence and read more only to verify uncertain claims. Every needs-ruling return must write the current open decisions, including after a reply. The runner displays your ruling directly; no separate ruling session follows. It writes and displays the brief only after the full fix has completed.`
  if (input.rulingReply === undefined) return fixPrompt
  return `${fixPrompt}\n\nThe runner displayed your ruling and collected the user's reply below. Continue this fix session. Answer questions before acting and apply changes only when the reply resolves the open decisions. If a decision remains open, update the ruling and return needs-ruling. Do not repeat the internal launch instructions.\n\nUser reply:\n${input.rulingReply}`
}

export function phaseRequest(input: PhaseInput, prompt: string) {
  const { assistant, sessionId, model } = input
  return assistant === "codex"
    ? {
        args: codexArguments(sessionId, model),
        input: prompt,
      }
    : {
        args: claudeArguments(peerRoot(input), sessionId, model),
        input: `${JSON.stringify(claudeSettingsRequest)}\n${JSON.stringify({ type: "user", message: { role: "user", content: prompt } })}\n`,
      }
}
