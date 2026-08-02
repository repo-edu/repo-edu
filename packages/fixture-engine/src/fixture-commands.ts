import { existsSync, mkdirSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { parseShortCode } from "@repo-edu/integrations-llm-catalog"
import type { LlmUsage } from "@repo-edu/integrations-llm-contract"
import type {
  EvaluateOpts,
  InitOpts,
  PlanOpts,
  ProjectOpts,
  RepoOpts,
} from "./cli"
import { FIXTURES_DIR } from "./constants"
import {
  FIXTURE_SETTINGS_FILE,
  FIXTURE_SWEEP_FILE,
  HARDCODED_SETTINGS,
  readSettings,
  writeSettings,
  writeSweep,
} from "./defaults"
import { findRepoDirs, runEvaluate } from "./evaluate"
import {
  archivePlanIntoDir,
  archiveProject,
  currentSettings,
  emitPlan,
  initLogs,
  isDir,
  latestVersion,
  loadPlanFrom,
  loadProjectFrom,
  producePlan,
  produceProject,
  reservePlanDir,
  reserveRepoDir,
  resolveFrom,
  resolveSinglePlan,
  runCoderStage,
  settingsForEvaluate,
  settingsForPlan,
  settingsForProject,
  settingsForRepo,
  writeActiveCapMarker,
} from "./fixture-shared"
import { emptyUsage } from "./llm-client"
import { emit, fail, formatSeconds, progress } from "./log"
import type { PlanNameOpts, RepoNameOpts } from "./naming"
import type { Project } from "./project-md"
import { projectToMarkdown } from "./project-md"
import { FIXTURE_STATE_FILE, readState, writeState } from "./state"

async function archiveGeneratedPlan(
  project: Project,
  fromPath: string,
  opts: PlanOpts,
  students: number,
  runStart: number,
): Promise<{ planPath: string; usage: LlmUsage }> {
  const planNameOpts: PlanNameOpts = {
    plannerSpec: opts.plannerSpec,
    complexity: project.complexity,
    students,
    rounds: opts.rounds,
    reviews: opts.reviews,
    refactors: opts.refactors,
    coderInteraction: opts.coderInteraction,
    style: opts.style,
  }
  const planDir = reservePlanDir(project, planNameOpts)
  initLogs(opts.verbosity, planDir)
  progress(`loaded project "${project.name}" from ${fromPath}`)
  const planOpts = { ...opts, students }
  const { plan, usage } = await producePlan(project, planOpts, runStart)
  const planPath = archivePlanIntoDir(
    project,
    plan,
    planNameOpts,
    fromPath,
    planDir,
  )
  emitPlan(project, plan, planNameOpts, relative(planDir, fromPath))
  const updated = settingsForPlan(currentSettings(), planOpts)
  writeSettings(FIXTURES_DIR(), updated)
  writeSettings(planDir, updated)
  return { planPath, usage }
}

export async function handleProject(
  opts: ProjectOpts,
  runStart: number,
): Promise<void> {
  initLogs(opts.verbosity, FIXTURES_DIR())
  const { project, usage } = await produceProject(opts, runStart)
  archiveProject(project)
  emit(1, projectToMarkdown(project))
  writeSettings(FIXTURES_DIR(), settingsForProject(currentSettings(), opts))
  const runMs = Date.now() - runStart
  process.stdout.write(
    `Project "${project.name}" archived. Wall time: ${formatSeconds(runMs)} | tokens in/cached/out: ${usage.inputTokens} / ${usage.cachedInputTokens} / ${usage.outputTokens}\n`,
  )
}

export async function handlePlan(
  opts: PlanOpts,
  runStart: number,
): Promise<void> {
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
  const { planPath, usage } = await archiveGeneratedPlan(
    project,
    fromPath,
    opts,
    opts.students,
    runStart,
  )
  const runMs = Date.now() - runStart
  process.stdout.write(
    `Plan archived: ${planPath}\nWall time: ${formatSeconds(runMs)} | tokens in/cached/out: ${usage.inputTokens} / ${usage.cachedInputTokens} / ${usage.outputTokens}\n`,
  )
}

export async function handleRepo(
  opts: RepoOpts,
  runStart: number,
): Promise<void> {
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
    coderSpec: opts.coderSpec,
    reviewerSpec: opts.reviewerSpec,
    comments: opts.comments,
    reviews: meta.reviews,
  }
  const repoDir = reserveRepoDir(planDir, repoNameOpts)
  initLogs(opts.verbosity, repoDir)
  progress(`loaded plan for project "${project.name}" from ${fromPath}`)
  const plannerSpec = parseShortCode(meta.planner, "mp")
  const planNameOpts: PlanNameOpts = {
    plannerSpec,
    complexity: project.complexity,
    students: meta.students,
    rounds: meta.rounds,
    reviews: meta.reviews,
    refactors: meta.refactors,
    coderInteraction: meta.coderInteraction,
    style: meta.style,
  }
  emitPlan(project, plan, planNameOpts, meta.projectFile)
  try {
    await runCoderStage(
      project,
      plan,
      {
        rounds: meta.rounds,
        students: meta.students,
        reviews: meta.reviews,
        refactors: meta.refactors,
      },
      {
        coderSpec: opts.coderSpec,
        reviewerSpec: opts.reviewerSpec,
        comments: opts.comments,
        students: meta.students,
        plannerSpec,
      },
      planDir,
      repoDir,
      runStart,
      emptyUsage(),
    )
  } catch (err) {
    writeActiveCapMarker(repoDir, err)
    throw err
  }
  const prevPlanSettings = readSettings(planDir)
  const updated = settingsForRepo(prevPlanSettings, opts)
  writeSettings(repoDir, updated)
  writeSettings(FIXTURES_DIR(), settingsForRepo(currentSettings(), opts))
}

