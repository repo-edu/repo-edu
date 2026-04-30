import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, relative, resolve } from "node:path"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import type { Usage } from "./agent"
import {
  type EvaluateOpts,
  type InitOpts,
  type PlanOpts,
  type ProjectOpts,
  parseArgs,
  type RepoOpts,
  type SweepOpts,
} from "./cli"
import { type CoderRunOpts, initRepo, runCoderLoop } from "./coder"
import {
  FIXTURES_DIR,
  LOG_BASENAME,
  type ModelName,
  PLAN_BASENAME,
  TRACE_BASENAME,
  XTRACE_BASENAME,
} from "./constants"
import {
  FIXTURE_SETTINGS_FILE,
  FIXTURE_SWEEP_FILE,
  HARDCODED_SETTINGS,
  loadSweepFile,
  materializeSettings,
  readSettings,
  SETTINGS,
  type Settings,
  type SweepPhase,
  writeSettings,
  writeSweep,
} from "./defaults"
import { findRepoDirs, runEvaluate } from "./evaluate"
import {
  emit,
  FixtureError,
  fail,
  formatSeconds,
  progress,
  setEmitState,
  withTicker,
} from "./log"
import { parseModelCode } from "./model-codes"
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
import { FIXTURE_STATE_FILE, readState, writeState } from "./state"

function scaffoldFixturesDir(): void {
  mkdirSync(FIXTURES_DIR, { recursive: true })
  if (!existsSync(FIXTURE_SETTINGS_FILE)) {
    writeSettings(FIXTURES_DIR, HARDCODED_SETTINGS)
    progress(`scaffolded ${FIXTURE_SETTINGS_FILE}`)
  }
}

function initLogs(verbosity: number, dir: string): void {
  mkdirSync(dir, { recursive: true })
  const logPath = resolve(dir, LOG_BASENAME)
  const tracePath = resolve(dir, TRACE_BASENAME)
  const xtracePath = resolve(dir, XTRACE_BASENAME)
  writeFileSync(logPath, "")
  writeFileSync(tracePath, "")
  writeFileSync(xtracePath, "")
  setEmitState(verbosity, logPath, tracePath, xtracePath)
}

function projectDir(project: Project): string {
  return resolve(FIXTURES_DIR, `c${project.complexity}-${project.name}`)
}

function resolveFrom(path: string): string {
  return isAbsolute(path) ? path : resolve(FIXTURES_DIR, path)
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
  writeState({ project: relative(FIXTURES_DIR, path), plan: null })
  return name
}

function reservePlanDir(project: Project, opts: PlanNameOpts): string {
  const parentDir = projectDir(project)
  mkdirSync(parentDir, { recursive: true })
  const planDirName = nextAvailable(parentDir, planPostfix(opts))
  const planDir = resolve(parentDir, planDirName)
  mkdirSync(planDir, { recursive: true })
  return planDir
}

function reserveRepoDir(planDir: string, opts: RepoNameOpts): string {
  const dirName = nextAvailable(planDir, repoPostfix(opts))
  const dir = resolve(planDir, dirName)
  mkdirSync(dir, { recursive: true })
  return dir
}

