import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import type { Usage } from "./agent"
import { type BatchEntry, loadBatch, mergeEntry, saveBatch } from "./batch"
import {
  type BatchOpts,
  type PlanOpts,
  type ProjectOpts,
  parseArgs,
  parseModelCode,
  type RepoOpts,
} from "./cli"
import { type CoderRunOpts, initRepo, runCoderLoop } from "./coder"
import {
  LOG_BASENAME,
  type ModelName,
  PLAN_BASENAME,
  STUDENT_REPOS,
  TRACE_BASENAME,
} from "./constants"
import {
  readSettings,
  SETTINGS,
  type Settings,
  writeSettings,
} from "./defaults"
import {
  emit,
  fail,
  formatSeconds,
  progress,
  setEmitState,
  withTicker,
} from "./log"
import {
  formatSpec,
  modelCode,
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
  const logPath = resolve(STUDENT_REPOS, LOG_BASENAME)
  const tracePath = resolve(STUDENT_REPOS, TRACE_BASENAME)
  writeFileSync(logPath, "")
  writeFileSync(tracePath, "")
  setEmitState(verbosity, logPath, tracePath)
}

function relocateLogs(targetDir: string, verbosity: number): void {
  mkdirSync(targetDir, { recursive: true })
  const fromLog = resolve(STUDENT_REPOS, LOG_BASENAME)
  const fromTrace = resolve(STUDENT_REPOS, TRACE_BASENAME)
  const toLog = resolve(targetDir, LOG_BASENAME)
  const toTrace = resolve(targetDir, TRACE_BASENAME)
  if (existsSync(fromLog)) renameSync(fromLog, toLog)
  if (existsSync(fromTrace)) renameSync(fromTrace, toTrace)
  setEmitState(verbosity, toLog, toTrace)
}

