import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, relative, resolve } from "node:path"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import type { Usage } from "./agent"
import {
  type PlanOpts,
  type ProjectOpts,
  parseArgs,
  type RepoOpts,
} from "./cli"
import { type CoderRunOpts, initRepo, runCoderLoop } from "./coder"
import {
  LOG_BASENAME,
  type ModelName,
  STALE_FILES,
  STUDENT_REPOS,
  TRACE_BASENAME,
} from "./constants"
import { emit, fail, formatSeconds, setEmitState, withTicker } from "./log"
import {
  formatSpec,
  nextAvailable,
  type PlanNameOpts,
  parseSpec,
  planPostfix,
  type RepoNameOpts,
  repoPostfix,
} from "./naming"
import {
  markdownToPlan,
  type Plan,
  type PlanMeta,
  planToMarkdown,
} from "./plan-md"
import {
  existingDirs,
  generatePlan,
  generateProject,
  type PlanGenOpts,
  type ProjectGenOpts,
  validatePlan,
} from "./planner"
import {
  markdownToProject,
  type Project,
  projectToMarkdown,
} from "./project-md"
import { type ReviewSummaryOpts, writeReview } from "./review"
import { sampleKindSequence } from "./sampler"
import { readState, writeState } from "./state"

function setupRun(verbosity: number): void {
  mkdirSync(STUDENT_REPOS, { recursive: true })
  for (const name of STALE_FILES) {
    rmSync(resolve(STUDENT_REPOS, name), { force: true })
  }
  const logPath = resolve(STUDENT_REPOS, LOG_BASENAME)
  const tracePath = resolve(STUDENT_REPOS, TRACE_BASENAME)
  writeFileSync(logPath, "")
  writeFileSync(tracePath, "")
  setEmitState(verbosity, logPath, tracePath)
}

function projectDir(project: Project): string {
  return resolve(STUDENT_REPOS, `c${project.complexity}-${project.name}`)
}

function resolveFrom(path: string): string {
  return isAbsolute(path) ? path : resolve(STUDENT_REPOS, path)
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory()
}

function latestVersion(dir: string, base: string, ext: string): string | null {
  let latest: string | null = null
  if (existsSync(resolve(dir, `${base}${ext}`))) {
    latest = resolve(dir, `${base}${ext}`)
  }
  let n = 2
  while (existsSync(resolve(dir, `${base}-v${n}${ext}`))) {
    latest = resolve(dir, `${base}-v${n}${ext}`)
    n++
  }
  return latest
}

function resolveSinglePlan(dir: string): string {
  const plans = readdirSync(dir).filter(
    (n) => n.startsWith("plan-") && n.endsWith(".md"),
  )
  if (plans.length === 0) fail(`no plan-*.md found in directory: ${dir}`)
  if (plans.length > 1) {
    fail(
      `multiple plan files in ${dir}; pass one explicitly:\n  ${plans.sort().join("\n  ")}`,
    )
  }
  return resolve(dir, plans[0])
}

function archiveProject(project: Project): string {
  const dir = projectDir(project)
  mkdirSync(dir, { recursive: true })
  const name = nextAvailable(dir, "project", ".md")
  const path = resolve(dir, name)
  writeFileSync(path, projectToMarkdown(project))
  process.stderr.write(`fixture: archived project to ${path}\n`)
  writeState({ project: relative(STUDENT_REPOS, path), plan: null })
  return name
}

function archivePlan(
  project: Project,
  plan: Plan,
  opts: PlanNameOpts,
  projectFile: string,
  reviewFrequency: number,
): string {
  const meta: PlanMeta = {
    project: project.name,
    projectFile,
    planner: formatSpec(opts.plannerModel, opts.plannerEffort),
    aiCoders: opts.aiCoders,
    rounds: opts.rounds,
    students: opts.students,
    reviewFrequency,
    coderInteraction: opts.coderInteraction,
  }
  const dir = projectDir(project)
  mkdirSync(dir, { recursive: true })
  const name = nextAvailable(dir, `plan-${planPostfix(opts)}`, ".md")
  const path = resolve(dir, name)
  writeFileSync(path, planToMarkdown({ meta, plan }))
  process.stderr.write(`fixture: archived plan to ${path}\n`)
  writeState({
    project: relative(STUDENT_REPOS, resolve(dir, projectFile)),
    plan: relative(STUDENT_REPOS, path),
  })
  return path
}