function archivePlanIntoDir(
  project: Project,
  plan: Plan,
  opts: PlanNameOpts,
  projectPath: string,
  planDir: string,
): string {
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
    style: opts.style,
  }
  writeFileSync(planPath, planToMarkdown({ meta, plan }))
  progress(`archived plan to ${planPath}`)
  writeState({
    project: relative(FIXTURES_DIR, projectPath),
    plan: relative(FIXTURES_DIR, planPath),
  })
  return planPath
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
        style: opts.style,
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
  validatePlan(pf.plan, pf.meta.students, pf.plan.commits.length)
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
  repoDir: string,
  runStart: number,
  plannerUsage: Usage,
): Promise<void> {
  initRepo(repoDir)

  const state = await runCoderLoop(project, plan, coderOpts, repoDir, runStart)

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
  const displayDir = `${relative(FIXTURES_DIR, planDir)}/${basename(repoDir)}`
  writeReview(
    project,
    state,
    reviewOpts,
    plannerUsage,
    Date.now() - runStart,
    repoDir,
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
  initLogs(opts.verbosity, FIXTURES_DIR)
  const { project, usage } = await produceProject(opts, runStart)
  archiveProject(project)
  emit(1, projectToMarkdown(project))
  writeSettings(FIXTURES_DIR, settingsForProject(SETTINGS, opts))
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
  const planDir = reservePlanDir(project, planNameOpts)
  initLogs(opts.verbosity, planDir)
  progress(`loaded project "${project.name}" from ${fromPath}`)
  const { plan, usage } = await producePlan(project, opts, runStart)
  const planPath = archivePlanIntoDir(
    project,
    plan,
    planNameOpts,
    fromPath,
    planDir,
  )
  emitPlan(project, plan, planNameOpts, relative(planDir, fromPath))
  const updated = settingsForPlan(SETTINGS, opts)
  writeSettings(FIXTURES_DIR, updated)
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
  const repoNameOpts: RepoNameOpts = {
    coderModel: opts.coderModel,
    coderEffort: opts.coderEffort,
    aiCoders: meta.aiCoders,
    coderExperience: opts.coderExperience,
    comments: opts.comments,
  }
  const repoDir = reserveRepoDir(planDir, repoNameOpts)
  initLogs(opts.verbosity, repoDir)
  progress(`loaded plan for project "${project.name}" from ${fromPath}`)
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
    repoDir,
    runStart,
    zero,
  )
  const prevPlanSettings = readSettings(planDir)
  const updated = settingsForRepo(prevPlanSettings, opts)
  writeSettings(repoDir, updated)
  writeSettings(FIXTURES_DIR, settingsForRepo(SETTINGS, opts))
}

interface EntryPlan {
  plan: Plan
  planDir: string
  plannerUsage: Usage
}

async function archivePlanForEntry(
  project: Project,
  projectPath: string,
  entrySettings: Settings,
  verbosity: number,
  runStart: number,
): Promise<EntryPlan> {
  const planner = parseModelCode(entrySettings.mp, "entry.mp")
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
  const planDir = reservePlanDir(project, planNameOpts)
  initLogs(verbosity, planDir)
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
  archivePlanIntoDir(project, plan, planNameOpts, projectPath, planDir)
  emitPlan(project, plan, planNameOpts, relative(planDir, projectPath))
  writeSettings(planDir, entrySettings)
  writeSettings(FIXTURES_DIR, entrySettings)
  return { plan, planDir, plannerUsage }
}

async function runRepoForEntry(
  project: Project,
  plan: Plan,
  planDir: string,
  entrySettings: Settings,
  verbosity: number,
  runStart: number,
  plannerUsage: Usage,
): Promise<void> {
  const planner = parseModelCode(entrySettings.mp, "entry.mp")
  const coder = parseModelCode(entrySettings.mc, "entry.mc")
  const repoNameOpts: RepoNameOpts = {
    coderModel: coder.model,
    coderEffort: coder.effort,
    aiCoders: entrySettings.aiCoders,
    coderExperience: entrySettings.coderExperience,
    comments: entrySettings.comments,
  }
  const repoDir = reserveRepoDir(planDir, repoNameOpts)
  initLogs(verbosity, repoDir)
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
    repoDir,
    runStart,
    plannerUsage,
  )
  writeSettings(repoDir, entrySettings)
  writeSettings(FIXTURES_DIR, entrySettings)
}

async function runEntry(
  project: Project,
  projectPath: string,
  entrySettings: Settings,
  verbosity: number,
  runStart: number,
): Promise<void> {
  const { plan, planDir, plannerUsage } = await archivePlanForEntry(
    project,
    projectPath,
    entrySettings,
    verbosity,
    runStart,
  )
  await runRepoForEntry(
    project,
    plan,
    planDir,
    entrySettings,
    verbosity,
    runStart,
    plannerUsage,
  )
}

