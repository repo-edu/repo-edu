import { existsSync } from "node:fs"
import { basename, dirname, relative, resolve } from "node:path"
import { parseShortCode } from "@repo-edu/integrations-llm-catalog"
import type { LlmUsage } from "@repo-edu/integrations-llm-contract"
import type { SweepOpts } from "./cli"
import { FIXTURES_DIR, PLAN_BASENAME } from "./constants"
import {
  FIXTURE_SWEEP_FILE,
  loadSweepFile,
  materializeSettings,
  readSettings,
  type Settings,
  type SweepPhase,
  writeSettings,
} from "./defaults"
import {
  activeCapError,
  archivePlanIntoDir,
  emitPlan,
  findBlockingCap,
  initLogs,
  isDir,
  latestVersion,
  loadPlanFrom,
  loadProjectFrom,
  producePlan,
  reservePlanDir,
  reserveRepoDir,
  resolveFrom,
  resolveSinglePlan,
  runCoderStage,
  writeActiveCapMarker,
} from "./fixture-shared"
import { emptyUsage } from "./llm-client"
import { fail, formatSeconds, progress } from "./log"
import type { PlanNameOpts, RepoNameOpts } from "./naming"
import type { Plan, PlanMeta } from "./plan-md"
import type { Project } from "./project-md"
import { readState } from "./state"
import {
  bucketLabel,
  type CappedBucket,
  recordCapFromError,
} from "./sweep-buckets"

interface EntryPlan {
  plan: Plan
  planDir: string
  plannerUsage: LlmUsage
}