function emitPlan(
  project: Project,
  plan: Plan,
  opts: PlanNameOpts,
  projectFile: string,
  reviewFrequency: number,
): void {
  emit(
    1,
    planToMarkdown({
      meta: {
        project: project.name,
        projectFile,
        planner: formatSpec(opts.plannerModel, opts.plannerEffort),
        aiCoders: opts.aiCoders,
        rounds: opts.rounds,
        students: opts.students,
        reviewFrequency,
        coderInteraction: opts.coderInteraction,
      },
      plan,
    }),
  )
}

async function produceProject(
  opts: ProjectGenOpts,
  runStart: number,
): Promise<{ project: Project; usage: Usage }> {
  const existing = existingDirs()
  const { project, usage } = await withTicker(
    "fixture: generating project…",
    () => generateProject(opts, existing),
  )
  process.stderr.write(
    `fixture: project ready (${formatSeconds(usage.wall_ms)}, cumulative ${formatSeconds(Date.now() - runStart)})\n`,
  )
  return { project, usage }
}

async function producePlan(
  project: Project,
  opts: PlanGenOpts & { reviewFrequency: number },
  runStart: number,
): Promise<{ plan: Plan; usage: Usage }> {
  const kindSequence = sampleKindSequence(opts.rounds, opts.reviewFrequency)
  const reviewCount = kindSequence.length - opts.rounds
  process.stderr.write(
    `fixture: sampled kind sequence (${opts.rounds} builds + ${reviewCount} reviews)\n`,
  )
  const { plan, usage } = await withTicker("fixture: generating plan…", () =>
    generatePlan(project, opts, kindSequence),
  )
  process.stderr.write(
    `fixture: plan ready (${formatSeconds(usage.wall_ms)}, cumulative ${formatSeconds(Date.now() - runStart)})\n`,
  )
  return { plan, usage }
}

function loadProjectFrom(path: string): Project {
  if (!existsSync(path)) fail(`project file not found: ${path}`)
  return markdownToProject(readFileSync(path, "utf8"))
}

function loadPlanFrom(path: string): {
  meta: PlanMeta
  plan: Plan
  project: Project
} {
  if (!existsSync(path)) fail(`plan file not found: ${path}`)
  const pf = markdownToPlan(readFileSync(path, "utf8"))
  const projectPath = resolve(dirname(path), pf.meta.projectFile)
  const project = loadProjectFrom(projectPath)
  const kindSequence = pf.plan.commits.map((c) => c.kind)
  validatePlan(pf.plan, pf.meta.students, kindSequence)
  return { meta: pf.meta, plan: pf.plan, project }
}

async function runCoderStage(
  project: Project,
  plan: Plan,
  planMeta: {
    rounds: number
    students: number
    reviewFrequency: number
  },
  coderOpts: CoderRunOpts & {
    plannerModel: ModelName
    plannerEffort: EffortLevel | "none"
  },
  runStart: number,
  plannerUsage: Usage,
): Promise<void> {
  const nameOpts: RepoNameOpts = {
    coderModel: coderOpts.coderModel,
    coderEffort: coderOpts.coderEffort,
    aiCoders: coderOpts.aiCoders,
    coderExperience: coderOpts.coderExperience,
    reviewFrequency: planMeta.reviewFrequency,
    complexity: project.complexity,
    students: planMeta.students,
    rounds: planMeta.rounds,
  }
  const parentDir = projectDir(project)
  mkdirSync(parentDir, { recursive: true })
  const dirName = nextAvailable(parentDir, repoPostfix(nameOpts))
  const dir = resolve(parentDir, dirName)
  mkdirSync(dir, { recursive: true })
  initRepo(dir)

  const state = await runCoderLoop(project, plan, coderOpts, dir, runStart)

  const reviewOpts: ReviewSummaryOpts = {
    rounds: planMeta.rounds,
    complexity: project.complexity,
    students: planMeta.students,
    reviewFrequency: planMeta.reviewFrequency,
    plannerModel: coderOpts.plannerModel,
    plannerEffort: coderOpts.plannerEffort,
    coderModel: coderOpts.coderModel,
    coderEffort: coderOpts.coderEffort,
  }
  const displayDir = `c${project.complexity}-${project.name}/${dirName}`
  writeReview(
    project,
    state,
    reviewOpts,
    plannerUsage,
    Date.now() - runStart,
    displayDir,
  )
  for (const name of STALE_FILES) {
    const src = resolve(STUDENT_REPOS, name)
    if (existsSync(src)) copyFileSync(src, resolve(dir, name))
  }
}