type SweepFromKind = "project" | "plan"

interface SweepFromProject {
  kind: "project"
  project: Project
  projectPath: string
}

interface SweepFromPlan {
  kind: "plan"
  project: Project
  planPath: string
  planDir: string
  plan: Plan
  meta: PlanMeta
}

type SweepFrom = SweepFromProject | SweepFromPlan

function loadSweepFromAsProject(absPath: string): SweepFromProject {
  const projectPath = isDir(absPath)
    ? (latestVersion(absPath, "project", ".md") ??
      fail(`no project.md found in directory: ${absPath}`))
    : absPath
  const project = loadProjectFrom(projectPath)
  return { kind: "project", project, projectPath }
}

function loadSweepFromAsPlan(absPath: string): SweepFromPlan {
  const planPath = isDir(absPath) ? resolveSinglePlan(absPath) : absPath
  const planDir = dirname(planPath)
  const { meta, plan, project } = loadPlanFrom(planPath)
  return { kind: "plan", project, planPath, planDir, plan, meta }
}

function classifyFromPath(absPath: string): SweepFromKind {
  if (isDir(absPath)) {
    if (existsSync(resolve(absPath, PLAN_BASENAME))) return "plan"
    if (latestVersion(absPath, "project", ".md") !== null) return "project"
    fail(
      `--from=${absPath}: directory has no plan.md or project*.md; cannot classify as project or plan`,
    )
  }
  const base = basename(absPath)
  if (base === PLAN_BASENAME) return "plan"
  if (/^project(?:-v\d+)?\.md$/.test(base)) return "project"
  fail(
    `--from=${absPath}: filename must be plan.md or project[-vN].md, or a directory containing one`,
  )
}

function resolveSweepFrom(opts: SweepOpts, phase: SweepPhase): SweepFrom {
  if (opts.fromPath) {
    const abs = resolveFrom(opts.fromPath)
    if (!existsSync(abs)) fail(`--from path not found: ${abs}`)
    const kind = classifyFromPath(abs)
    if (kind === "plan") {
      if (phase === "plan") {
        fail(
          "sweep on a plan-phase key cannot reuse an existing plan; pass --from=<project> or omit it",
        )
      }
      return loadSweepFromAsPlan(abs)
    }
    return loadSweepFromAsProject(abs)
  }
  const state = readState()
  if (phase === "repo" && state.plan) {
    return loadSweepFromAsPlan(resolveFrom(state.plan))
  }
  if (state.project) {
    return loadSweepFromAsProject(resolveFrom(state.project))
  }
  fail(
    phase === "plan"
      ? "sweep on a plan-phase key requires --from=<project> or a project in .fixture-state.json (run `fixture project` first)"
      : "sweep on a repo-phase key requires --from=<project|plan> or an entry in .fixture-state.json",
  )
}

async function runRepoForExistingPlan(
  from: SweepFromPlan,
  entrySettings: Settings,
  verbosity: number,
  runStart: number,
): Promise<void> {
  const coder = parseModelCode(entrySettings.mc, "entry.mc")
  const planner = parseSpec(from.meta.planner)
  const repoNameOpts: RepoNameOpts = {
    coderModel: coder.model,
    coderEffort: coder.effort,
    aiCoders: from.meta.aiCoders,
    coderExperience: entrySettings.coderExperience,
    comments: entrySettings.comments,
  }
  const repoDir = reserveRepoDir(from.planDir, repoNameOpts)
  initLogs(verbosity, repoDir)
  await runCoderStage(
    from.project,
    from.plan,
    {
      rounds: from.meta.rounds,
      students: from.meta.students,
      reviews: from.meta.reviews,
    },
    {
      coderModel: coder.model,
      coderEffort: coder.effort,
      aiCoders: from.meta.aiCoders,
      coderExperience: entrySettings.coderExperience,
      comments: entrySettings.comments,
      students: from.meta.students,
      plannerModel: planner.model,
      plannerEffort: planner.effort,
    },
    from.planDir,
    repoDir,
    runStart,
    { input_tokens: 0, output_tokens: 0, wall_ms: 0 },
  )
  const prevPlanSettings = readSettings(from.planDir)
  const updated: Settings = {
    ...prevPlanSettings,
    mc: entrySettings.mc,
    coderExperience: entrySettings.coderExperience,
    comments: entrySettings.comments,
  }
  writeSettings(repoDir, updated)
  writeSettings(FIXTURES_DIR, updated)
}

