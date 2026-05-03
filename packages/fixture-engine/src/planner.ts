import { existsSync, readdirSync } from "node:fs"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import { FIXTURES_DIR, type ModelName, type Style } from "./constants"
import { generateText, type Usage } from "./llm-client"
import { emit, fail } from "./log"
import { makeClaudeSpec } from "./model-codes"
import type { CommitKind, Plan, PlannedCommit, TeamMember } from "./plan-md"
import type { Project } from "./project-md"
import { loadPrompt, loadSection } from "./prompt-loader"

export interface ProjectGenOpts {
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  complexity: number
}

export interface PlanGenOpts {
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  aiCoders: boolean
  rounds: number
  students: number
  reviews: number
  coderInteraction: number
  style: Style
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function existingDirs(): string[] {
  if (!existsSync(FIXTURES_DIR())) return []
  const names = new Set<string>()
  for (const entry of readdirSync(FIXTURES_DIR(), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue
    const stripped = entry.name.replace(/^c\d+-/, "")
    names.add(stripped)
  }
  return [...names]
}

function stripJsonFences(text: string): string {
  const t = text.trim()
  if (!t.startsWith("```")) return t
  return t
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
}

function parseJsonOrFail<T>(reply: string, label: string): T {
  const stripped = stripJsonFences(reply)
  try {
    return JSON.parse(stripped) as T
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const snippet =
      stripped.length > 400 ? `${stripped.slice(0, 400)}…` : stripped
    fail(`${label}: invalid JSON (${detail})\n--- agent reply ---\n${snippet}`)
  }
}

function projectPrompt(opts: ProjectGenOpts, existing: string[]): string {
  return loadPrompt("planner/project", {
    complexity: String(opts.complexity),
    today: today(),
    existing_dirs: JSON.stringify(existing),
  })
}

function planPrompt(
  project: Project,
  opts: PlanGenOpts,
  kindSequence: CommitKind[],
): string {
  const sequenceLines = kindSequence
    .map((kind, i) => `${i + 1}. ${kind}`)
    .join("\n")
  const template = opts.aiCoders ? "planner/plan-ai" : "planner/plan"
  const interactionGuidance =
    opts.students === 1
      ? loadSection("planner/interaction", "solo")
      : loadSection("planner/interaction", String(opts.coderInteraction))
  const styleGuidance = loadSection("planner/style", opts.style)
  const ctx: Record<string, string> = {
    project_name: project.name,
    assignment: project.assignment,
    complexity: String(project.complexity),
    rounds: String(opts.rounds),
    planned_count: String(kindSequence.length),
    kind_sequence: sequenceLines,
    students: String(opts.students),
    today: today(),
    interaction_guidance: interactionGuidance,
    style: opts.style,
    style_guidance: styleGuidance,
  }
  if (!opts.aiCoders) ctx.max_author = String(opts.students - 1)
  return loadPrompt(template, ctx)
}

function validateProject(project: Project, complexity: number): void {
  if (!project.name || typeof project.name !== "string") {
    fail("project.name missing")
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(project.name)) {
    fail(`project.name must be kebab-case, got "${project.name}"`)
  }
  if (!project.assignment || typeof project.assignment !== "string") {
    fail("project.assignment missing")
  }
  if (project.complexity !== complexity) {
    fail(`project.complexity must be ${complexity}, got ${project.complexity}`)
  }
}

export function validatePlan(
  plan: Plan,
  students: number,
  plannedCount: number,
): void {
  if (plan.team?.length !== students) {
    fail(`plan.team must have ${students} entries, got ${plan.team?.length}`)
  }
  if (plan.commits?.length !== plannedCount) {
    fail(
      `plan.commits must have ${plannedCount} entries, got ${plan.commits?.length}`,
    )
  }
  for (let i = 0; i < plan.commits.length; i++) {
    const c = plan.commits[i]
    if (c.author_index < 0 || c.author_index >= students) {
      fail(`commits[${i}].author_index out of range`)
    }
  }
}

function emitPlannerTrace(
  stage: "project" | "plan",
  prompt: string,
  reply: string,
  usage: Usage,
): void {
  const header = `\n## Planner · ${stage}\n\n### Prompt\n\n${prompt}`
  emit(2, header)
  emit(3, header)
  const tail = `\n### Reply\n\n${reply}\n\n### Usage\n\n- input_tokens: ${usage.input_tokens}\n- output_tokens: ${usage.output_tokens}\n- wall_ms: ${usage.wall_ms}`
  emit(2, tail)
  emit(3, tail)
}

export async function generateProject(
  opts: ProjectGenOpts,
  existing: string[],
): Promise<{ project: Project; usage: Usage }> {
  const prompt = projectPrompt(opts, existing)
  const spec = makeClaudeSpec(opts.plannerModel, opts.plannerEffort)
  const { reply, usage } = await generateText(spec, prompt)
  emitPlannerTrace("project", prompt, reply, usage)
  const parsed = parseJsonOrFail<Omit<Project, "complexity">>(
    reply,
    "planner project reply",
  )
  const project: Project = { ...parsed, complexity: opts.complexity }
  validateProject(project, opts.complexity)
  return { project, usage }
}

export async function generatePlan(
  project: Project,
  opts: PlanGenOpts,
  kindSequence: CommitKind[],
): Promise<{ plan: Plan; usage: Usage }> {
  const prompt = planPrompt(project, opts, kindSequence)
  const spec = makeClaudeSpec(opts.plannerModel, opts.plannerEffort)
  const { reply, usage } = await generateText(spec, prompt)
  emitPlannerTrace("plan", prompt, reply, usage)
  type RawPlannedCommit = Omit<PlannedCommit, "kind">
  const raw = parseJsonOrFail<{
    team: TeamMember[]
    commits: RawPlannedCommit[]
  }>(reply, "planner plan reply")
  const commits: PlannedCommit[] = (raw.commits ?? []).map((c, i) => ({
    ...c,
    kind: kindSequence[i],
  }))
  const plan: Plan = { team: raw.team, commits }
  validatePlan(plan, opts.students, kindSequence.length)
  return { plan, usage }
}
