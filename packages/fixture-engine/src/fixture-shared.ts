import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, relative, resolve } from "node:path"
import {
  type FixtureModelSpec,
  modelCode,
} from "@repo-edu/integrations-llm-catalog"
import { LlmError, type LlmUsage } from "@repo-edu/integrations-llm-contract"
import {
  CoderRoundLlmError,
  type CoderRunOpts,
  initRepo,
  runCoderLoop,
} from "./coder"
import type { CohortTeamIdentity } from "./cohort-team-source"
import {
  FIXTURES_DIR,
  LOG_BASENAME,
  PLAN_BASENAME,
  TRACE_BASENAME,
  XTRACE_BASENAME,
} from "./constants"
import {
  FIXTURE_SETTINGS_FILE,
  HARDCODED_SETTINGS,
  SETTINGS,
  type Settings,
  writeSettings,
} from "./defaults"
import { resolveProjectFromPlan } from "./evaluate"
import {
  emit,
  fail,
  formatSeconds,
  progress,
  setEmitState,
  withTicker,
} from "./log"
import { isCapErrorKind, writeCapMarkerForRepo } from "./markers"
import {
  nextAvailable,
  type PlanNameOpts,
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
import { writeState } from "./state"
import { type CappedBucket, findCappedBucket } from "./sweep-buckets"

export function activeCapError(
  err: unknown,
): { error: LlmError; spec: FixtureModelSpec } | null {
  if (err instanceof CoderRoundLlmError && isCapErrorKind(err.error.kind)) {
    return { error: err.error, spec: err.activeSpec }
  }
  if (err instanceof LlmError && isCapErrorKind(err.kind)) {
    return null
  }
  return null
}

export function writeActiveCapMarker(repoDir: string, err: unknown): void {
  const active = activeCapError(err)
  if (active) writeCapMarkerForRepo(repoDir, active.error, active.spec)
}

export function findBlockingCap(
  buckets: readonly CappedBucket[],
  specs: readonly FixtureModelSpec[],
): CappedBucket | undefined {
  for (const spec of specs) {
    const bucket = findCappedBucket(buckets, spec.provider)
    if (bucket) return bucket
  }
  return undefined
}

export function scaffoldFixturesDir(): void {
  mkdirSync(FIXTURES_DIR(), { recursive: true })
  if (!existsSync(FIXTURE_SETTINGS_FILE())) {
    writeSettings(FIXTURES_DIR(), HARDCODED_SETTINGS)
    progress(`scaffolded ${FIXTURE_SETTINGS_FILE()}`)
  }
}

export function initLogs(verbosity: number, dir: string): void {
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
  return resolve(FIXTURES_DIR(), `c${project.complexity}-${project.name}`)
}

export function resolveFrom(path: string): string {
  return isAbsolute(path) ? path : resolve(FIXTURES_DIR(), path)
}

export function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory()
}

export function latestVersion(
  dir: string,
  base: string,
  ext: string,
): string | null {
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

export function resolveSinglePlan(dir: string): string {
  const direct = resolve(dir, PLAN_BASENAME)
  if (existsSync(direct)) return direct
  const planDirs = readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(dir, entry.name, PLAN_BASENAME)),
    )
    .map((entry) => entry.name)
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

export function archiveProject(project: Project): string {
  const dir = projectDir(project)
  mkdirSync(dir, { recursive: true })
  const name = nextAvailable(dir, "project", ".md")
  const path = resolve(dir, name)
  writeFileSync(path, projectToMarkdown(project))
  progress(`archived project to ${path}`)
  writeState({ project: relative(FIXTURES_DIR(), path), plan: null })
  return name
}

export function reservePlanDir(project: Project, opts: PlanNameOpts): string {
  const parentDir = projectDir(project)
  mkdirSync(parentDir, { recursive: true })
  const planDirName = nextAvailable(parentDir, planPostfix(opts))
  const planDir = resolve(parentDir, planDirName)
  mkdirSync(planDir, { recursive: true })
  return planDir
}

export function reserveRepoDir(planDir: string, opts: RepoNameOpts): string {
  const dirName = nextAvailable(planDir, repoPostfix(opts))
  const dir = resolve(planDir, dirName)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function archivePlanIntoDir(
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
    planner: modelCode(opts.plannerSpec),
    rounds: opts.rounds,
    students: opts.students,
    reviews: opts.reviews,
    refactors: opts.refactors,
    coderInteraction: opts.coderInteraction,
    style: opts.style,
  }
  writeFileSync(planPath, planToMarkdown({ meta, plan }))
  progress(`archived plan to ${planPath}`)
  writeState({
    project: relative(FIXTURES_DIR(), projectPath),
    plan: relative(FIXTURES_DIR(), planPath),
  })
  return planPath
}