async function handleSweep(opts: SweepOpts, runStart: number): Promise<void> {
  const sweepPath = opts.sweepPath
    ? resolveFrom(opts.sweepPath)
    : FIXTURE_SWEEP_FILE
  const sweep = loadSweepFile(sweepPath)
  const from = resolveSweepFrom(opts, sweep.phase)
  const total = sweep.sweptValues.length

  if (from.kind === "project") {
    progress(
      `sweep: project "${from.project.name}" from ${from.projectPath}; ` +
        `${sweep.phase}-phase key "${sweep.sweptKey}" × ${total} value(s)`,
    )
  } else {
    progress(
      `sweep: existing plan ${from.planDir} (project "${from.project.name}"); ` +
        `${sweep.phase}-phase key "${sweep.sweptKey}" × ${total} value(s)`,
    )
  }

  if (sweep.phase === "plan") {
    if (from.kind !== "project") {
      fail("internal: plan-phase sweep reached repo-phase from-resolution")
    }
    for (let i = 0; i < total; i++) {
      const value = sweep.sweptValues[i]
      const entrySettings = materializeSettings(
        sweep.baseSettings,
        sweep.sweptKey,
        value,
        `${sweepPath}[${i}]`,
      )
      progress(
        `sweep: variant ${i + 1}/${total} — ${sweep.sweptKey}=${JSON.stringify(value)}`,
      )
      await runEntry(
        from.project,
        from.projectPath,
        entrySettings,
        opts.verbosity,
        runStart,
      )
    }
  } else if (from.kind === "plan") {
    for (let i = 0; i < total; i++) {
      const value = sweep.sweptValues[i]
      const entrySettings = materializeSettings(
        sweep.baseSettings,
        sweep.sweptKey,
        value,
        `${sweepPath}[${i}]`,
      )
      progress(
        `sweep: repo ${i + 1}/${total} — ${sweep.sweptKey}=${JSON.stringify(value)}`,
      )
      await runRepoForExistingPlan(
        from,
        entrySettings,
        opts.verbosity,
        runStart,
      )
    }
  } else {
    const firstSettings = materializeSettings(
      sweep.baseSettings,
      sweep.sweptKey,
      sweep.sweptValues[0],
      `${sweepPath}[0]`,
    )
    progress(
      `sweep: planning once for ${total} repo variant(s); base ${sweep.sweptKey}=${JSON.stringify(sweep.sweptValues[0])}`,
    )
    const { plan, planDir, plannerUsage } = await archivePlanForEntry(
      from.project,
      from.projectPath,
      firstSettings,
      opts.verbosity,
      runStart,
    )
    for (let i = 0; i < total; i++) {
      const value = sweep.sweptValues[i]
      const entrySettings = materializeSettings(
        sweep.baseSettings,
        sweep.sweptKey,
        value,
        `${sweepPath}[${i}]`,
      )
      progress(
        `sweep: repo ${i + 1}/${total} — ${sweep.sweptKey}=${JSON.stringify(value)}`,
      )
      await runRepoForEntry(
        from.project,
        plan,
        planDir,
        entrySettings,
        opts.verbosity,
        runStart,
        i === 0
          ? plannerUsage
          : { input_tokens: 0, output_tokens: 0, wall_ms: 0 },
      )
    }
  }
  process.stdout.write(
    `Sweep complete (${total} variant(s)). ${formatSeconds(Date.now() - runStart)} total.\n`,
  )
}