function resetRunLogs(verbosity: number): void {
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
  const direct = resolve(dir, PLAN_BASENAME)
  if (existsSync(direct)) return direct
  const planDirs = readdirSync(dir, { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && existsSync(resolve(dir, d.name, PLAN_BASENAME)),
    )
    .map((d) => d.name)
  if (planDirs.length === 0) {
    fail(`no plan.md or plan subdirectory found in: ${dir}`)
  }
  if (planDirs.length > 1) {
    fail(
      `multiple plan subdirs in ${dir}; pass one explicitly:\n  ${planDirs.sort().join("\n  ")}`,
    )
  }
  return resolve(dir, planDirs[0], PLAN_BASENAME)
}

function archiveProject(project: Project): string {
  const dir = projectDir(project)
  mkdirSync(dir, { recursive: true })
  const name = nextAvailable(dir, "project", ".md")
  const path = resolve(dir, name)
  writeFileSync(path, projectToMarkdown(project))
  progress(`archived project to ${path}`)
  writeState({ project: relative(STUDENT_REPOS, path), plan: null })
  return name
}

function archivePlan(
  project: Project,
  plan: Plan,
  opts: PlanNameOpts,
  projectPath: string,
): { planPath: string; planDir: string } {
  const parentDir = projectDir(project)
  mkdirSync(parentDir, { recursive: true })
  const planDirName = nextAvailable(parentDir, planPostfix(opts))
  const planDir = resolve(parentDir, planDirName)
  mkdirSync(planDir, { recursive: true })
  const planPath = resolve(planDir, PLAN_BASENAME)
  const meta: PlanMeta = {
    project: project.name,
    projectFile: relative(planDir, projectPath),
    planner: formatSpec(opts.plannerModel, opts.plannerEffort),
    aiCoders: opts.aiCoders,
    rounds: opts.rounds,
    students: opts.students,
    reviews: opts.reviews,
    coderInteraction: opts.coderInteraction,
  }
  writeFileSync(planPath, planToMarkdown({ meta, plan }))
  progress(`archived plan to ${planPath}`)
  writeState({
    project: relative(STUDENT_REPOS, projectPath),
    plan: relative(STUDENT_REPOS, planPath),
  })
  return { planPath, planDir }
}

function emitPlan(
  project: Project,
  plan: Plan,
  opts: PlanNameOpts,
  projectFile: string,
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
        reviews: opts.reviews,
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
  progress(
    `project ready (${formatSeconds(usage.wall_ms)}, cumulative ${formatSeconds(Date.now() - runStart)})`,
  )
  return { project, usage }
}

async function producePlan(
  project: Project,
  opts: PlanGenOpts,
  runStart: number,
): Promise<{ plan: Plan; usage: Usage }> {
  const kindSequence = sampleKindSequence(opts.rounds, opts.reviews)
  progress(
    `sampled kind sequence (${opts.rounds} builds + ${opts.reviews} reviews)`,
  )
  const { plan, usage } = await withTicker("fixture: generating plan…", () =>
    generatePlan(project, opts, kindSequence),
  )
  progress(
    `plan ready (${formatSeconds(usage.wall_ms)}, cumulative ${formatSeconds(Date.now() - runStart)})`,
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
    reviews: number
  },
  coderOpts: CoderRunOpts & {
    plannerModel: ModelName
    plannerEffort: EffortLevel | "none"
  },
  planDir: string,
  runStart: number,
  plannerUsage: Usage,
): Promise<void> {
  const nameOpts: RepoNameOpts = {
    coderModel: coderOpts.coderModel,
    coderEffort: coderOpts.coderEffort,
    aiCoders: coderOpts.aiCoders,
    coderExperience: coderOpts.coderExperience,
    complexity: project.complexity,
    students: planMeta.students,
    rounds: planMeta.rounds,
  }
  const dirName = nextAvailable(planDir, repoPostfix(nameOpts))
  const dir = resolve(planDir, dirName)
  mkdirSync(dir, { recursive: true })
  initRepo(dir)

  const state = await runCoderLoop(
    project,
    plan,
    coderOpts,
    dir,
    planDir,
    runStart,
  )

  const reviewOpts: ReviewSummaryOpts = {
    rounds: planMeta.rounds,
    complexity: project.complexity,
    students: planMeta.students,
    reviews: planMeta.reviews,
    plannerModel: coderOpts.plannerModel,
    plannerEffort: coderOpts.plannerEffort,
    coderModel: coderOpts.coderModel,
    coderEffort: coderOpts.coderEffort,
  }
  const displayDir = `${relative(STUDENT_REPOS, planDir)}/${dirName}`
  writeReview(
    project,
    state,
    reviewOpts,
    plannerUsage,
    Date.now() - runStart,
    planDir,
    displayDir,
  )
}

function settingsForProject(prev: Settings, opts: ProjectOpts): Settings {
  return {
    ...prev,
    mp: modelCode(opts.plannerModel, opts.plannerEffort),
    complexity: opts.complexity,
  }
}

function settingsForPlan(prev: Settings, opts: PlanOpts): Settings {
  return {
    ...prev,
    mp: modelCode(opts.plannerModel, opts.plannerEffort),
    aiCoders: opts.aiCoders,
    students: opts.students,
    rounds: opts.rounds,
    coderInteraction: opts.coderInteraction,
    reviews: opts.reviews,
    style: opts.style,
  }
}

function settingsForRepo(prev: Settings, opts: RepoOpts): Settings {
  return {
    ...prev,
    mc: modelCode(opts.coderModel, opts.coderEffort),
    coderExperience: opts.coderExperience,
    comments: opts.comments,
  }
}

async function handleProject(
  opts: ProjectOpts,
  runStart: number,
): Promise<void> {
  const { project, usage } = await produceProject(opts, runStart)
  archiveProject(project)
  emit(1, projectToMarkdown(project))
  writeSettings(STUDENT_REPOS, settingsForProject(SETTINGS, opts))
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
  progress(`loaded project "${project.name}" from ${fromPath}`)
  const { plan, usage } = await producePlan(project, opts, runStart)
  const planNameOpts: PlanNameOpts = {
    plannerModel: opts.plannerModel,
    plannerEffort: opts.plannerEffort,
    aiCoders: opts.aiCoders,
    complexity: project.complexity,
    students: opts.students,
    rounds: opts.rounds,
    reviews: opts.reviews,
    coderInteraction: opts.coderInteraction,
    style: opts.style,
  }
  const { planPath, planDir } = archivePlan(
    project,
    plan,
    planNameOpts,
    fromPath,
  )
  emitPlan(project, plan, planNameOpts, relative(planDir, fromPath))
  relocateLogs(planDir, opts.verbosity)
  const updated = settingsForPlan(SETTINGS, opts)
  writeSettings(STUDENT_REPOS, updated)
  writeSettings(planDir, updated)
  const runMs = Date.now() - runStart
  process.stdout.write(
    `Plan archived: ${planPath}\nWall time: ${formatSeconds(runMs)} | tokens in/out: ${usage.input_tokens} / ${usage.output_tokens}\n`,
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
  const planDir = dirname(fromPath)
  progress(`loaded plan for project "${project.name}" from ${fromPath}`)
  relocateLogs(planDir, opts.verbosity)
  if (meta.aiCoders && opts.coderExperienceExplicit) {
    progress(
      `warning: --coder-experience=${opts.coderExperience} ignored — plan is in AI-coders mode`,
    )
  }
  const planner = parseSpec(meta.planner)
  const planNameOpts: PlanNameOpts = {
    plannerModel: planner.model,
    plannerEffort: planner.effort,
    aiCoders: meta.aiCoders,
    complexity: project.complexity,
    students: meta.students,
    rounds: meta.rounds,
    reviews: meta.reviews,
    coderInteraction: meta.coderInteraction,
    style: meta.style,
  }
  emitPlan(project, plan, planNameOpts, meta.projectFile)
  const zero: Usage = { input_tokens: 0, output_tokens: 0, wall_ms: 0 }
  await runCoderStage(
    project,
    plan,
    {
      rounds: meta.rounds,
      students: meta.students,
      reviews: meta.reviews,
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
    planDir,
    runStart,
    zero,
  )
  const prevPlanSettings = readSettings(planDir)
  const updated = settingsForRepo(prevPlanSettings, opts)
  writeSettings(planDir, updated)
  writeSettings(STUDENT_REPOS, settingsForRepo(SETTINGS, opts))
}

async function runEntry(
  project: Project,
  projectPath: string,
  entrySettings: Settings,
  verbosity: number,
  runStart: number,
): Promise<void> {
  const planner = parseModelCode(entrySettings.mp, "entry.mp")
  const coder = parseModelCode(entrySettings.mc, "entry.mc")
  const planGenOpts: PlanGenOpts = {
    plannerModel: planner.model,
    plannerEffort: planner.effort,
    aiCoders: entrySettings.aiCoders,
    rounds: entrySettings.rounds,
    students: entrySettings.students,
    reviews: entrySettings.reviews,
    coderInteraction: entrySettings.coderInteraction,
    style: entrySettings.style,
  }
  const { plan, usage: plannerUsage } = await producePlan(
    project,
    planGenOpts,
    runStart,
  )
  const planNameOpts: PlanNameOpts = {
    plannerModel: planner.model,
    plannerEffort: planner.effort,
    aiCoders: entrySettings.aiCoders,
    complexity: project.complexity,
    students: entrySettings.students,
    rounds: entrySettings.rounds,
    reviews: entrySettings.reviews,
    coderInteraction: entrySettings.coderInteraction,
    style: entrySettings.style,
  }
  const { planDir } = archivePlan(project, plan, planNameOpts, projectPath)
  emitPlan(project, plan, planNameOpts, relative(planDir, projectPath))
  relocateLogs(planDir, verbosity)
  writeSettings(planDir, entrySettings)
  writeSettings(STUDENT_REPOS, entrySettings)
  await runCoderStage(
    project,
    plan,
    {
      rounds: entrySettings.rounds,
      students: entrySettings.students,
      reviews: entrySettings.reviews,
    },
    {
      coderModel: coder.model,
      coderEffort: coder.effort,
      aiCoders: entrySettings.aiCoders,
      coderExperience: entrySettings.coderExperience,
      comments: entrySettings.comments,
      students: entrySettings.students,
      plannerModel: planner.model,
      plannerEffort: planner.effort,
    },
    planDir,
    runStart,
    plannerUsage,
  )
  writeSettings(planDir, entrySettings)
  writeSettings(STUDENT_REPOS, entrySettings)
}

async function handleBatch(opts: BatchOpts, runStart: number): Promise<void> {
  const listPath = resolveFrom(opts.listPath)
  const batch = loadBatch(listPath)
  let project: Project
  let projectPath: string
  if (typeof batch.project === "string") {
    const resolved = resolveFrom(batch.project)
    projectPath = isDir(resolved)
      ? (latestVersion(resolved, "project", ".md") ??
        fail(`no project.md found in directory: ${resolved}`))
      : resolved
    project = loadProjectFrom(projectPath)
    progress(`batch: loaded project "${project.name}" from ${projectPath}`)
  } else {
    const m = parseModelCode(batch.project.mp ?? SETTINGS.mp, "project.mp")
    const projectGenOpts: ProjectGenOpts = {
      complexity: batch.project.complexity,
      plannerModel: m.model,
      plannerEffort: m.effort,
    }
    const { project: p } = await produceProject(projectGenOpts, runStart)
    project = p
    const archivedName = archiveProject(project)
    projectPath = resolve(projectDir(project), archivedName)
    progress(`batch: generated project "${project.name}"`)
  }
  let remaining = batch.entries.length
  while (batch.entries.length > 0) {
    const entry: BatchEntry = batch.entries[0]
    const entrySettings = mergeEntry(SETTINGS, entry)
    progress(
      `batch: ${remaining} entries remaining — students=${entrySettings.students} rounds=${entrySettings.rounds} reviews=${entrySettings.reviews} style=${entrySettings.style}`,
    )
    resetRunLogs(opts.verbosity)
    await runEntry(
      project,
      projectPath,
      entrySettings,
      opts.verbosity,
      runStart,
    )
    batch.entries.shift()
    saveBatch(listPath, batch)
    remaining--
    progress(`batch: entry done; ${remaining} remaining`)
  }
  process.stdout.write(
    `Batch complete. ${formatSeconds(Date.now() - runStart)} total.\n`,
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
    case "batch":
      await handleBatch(opts, runStart)
      break
  }
}

main().catch((err) => {
  process.stderr.write(
    `fixture: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