async function handleProject(
  opts: ProjectOpts,
  runStart: number,
): Promise<void> {
  const { project, usage } = await produceProject(opts, runStart)
  archiveProject(project)
  const runMs = Date.now() - runStart
  process.stdout.write(
    `Project "${project.name}" archived. Wall time: ${formatSeconds(runMs)} | tokens in/out: ${usage.input_tokens} / ${usage.output_tokens}\n`,
  )
}

async function handlePlan(opts: PlanOpts, runStart: number): Promise<void> {
  const rawFrom =
    opts.fromPath ||
    readState().project ||
    fail(
      "plan requires --from=PATH or a project in .fixture-state.json (run `fixture project` first)",
    )
  const resolved = resolveFrom(rawFrom)
  const fromPath = isDir(resolved)
    ? (latestVersion(resolved, "project", ".md") ??
      fail(`no project.md found in directory: ${resolved}`))
    : resolved
  const project = loadProjectFrom(fromPath)
  const projectFile = basename(fromPath)
  process.stderr.write(
    `fixture: loaded project "${project.name}" from ${fromPath}\n`,
  )
  const { plan, usage } = await producePlan(project, opts, runStart)
  const planNameOpts: PlanNameOpts = {
    plannerModel: opts.plannerModel,
    plannerEffort: opts.plannerEffort,
    aiCoders: opts.aiCoders,
    complexity: project.complexity,
    students: opts.students,
    rounds: opts.rounds,
    coderInteraction: opts.coderInteraction,
  }
  emitPlan(project, plan, planNameOpts, projectFile, opts.reviewFrequency)
  const archivePath = archivePlan(
    project,
    plan,
    planNameOpts,
    projectFile,
    opts.reviewFrequency,
  )
  const runMs = Date.now() - runStart
  process.stdout.write(
    `Plan archived: ${archivePath}\nWall time: ${formatSeconds(runMs)} | tokens in/out: ${usage.input_tokens} / ${usage.output_tokens}\n`,
  )
}

async function handleRepo(opts: RepoOpts, runStart: number): Promise<void> {
  const rawFrom =
    opts.fromPath ||
    readState().plan ||
    fail(
      "repo requires --from=PATH or a plan in .fixture-state.json (run `fixture plan` first)",
    )
  const resolved = resolveFrom(rawFrom)
  const fromPath = isDir(resolved) ? resolveSinglePlan(resolved) : resolved
  const { meta, plan, project } = loadPlanFrom(fromPath)
  process.stderr.write(
    `fixture: loaded plan for project "${project.name}" from ${fromPath}\n`,
  )
  const planner = parseSpec(meta.planner)
  const planNameOpts: PlanNameOpts = {
    plannerModel: planner.model,
    plannerEffort: planner.effort,
    aiCoders: meta.aiCoders,
    complexity: project.complexity,
    students: meta.students,
    rounds: meta.rounds,
    coderInteraction: meta.coderInteraction,
  }
  emitPlan(project, plan, planNameOpts, meta.projectFile, meta.reviewFrequency)
  const zero: Usage = { input_tokens: 0, output_tokens: 0, wall_ms: 0 }
  await runCoderStage(
    project,
    plan,
    {
      rounds: meta.rounds,
      students: meta.students,
      reviewFrequency: meta.reviewFrequency,
    },
    {
      coderModel: opts.coderModel,
      coderEffort: opts.coderEffort,
      aiCoders: meta.aiCoders,
      coderExperience: opts.coderExperience,
      comments: opts.comments,
      students: meta.students,
      plannerModel: planner.model,
      plannerEffort: planner.effort,
    },
    runStart,
    zero,
  )
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  setupRun(opts.verbosity)
  const runStart = Date.now()
  switch (opts.subcommand) {
    case "project":
      await handleProject(opts, runStart)
      break
    case "plan":
      await handlePlan(opts, runStart)
      break
    case "repo":
      await handleRepo(opts, runStart)
      break
  }
}

main().catch((err) => {
  process.stderr.write(
    `fixture: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