async function handleEvaluate(opts: EvaluateOpts): Promise<void> {
  let rootDir: string
  if (opts.fromPath) {
    const abs = resolveFrom(opts.fromPath)
    if (!existsSync(abs)) fail(`--from path not found: ${abs}`)
    rootDir = isDir(abs) ? abs : dirname(abs)
  } else {
    rootDir = FIXTURES_DIR
    const state = readState()
    const insideFixtures = (p: string): boolean =>
      p === FIXTURES_DIR || p.startsWith(`${FIXTURES_DIR}/`)
    const candidates: string[] = []
    // Prefer state.plan: plans always live in FIXTURES_DIR even when the
    // seed project file is external. Grandparent = c<N>-<name>/ project dir.
    if (state.plan) {
      const planAbs = resolveFrom(state.plan)
      if (insideFixtures(planAbs) && existsSync(planAbs)) {
        candidates.push(dirname(dirname(planAbs)))
      }
    }
    if (state.project) {
      const projectAbs = resolveFrom(state.project)
      const projectCand = isDir(projectAbs) ? projectAbs : dirname(projectAbs)
      if (insideFixtures(projectCand) && existsSync(projectCand)) {
        candidates.push(projectCand)
      }
    }
    const picked = candidates.find((c) => findRepoDirs(c).length > 0)
    if (picked) {
      rootDir = picked
    } else if (state.project || state.plan) {
      progress(
        `.fixture-state.json points outside ${FIXTURES_DIR} or yields no repos; walking ${FIXTURES_DIR}`,
      )
    }
  }
  const outPath = opts.outPath
    ? isAbsolute(opts.outPath)
      ? opts.outPath
      : resolve(process.cwd(), opts.outPath)
    : null
  await runEvaluate({
    rootDir,
    evaluatorSpec: { model: opts.evaluatorModel, effort: opts.evaluatorEffort },
    outPath,
  })
}

function handleInit(opts: InitOpts): void {
  mkdirSync(FIXTURES_DIR, { recursive: true })
  const conflicts: string[] = []
  if (existsSync(FIXTURE_SETTINGS_FILE)) conflicts.push(FIXTURE_SETTINGS_FILE)
  if (existsSync(FIXTURE_SWEEP_FILE)) conflicts.push(FIXTURE_SWEEP_FILE)
  if (existsSync(FIXTURE_STATE_FILE)) conflicts.push(FIXTURE_STATE_FILE)
  if (conflicts.length > 0 && !opts.force) {
    fail(
      `already exists: ${conflicts.join(", ")}; pass -f / --force to overwrite`,
    )
  }
  writeSettings(FIXTURES_DIR, HARDCODED_SETTINGS)
  writeSweep(FIXTURES_DIR)
  writeState({ project: null, plan: null })
  process.stdout.write(`Wrote ${FIXTURE_SETTINGS_FILE}\n`)
  process.stdout.write(`Wrote ${FIXTURE_SWEEP_FILE}\n`)
  process.stdout.write(`Wrote ${FIXTURE_STATE_FILE}\n`)
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.subcommand === "init") {
    handleInit(opts)
    return
  }
  scaffoldFixturesDir()
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
    case "sweep":
      await handleSweep(opts, runStart)
      break
    case "evaluate":
      await handleEvaluate(opts)
      break
  }
}

main().catch((err) => {
  if (err instanceof FixtureError) {
    process.stderr.write(`fixture: ${err.message}\n`)
    process.stderr.write("Run with --help for usage.\n")
    process.exit(2)
  }
  process.stderr.write(
    `fixture: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
