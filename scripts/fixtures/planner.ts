import { existsSync, readdirSync } from "node:fs"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import { effortOption, runAgent, type Usage } from "./agent"
import { type ModelName, REPO_ROOT, STUDENT_REPOS } from "./constants"
import { fail } from "./log"
import type { CommitKind, Plan } from "./plan-md"
import type { Project } from "./project-md"
import { loadPrompt } from "./prompt-loader"

export interface ProjectGenOpts {
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  complexity: number
}

export interface PlanGenOpts {
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  rounds: number
  students: number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function existingDirs(): string[] {
  if (!existsSync(STUDENT_REPOS)) return []
  return readdirSync(STUDENT_REPOS).filter(
    (n) => !n.startsWith(".") && !n.startsWith("_"),
  )
}

function stripJsonFences(text: string): string {
  const t = text.trim()
  if (!t.startsWith("```")) return t
  return t
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
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

export function validatePlan(
  plan: Plan,
  students: number,
  kindSequence: CommitKind[],
): void {
  if (plan.team?.length !== students) {
    fail(`plan.team must have ${students} entries, got ${plan.team?.length}`)
  }
  if (plan.commits?.length !== kindSequence.length) {
    fail(
      `plan.commits must have ${kindSequence.length} entries, got ${plan.commits?.length}`,
    )
  }
  for (let i = 0; i < plan.commits.length; i++) {
    const c = plan.commits[i]
    if (c.author_index < 0 || c.author_index >= students) {
      fail(`commits[${i}].author_index out of range`)
    }
    if (c.kind !== kindSequence[i]) {
      fail(
        `commits[${i}].kind must be "${kindSequence[i]}" (from sampled sequence), got "${c.kind}"`,
      )
    }
  }
}

export async function generateProject(
  opts: ProjectGenOpts,
  existing: string[],
): Promise<{ project: Project; usage: Usage }> {
  const prompt = projectPrompt(opts, existing)
  const { reply, usage } = await runAgent(prompt, {
    model: opts.plannerModel,
    ...effortOption(opts.plannerEffort),
    cwd: REPO_ROOT,
    maxTurns: 1,
    allowedTools: [],
    permissionMode: "bypassPermissions",
  })
  const parsed = JSON.parse(stripJsonFences(reply)) as Omit<
    Project,
    "complexity"
  >
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
  const { reply, usage } = await runAgent(prompt, {
    model: opts.plannerModel,
    ...effortOption(opts.plannerEffort),
    cwd: REPO_ROOT,
    maxTurns: 1,
    allowedTools: [],
    permissionMode: "bypassPermissions",
  })
  const plan = JSON.parse(stripJsonFences(reply)) as Plan
  validatePlan(plan, opts.students, kindSequence)
  return { plan, usage }
}
