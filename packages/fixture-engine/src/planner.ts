import { existsSync, readdirSync } from "node:fs"
import type { FixtureModelSpec } from "@repo-edu/integrations-llm-catalog"
import type { LlmUsage } from "@repo-edu/integrations-llm-contract"
import {
  FIXTURES_DIR,
  REVIEW_FALLBACK,
  REVIEW_NOTE,
  type Style,
} from "./constants"
import { generateText } from "./llm-client"
import { emit, fail } from "./log"
import type { CommitKind, Plan, PlannedCommit, TeamMember } from "./plan-md"
import type { Project } from "./project-md"
import { loadPrompt, loadSection } from "./prompt-loader"

export interface ProjectGenOpts {
  plannerSpec: FixtureModelSpec
  complexity: number
}

export interface PlanGenOpts {
  plannerSpec: FixtureModelSpec
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
  const interactionGuidance =
    opts.students === 1
      ? loadSection("planner/interaction", "solo")
      : loadSection("planner/interaction", String(opts.coderInteraction))
  const styleGuidance = loadSection("planner/style", opts.style)
  return loadPrompt("planner/plan", {
    project_name: project.name,
    assignment: project.assignment,
    complexity: String(project.complexity),
    rounds: String(opts.rounds),
    planned_count: String(kindSequence.length),
    kind_sequence: sequenceLines,
    students: String(opts.students),
    max_author: String(opts.students - 1),
    today: today(),
    interaction_guidance: interactionGuidance,
    style: opts.style,
    style_guidance: styleGuidance,
  })
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

/**
 * Re-attribute fleshing-out build commits to non-prior-authors of the file
 * they centrally touch. Hard enforcement of the `coder-interaction` nudge:
 * for level >= 2, when a build commit edits a file that already has authors,
 * pick the candidate author with the lowest commit count so far who hasn't
 * touched it yet. Reviews are left alone (they don't add lines and the
 * planner already cross-attributes them).
 */
export function redistributeAuthors(
  plan: Plan,
  students: number,
  coderInteraction: number,
): void {
  if (students < 2 || coderInteraction < 2) return
  const fileAuthors = new Map<string, Set<number>>()
  const counts = new Array<number>(students).fill(0)
  for (const c of plan.commits) {
    if (c.kind !== "build" || !c.primary_module) {
      counts[c.author_index] += 1
      continue
    }
    const file = c.primary_module
    const prior = fileAuthors.get(file)
    if (prior?.has(c.author_index)) {
      let pick = -1
      for (let a = 0; a < students; a++) {
        if (prior.has(a)) continue
        if (pick < 0 || counts[a] < counts[pick]) pick = a
      }
      if (pick >= 0) c.author_index = pick
    }
    counts[c.author_index] += 1
    if (!fileAuthors.has(file)) fileAuthors.set(file, new Set())
    fileAuthors.get(file)?.add(c.author_index)
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
    if (
      c.kind === "build" &&
      (!c.primary_module || typeof c.primary_module !== "string")
    ) {
      fail(`commits[${i}].primary_module missing (required for build)`)
    }
  }
}

function emitPlannerTrace(
  stage: "project" | "plan",
  prompt: string,
  reply: string,
  usage: LlmUsage,
): void {
  const header = `\n## Planner · ${stage}\n\n### Prompt\n\n${prompt}`
  emit(2, header)
  emit(3, header)
  const tail = `\n### Reply\n\n${reply}\n\n### Usage\n\n- inputTokens: ${usage.inputTokens}\n- cachedInputTokens: ${usage.cachedInputTokens}\n- outputTokens: ${usage.outputTokens}\n- wallMs: ${usage.wallMs}\n- authMode: ${usage.authMode}`
  emit(2, tail)
  emit(3, tail)
}

export async function generateProject(
  opts: ProjectGenOpts,
  existing: string[],
): Promise<{ project: Project; usage: LlmUsage }> {
  const prompt = projectPrompt(opts, existing)
  const { reply, usage } = await generateText(opts.plannerSpec, prompt)
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
): Promise<{ plan: Plan; usage: LlmUsage }> {
  const prompt = planPrompt(project, opts, kindSequence)
  const { reply, usage } = await generateText(opts.plannerSpec, prompt)
  emitPlannerTrace("plan", prompt, reply, usage)
  type RawPlannedCommit = Omit<PlannedCommit, "kind">
  const raw = parseJsonOrFail<{
    team: TeamMember[]
    commits: RawPlannedCommit[]
  }>(reply, "planner plan reply")
  let prevAuthor = -1
  const commits: PlannedCommit[] = (raw.commits ?? []).map((c, i) => {
    const kind = kindSequence[i]
    if (kind === "review") {
      const author_index =
        opts.students > 1 && prevAuthor >= 0
          ? (prevAuthor + 1) % opts.students
          : 0
      prevAuthor = author_index
      return {
        date: c.date,
        author_index,
        kind,
        note: REVIEW_NOTE,
        message: REVIEW_FALLBACK,
      }
    }
    prevAuthor = c.author_index
    return { ...c, kind }
  })
  const plan: Plan = { team: raw.team, commits }
  validatePlan(plan, opts.students, kindSequence.length)
  redistributeAuthors(plan, opts.students, opts.coderInteraction)
  return { plan, usage }
}
