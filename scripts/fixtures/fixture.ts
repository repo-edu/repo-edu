import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import type { Usage } from "./agent"
import {
  type AllOpts,
  type PlanOpts,
  type ProjectOpts,
  parseArgs,
  type RepoOpts,
} from "./cli"
import { type CoderRunOpts, initRepo, runCoderLoop } from "./coder"
import {
  LOG_BASENAME,
  PLANS_SUBDIR,
  PROJECTS_SUBDIR,
  STALE_FILES,
  STUDENT_REPOS,
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

function setupRun(verbosity: number): void {
  mkdirSync(STUDENT_REPOS, { recursive: true })
  for (const name of STALE_FILES) {
    rmSync(resolve(STUDENT_REPOS, name), { force: true })
  }
  const logPath = resolve(STUDENT_REPOS, LOG_BASENAME)
  writeFileSync(logPath, "")
  setEmitState(verbosity, logPath)
}

function archiveProject(project: Project): void {
  const dir = resolve(STUDENT_REPOS, PROJECTS_SUBDIR)
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, `${project.name}.md`)
  if (existsSync(file)) fail(`project file already exists: ${file}`)
  writeFileSync(file, projectToMarkdown(project))
  process.stderr.write(`fixture: archived project to ${file}\n`)
}

function archivePlan(project: Project, plan: Plan, opts: PlanNameOpts): string {
  const meta: PlanMeta = {
    project: project.name,
    planner: formatSpec(opts.plannerModel, opts.plannerEffort),
    rounds: opts.rounds,
    students: opts.students,
    reviewFrequency: opts.reviewFrequency,
  }
  const dir = resolve(STUDENT_REPOS, PLANS_SUBDIR)
  mkdirSync(dir, { recursive: true })
  const name = nextAvailable(
    dir,
    `${planPostfix(opts).slice(1)}-${project.name}`,
    ".md",
  )
  const path = resolve(dir, name)
  writeFileSync(path, planToMarkdown({ meta, plan }))
  process.stderr.write(`fixture: archived plan to ${path}\n`)
  return path
}

function emitPlan(project: Project, plan: Plan, opts: PlanNameOpts): void {
  emit(
    1,
    planToMarkdown({
      meta: {
        project: project.name,
        planner: formatSpec(opts.plannerModel, opts.plannerEffort),
        rounds: opts.rounds,
        students: opts.students,
        reviewFrequency: opts.reviewFrequency,
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
  const projectPath = resolve(
    dirname(path),
    "..",
    PROJECTS_SUBDIR,
    `${pf.meta.project}.md`,
  )
  const project = loadProjectFrom(projectPath)
  const kindSequence = pf.plan.commits.map((c) => c.kind)
  validatePlan(pf.plan, pf.meta.students, kindSequence)
  return { meta: pf.meta, plan: pf.plan, project }
}

async function runCoderStage(
  project: Project,
  plan: Plan,
  planMeta: { rounds: number; students: number; reviewFrequency: number },
  coderOpts: CoderRunOpts & {
    plannerModel: RepoNameOpts["plannerModel"]
    plannerEffort: RepoNameOpts["plannerEffort"]
  },
  runStart: number,
  plannerUsage: Usage,
): Promise<void> {
  const nameOpts: RepoNameOpts = {
    plannerModel: coderOpts.plannerModel,
    plannerEffort: coderOpts.plannerEffort,
    coderModel: coderOpts.coderModel,
    coderEffort: coderOpts.coderEffort,
    coderLevel: coderOpts.coderLevel,
    complexity: project.complexity,
    students: planMeta.students,
    rounds: planMeta.rounds,
    reviewFrequency: planMeta.reviewFrequency,
  }
  const dirName = nextAvailable(
    STUDENT_REPOS,
    `${project.name}${repoPostfix(nameOpts)}`,
  )
  const dir = resolve(STUDENT_REPOS, dirName)
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
  writeReview(
    project,
    state,
    reviewOpts,
    plannerUsage,
    Date.now() - runStart,
    dirName,
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
  const project = loadProjectFrom(opts.fromPath)
  process.stderr.write(
    `fixture: loaded project "${project.name}" from ${opts.fromPath}\n`,
  )
  const { plan, usage } = await producePlan(project, opts, runStart)
  const planNameOpts: PlanNameOpts = {
    plannerModel: opts.plannerModel,
    plannerEffort: opts.plannerEffort,
    complexity: project.complexity,
    students: opts.students,
    rounds: opts.rounds,
    reviewFrequency: opts.reviewFrequency,
  }
  emitPlan(project, plan, planNameOpts)
  const archivePath = archivePlan(project, plan, planNameOpts)
  const runMs = Date.now() - runStart
  process.stdout.write(
    `Plan archived: ${archivePath}\nWall time: ${formatSeconds(runMs)} | tokens in/out: ${usage.input_tokens} / ${usage.output_tokens}\n`,
  )
}

async function handleRepo(opts: RepoOpts, runStart: number): Promise<void> {
  const { meta, plan, project } = loadPlanFrom(opts.fromPath)
  process.stderr.write(
    `fixture: loaded plan for project "${project.name}" from ${opts.fromPath}\n`,
  )
  const planner = parseSpec(meta.planner)
  const planNameOpts: PlanNameOpts = {
    plannerModel: planner.model,
    plannerEffort: planner.effort,
    complexity: project.complexity,
    students: meta.students,
    rounds: meta.rounds,
    reviewFrequency: meta.reviewFrequency,
  }
  emitPlan(project, plan, planNameOpts)
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
      coderLevel: opts.coderLevel,
      comments: opts.comments,
      students: meta.students,
      plannerModel: planner.model,
      plannerEffort: planner.effort,
    },
    runStart,
    zero,
  )
}

async function handleAll(opts: AllOpts, runStart: number): Promise<void> {
  const projectRes = await produceProject(opts, runStart)
  const project = projectRes.project
  archiveProject(project)

  const planRes = await producePlan(project, opts, runStart)
  const plan = planRes.plan

  const planNameOpts: PlanNameOpts = {
    plannerModel: opts.plannerModel,
    plannerEffort: opts.plannerEffort,
    complexity: project.complexity,
    students: opts.students,
    rounds: opts.rounds,
    reviewFrequency: opts.reviewFrequency,
  }
  emitPlan(project, plan, planNameOpts)
  archivePlan(project, plan, planNameOpts)

  const plannerUsage: Usage = {
    input_tokens: projectRes.usage.input_tokens + planRes.usage.input_tokens,
    output_tokens: projectRes.usage.output_tokens + planRes.usage.output_tokens,
    wall_ms: projectRes.usage.wall_ms + planRes.usage.wall_ms,
  }
  await runCoderStage(
    project,
    plan,
    {
      rounds: opts.rounds,
      students: opts.students,
      reviewFrequency: opts.reviewFrequency,
    },
    {
      coderModel: opts.coderModel,
      coderEffort: opts.coderEffort,
      coderLevel: opts.coderLevel,
      comments: opts.comments,
      students: opts.students,
      plannerModel: opts.plannerModel,
      plannerEffort: opts.plannerEffort,
    },
    runStart,
    plannerUsage,
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
    case "all":
      await handleAll(opts, runStart)
      break
  }
}

main().catch((err) => {
  process.stderr.write(
    `fixture: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