export function emitPlan(
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
        planner: modelCode(opts.plannerSpec),
        rounds: opts.rounds,
        students: opts.students,
        reviews: opts.reviews,
        refactors: opts.refactors,
        coderInteraction: opts.coderInteraction,
        style: opts.style,
      },
      plan,
    }),
  )
}

export async function produceProject(
  opts: ProjectGenOpts,
  runStart: number,
): Promise<{ project: Project; usage: LlmUsage }> {
  const existing = existingDirs()
  const { project, usage } = await withTicker(
    "fixture: generating project…",
    () => generateProject(opts, existing),
  )
  progress(
    `project ready (${formatSeconds(usage.wallMs)}, cumulative ${formatSeconds(Date.now() - runStart)})`,
  )
  return { project, usage }
}

export async function producePlan(
  project: Project,
  opts: PlanGenOpts,
  runStart: number,
): Promise<{ plan: Plan; usage: LlmUsage }> {
  const kindSequence = sampleKindSequence(
    opts.rounds,
    opts.reviews,
    opts.refactors,
  )
  progress(
    `sampled kind sequence (${opts.rounds} builds + ${opts.reviews} reviews + ${opts.refactors} refactors)`,
  )
  const { plan, usage } = await withTicker("fixture: generating plan…", () =>
    generatePlan(project, opts, kindSequence),
  )
  progress(
    `plan ready (${formatSeconds(usage.wallMs)}, cumulative ${formatSeconds(Date.now() - runStart)})`,
  )
  return { plan, usage }
}

export function loadProjectFrom(path: string): Project {
  if (!existsSync(path)) fail(`project file not found: ${path}`)
  return markdownToProject(readFileSync(path, "utf8"))
}

export function loadPlanFrom(path: string): {
  meta: PlanMeta
  plan: Plan
  project: Project
} {
  if (!existsSync(path)) fail(`plan file not found: ${path}`)
  const pf = markdownToPlan(readFileSync(path, "utf8"))
  const projectPath = resolveProjectFromPlan(dirname(path), pf.meta.projectFile)
  const project = loadProjectFrom(projectPath)
  validatePlan(pf.plan, pf.meta.students, pf.plan.commits.length)
  return { meta: pf.meta, plan: pf.plan, project }
}

export async function runCoderStage(
  project: Project,
  plan: Plan,
  planMeta: {
    rounds: number
    students: number
    reviews: number
    refactors: number
  },
  coderOpts: CoderRunOpts & { plannerSpec: FixtureModelSpec },
  planDir: string,
  repoDir: string,
  runStart: number,
  plannerUsage: LlmUsage,
): Promise<void> {
  initRepo(repoDir)

  const state = await runCoderLoop(project, plan, coderOpts, repoDir, runStart)

  const reviewOpts: ReviewSummaryOpts = {
    rounds: planMeta.rounds,
    complexity: project.complexity,
    students: planMeta.students,
    reviews: planMeta.reviews,
    refactors: planMeta.refactors,
    plannerSpec: coderOpts.plannerSpec,
    coderSpec: coderOpts.coderSpec,
    reviewerSpec: coderOpts.reviewerSpec,
  }
  const displayDir = `${relative(FIXTURES_DIR(), planDir)}/${basename(repoDir)}`
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

export function settingsForProject(
  prev: Settings,
  opts: ProjectGenOpts,
): Settings {
  return {
    ...prev,
    mp: modelCode(opts.plannerSpec),
    complexity: opts.complexity,
  }
}

export function settingsForPlan(prev: Settings, opts: PlanGenOpts): Settings {
  return {
    ...prev,
    mp: modelCode(opts.plannerSpec),
    students: opts.students,
    rounds: opts.rounds,
    coderInteraction: opts.coderInteraction,
    reviews: opts.reviews,
    refactors: opts.refactors,
    style: opts.style,
  }
}

export function overlayPlanTeamIdentities(
  plan: Plan,
  identities: readonly CohortTeamIdentity[],
): void {
  if (plan.team.length !== identities.length) {
    fail(
      `cohort team has ${identities.length} member(s), but planner returned ${plan.team.length}`,
    )
  }
  plan.team = plan.team.map((member, index) => ({
    ...member,
    name: identities[index].name,
    email: identities[index].email,
  }))
}

export function settingsForRepo(
  prev: Settings,
  opts: {
    coderSpec: FixtureModelSpec
    reviewerSpec: FixtureModelSpec
    comments: number
  },
): Settings {
  return {
    ...prev,
    mc: modelCode(opts.coderSpec),
    mr: modelCode(opts.reviewerSpec),
    comments: opts.comments,
  }
}

export function settingsForEvaluate(
  prev: Settings,
  opts: { evaluatorSpec: FixtureModelSpec },
): Settings {
  return {
    ...prev,
    me: modelCode(opts.evaluatorSpec),
  }
}

export function currentSettings(): Settings {
  return SETTINGS()
}