async function archivePlanForEntry(
  project: Project,
  projectPath: string,
  entrySettings: Settings,
  verbosity: number,
  runStart: number,
): Promise<EntryPlan> {
  const plannerSpec = parseShortCode(entrySettings.mp, "mp")
  const planNameOpts: PlanNameOpts = {
    plannerSpec,
    complexity: project.complexity,
    students: entrySettings.students,
    rounds: entrySettings.rounds,
    reviews: entrySettings.reviews,
    refactors: entrySettings.refactors,
    coderInteraction: entrySettings.coderInteraction,
    style: entrySettings.style,
  }
  const planDir = reservePlanDir(project, planNameOpts)
  initLogs(verbosity, planDir)
  const planGenOpts = {
    plannerSpec,
    rounds: entrySettings.rounds,
    students: entrySettings.students,
    reviews: entrySettings.reviews,
    refactors: entrySettings.refactors,
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
  writeSettings(FIXTURES_DIR(), entrySettings)
  return { plan, planDir, plannerUsage }
}

async function runRepoForEntry(
  project: Project,
  plan: Plan,
  planDir: string,
  entrySettings: Settings,
  verbosity: number,
  runStart: number,
  plannerUsage: LlmUsage,
): Promise<void> {
  const plannerSpec = parseShortCode(entrySettings.mp, "mp")
  const coderSpec = parseShortCode(entrySettings.mc, "mc")
  const reviewerSpec = parseShortCode(entrySettings.mr, "mc")
  const repoNameOpts: RepoNameOpts = {
    coderSpec,
    reviewerSpec,
    comments: entrySettings.comments,
    reviews: entrySettings.reviews,
  }
  const repoDir = reserveRepoDir(planDir, repoNameOpts)
  initLogs(verbosity, repoDir)
  try {
    await runCoderStage(
      project,
      plan,
      {
        rounds: entrySettings.rounds,
        students: entrySettings.students,
        reviews: entrySettings.reviews,
        refactors: entrySettings.refactors,
      },
      {
        coderSpec,
        reviewerSpec,
        comments: entrySettings.comments,
        students: entrySettings.students,
        plannerSpec,
      },
      planDir,
      repoDir,
      runStart,
      plannerUsage,
    )
  } catch (err) {
    writeActiveCapMarker(repoDir, err)
    throw err
  }
  writeSettings(repoDir, entrySettings)
  writeSettings(FIXTURES_DIR(), entrySettings)
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
  const coderSpec = parseShortCode(entrySettings.mc, "mc")
  const reviewerSpec = parseShortCode(entrySettings.mr, "mc")
  const plannerSpec = parseShortCode(from.meta.planner, "mp")
  const repoNameOpts: RepoNameOpts = {
    coderSpec,
    reviewerSpec,
    comments: entrySettings.comments,
    reviews: from.meta.reviews,
  }
  const repoDir = reserveRepoDir(from.planDir, repoNameOpts)
  initLogs(verbosity, repoDir)
  try {
    await runCoderStage(
      from.project,
      from.plan,
      {
        rounds: from.meta.rounds,
        students: from.meta.students,
        reviews: from.meta.reviews,
        refactors: from.meta.refactors,
      },
      {
        coderSpec,
        reviewerSpec,
        comments: entrySettings.comments,
        students: from.meta.students,
        plannerSpec,
      },
      from.planDir,
      repoDir,
      runStart,
      emptyUsage(),
    )
  } catch (err) {
    writeActiveCapMarker(repoDir, err)
    throw err
  }
  const prevPlanSettings = readSettings(from.planDir)
  const updated: Settings = {
    ...prevPlanSettings,
    mc: entrySettings.mc,
    mr: entrySettings.mr,
    comments: entrySettings.comments,
  }
  writeSettings(repoDir, updated)
  writeSettings(FIXTURES_DIR(), updated)
}

export async function handleSweep(
  opts: SweepOpts,
  runStart: number,
): Promise<void> {
  const sweepPath = opts.sweepPath
    ? resolveFrom(opts.sweepPath)
    : FIXTURE_SWEEP_FILE()
  const sweep = loadSweepFile(sweepPath)
  const from = resolveSweepFrom(opts, sweep.phase)
  const total = sweep.variants.length
  const sweptLabel = sweep.sweptKeys.join(",")
  const variantLabel = (variant: Partial<Settings>): string =>
    sweep.sweptKeys
      .map((key) => `${key}=${JSON.stringify(variant[key])}`)
      .join(" ")

  if (from.kind === "project") {
    progress(
      `sweep: project "${from.project.name}" from ${from.projectPath}; ` +
        `${sweep.phase}-phase key(s) "${sweptLabel}" × ${total} variant(s)`,
    )
  } else {
    progress(
      `sweep: existing plan ${from.planDir} (project "${from.project.name}"); ` +
        `${sweep.phase}-phase key(s) "${sweptLabel}" × ${total} variant(s)`,
    )
  }

  for (let index = 0; index < total; index++) {
    const variant = sweep.variants[index]
    const entrySettings = materializeSettings(
      sweep.baseSettings,
      variant,
      `${sweepPath}[${index}]`,
    )
    parseShortCode(entrySettings.mp, "mp")
    parseShortCode(entrySettings.mc, "mc")
    parseShortCode(entrySettings.mr, "mc")
  }

  const cappedBuckets: CappedBucket[] = []

  if (sweep.phase === "plan") {
    if (from.kind !== "project") {
      fail("internal: plan-phase sweep reached repo-phase from-resolution")
    }
    for (let index = 0; index < total; index++) {
      const variant = sweep.variants[index]
      const entrySettings = materializeSettings(
        sweep.baseSettings,
        variant,
        `${sweepPath}[${index}]`,
      )
      const variantPlannerSpec = parseShortCode(entrySettings.mp, "mp")
      const variantCoderSpec = parseShortCode(entrySettings.mc, "mc")
      const variantReviewerSpec = parseShortCode(entrySettings.mr, "mc")
      const blocking = findBlockingCap(cappedBuckets, [
        variantPlannerSpec,
        variantCoderSpec,
        variantReviewerSpec,
      ])
      if (blocking) {
        if (index > 0) process.stderr.write("\n")
        progress(
          `sweep: variant ${index + 1}/${total} — ${variantLabel(variant)} skipped (bucket ${bucketLabel(blocking)} ${blocking.kind})`,
        )
        continue
      }
      if (index > 0) process.stderr.write("\n")
      progress(
        `sweep: variant ${index + 1}/${total} — ${variantLabel(variant)}`,
      )
      const planned = await archivePlanForEntry(
        from.project,
        from.projectPath,
        entrySettings,
        opts.verbosity,
        runStart,
      )
      try {
        await runRepoForEntry(
          from.project,
          planned.plan,
          planned.planDir,
          entrySettings,
          opts.verbosity,
          runStart,
          planned.plannerUsage,
        )
      } catch (err) {
        const active = activeCapError(err)
        if (active) {
          const bucket = recordCapFromError(
            cappedBuckets,
            active.error,
            active.spec.provider,
          )
          progress(
            `sweep: cap hit on bucket ${bucketLabel(bucket)} (${bucket.kind}); skipping remaining same-bucket variants`,
          )
          continue
        }
        throw err
      }
    }
  } else if (from.kind === "plan") {
    for (let index = 0; index < total; index++) {
      const variant = sweep.variants[index]
      const entrySettings = materializeSettings(
        sweep.baseSettings,
        variant,
        `${sweepPath}[${index}]`,
      )
      const variantCoderSpec = parseShortCode(entrySettings.mc, "mc")
      const variantReviewerSpec = parseShortCode(entrySettings.mr, "mc")
      const blocking = findBlockingCap(cappedBuckets, [
        variantCoderSpec,
        variantReviewerSpec,
      ])
      if (blocking) {
        if (index > 0) process.stderr.write("\n")
        progress(
          `sweep: repo ${index + 1}/${total} — ${variantLabel(variant)} skipped (bucket ${bucketLabel(blocking)} ${blocking.kind})`,
        )
        continue
      }
      if (index > 0) process.stderr.write("\n")
      progress(`sweep: repo ${index + 1}/${total} — ${variantLabel(variant)}`)
      try {
        await runRepoForExistingPlan(
          from,
          entrySettings,
          opts.verbosity,
          runStart,
        )
      } catch (err) {
        const active = activeCapError(err)
        if (active) {
          const bucket = recordCapFromError(
            cappedBuckets,
            active.error,
            active.spec.provider,
          )
          progress(
            `sweep: cap hit on bucket ${bucketLabel(bucket)} (${bucket.kind}); skipping remaining same-bucket variants`,
          )
          continue
        }
        throw err
      }
    }
  } else {
    const firstSettings = materializeSettings(
      sweep.baseSettings,
      sweep.variants[0],
      `${sweepPath}[0]`,
    )
    progress(
      `sweep: planning once for ${total} repo variant(s); base ${variantLabel(sweep.variants[0])}`,
    )
    const { plan, planDir, plannerUsage } = await archivePlanForEntry(
      from.project,
      from.projectPath,
      firstSettings,
      opts.verbosity,
      runStart,
    )
    for (let index = 0; index < total; index++) {
      const variant = sweep.variants[index]
      const entrySettings = materializeSettings(
        sweep.baseSettings,
        variant,
        `${sweepPath}[${index}]`,
      )
      const variantCoderSpec = parseShortCode(entrySettings.mc, "mc")
      const variantReviewerSpec = parseShortCode(entrySettings.mr, "mc")
      const blocking = findBlockingCap(cappedBuckets, [
        variantCoderSpec,
        variantReviewerSpec,
      ])
      if (blocking) {
        if (index > 0) process.stderr.write("\n")
        progress(
          `sweep: repo ${index + 1}/${total} — ${variantLabel(variant)} skipped (bucket ${bucketLabel(blocking)} ${blocking.kind})`,
        )
        continue
      }
      if (index > 0) process.stderr.write("\n")
      progress(`sweep: repo ${index + 1}/${total} — ${variantLabel(variant)}`)
      try {
        await runRepoForEntry(
          from.project,
          plan,
          planDir,
          entrySettings,
          opts.verbosity,
          runStart,
          index === 0 ? plannerUsage : emptyUsage(),
        )
      } catch (err) {
        const active = activeCapError(err)
        if (active) {
          const bucket = recordCapFromError(
            cappedBuckets,
            active.error,
            active.spec.provider,
          )
          progress(
            `sweep: cap hit on bucket ${bucketLabel(bucket)} (${bucket.kind}); skipping remaining same-bucket variants`,
          )
          continue
        }
        throw err
      }
    }
  }
  process.stdout.write(
    `Sweep complete (${total} variant(s)). ${formatSeconds(Date.now() - runStart)} total.\n`,
  )
}