export async function handleEvaluate(
  opts: EvaluateOpts,
  runStart: number,
): Promise<void> {
  let rootDir: string
  if (opts.fromPath) {
    const abs = resolveFrom(opts.fromPath)
    if (!existsSync(abs)) fail(`--from path not found: ${abs}`)
    rootDir = isDir(abs) ? abs : dirname(abs)
  } else {
    rootDir = FIXTURES_DIR()
    const state = readState()
    const insideFixtures = (path: string): boolean =>
      path === FIXTURES_DIR() || path.startsWith(`${FIXTURES_DIR()}/`)
    const candidates: string[] = []
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
    const picked = candidates.find(
      (candidate) => findRepoDirs(candidate).length > 0,
    )
    if (picked) {
      rootDir = picked
    } else if (state.project || state.plan) {
      progress(
        `.fixture-state.json points outside ${FIXTURES_DIR()} or yields no repos; walking ${FIXTURES_DIR()}`,
      )
    }
  }
  const outPath = opts.outPath
    ? isAbsolute(opts.outPath)
      ? opts.outPath
      : resolve(process.cwd(), opts.outPath)
    : null
  const result = await runEvaluate({
    rootDir,
    evaluatorSpec: opts.evaluatorSpec,
    outPath,
    runStart,
  })
  writeSettings(FIXTURES_DIR(), settingsForEvaluate(currentSettings(), opts))
  process.stdout.write(
    `Evaluation complete (${result.reportCount} repo(s)). ${formatSeconds(Date.now() - runStart)} total.\n`,
  )
}

export function handleInit(opts: InitOpts): void {
  mkdirSync(FIXTURES_DIR(), { recursive: true })
  const conflicts: string[] = []
  if (existsSync(FIXTURE_SETTINGS_FILE()))
    conflicts.push(FIXTURE_SETTINGS_FILE())
  if (existsSync(FIXTURE_SWEEP_FILE())) conflicts.push(FIXTURE_SWEEP_FILE())
  if (existsSync(FIXTURE_STATE_FILE())) conflicts.push(FIXTURE_STATE_FILE())
  if (conflicts.length > 0 && !opts.force) {
    fail(
      `already exists: ${conflicts.join(", ")}; pass -f / --force to overwrite`,
    )
  }
  writeSettings(FIXTURES_DIR(), HARDCODED_SETTINGS)
  writeSweep(FIXTURES_DIR())
  if (opts.fromPath) {
    const abs = isAbsolute(opts.fromPath)
      ? opts.fromPath
      : resolve(process.cwd(), opts.fromPath)
    const project = loadProjectFrom(abs)
    archiveProject(project)
  } else {
    writeState({ project: null, plan: null })
  }
  process.stdout.write(`Wrote ${FIXTURE_SETTINGS_FILE()}\n`)
  process.stdout.write(`Wrote ${FIXTURE_SWEEP_FILE()}\n`)
  process.stdout.write(`Wrote ${FIXTURE_STATE_FILE()}\n`)
}
