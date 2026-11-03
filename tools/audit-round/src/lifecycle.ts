import { readFile } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { execa } from "execa"
import type { CommitStamps } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { readAuditRanges, readPlanSteps } from "./plan-steps.js"
import { markerPath } from "./round-paths.js"
import { claimRound } from "./run-files.js"
import { type Coder, coderRecord, parseCoderRecord } from "./settings.js"
import { looseForm, type Repository } from "./subject.js"
import { planStem } from "./target.js"

type CommitOnlyInput = {
  readonly cwd: string
  readonly subject: string
  readonly body?: string
  readonly paths?: readonly string[]
  readonly stamps?: CommitStamps
}

export type LifecycleCommit = {
  readonly sha: string
  readonly subject: string
}

export type SettleCommit = LifecycleCommit & {
  readonly marker: string
}

/**
 * Commit only the named paths, or HEAD's tree when there are none. Existing
 * staged work remains staged, and Git runs the repository's normal hooks.
 */
export async function commitOnly(
  input: CommitOnlyInput,
): Promise<LifecycleCommit> {
  const args = [
    "commit",
    "--only",
    "--allow-empty",
    "-m",
    input.subject,
    ...(input.body === undefined ? [] : ["-m", input.body]),
    ...(input.paths === undefined || input.paths.length === 0
      ? []
      : ["--", ...input.paths]),
  ]
  await execa("git", args, {
    cwd: input.cwd,
    env:
      input.stamps === undefined
        ? undefined
        : {
            COMMIT_AUDITOR: input.stamps.auditor ?? undefined,
            COMMIT_PHASES: input.stamps.phases ?? undefined,
          },
  })
  const sha = (await execa("git", ["rev-parse", "HEAD"], { cwd: input.cwd }))
    .stdout
  return { sha, subject: input.subject }
}

/** A lifecycle marker records only a plan version already committed at HEAD. */
async function requireCommittedPlan(planRoot: string, plan: string) {
  const path = relative(planRoot, plan)
  const { stdout } = await execa(
    "git",
    [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignored",
      "--",
      path,
    ],
    { cwd: planRoot },
  )
  if (stdout.length === 0) return

  const states = new Set<string>()
  for (const line of stdout.split("\n")) {
    const status = line.slice(0, 2)
    if (status === "??" || status === "!!") {
      states.add("untracked")
      continue
    }
    if (status[0] !== " " && status[0] !== "!") states.add("staged changes")
    if (status[1] !== " " && status[1] !== "!") states.add("unstaged changes")
  }
  throw new Error(
    `${basename(plan)} is not committed as it stands: ${[...states].join(" and ")}.`,
  )
}

/** Rename a widening plan, commit only that rename and then claim its marker. */
export async function settlePlan(
  context: ExecutionContext,
  plan: string,
): Promise<SettleCommit> {
  const name = basename(plan)
  if (!name.endsWith("-widen.md"))
    throw new Error(
      `Cannot settle ${name}: the active plan is not at ${planStem(plan)}-widen.md.`,
    )
  await requireCommittedPlan(context.planRoot, plan)

  const settledName = `${planStem(plan)}.md`
  const source = relative(context.planRoot, plan)
  await execa("git", ["mv", "--", source, settledName], {
    cwd: context.planRoot,
  })
  const subject = `${planStem(plan)}/settle: settle the plan's shape`
  const commit = await commitOnly({
    cwd: context.planRoot,
    subject,
    paths: [source, settledName],
  })
  const settled = join(context.planRoot, settledName)
  const marker = await markerPath(context, settled, "settle")
  claimRound(marker)
  return { ...commit, marker }
}

/** Record the user's ready declaration for one clean, settled plan version. */
export async function readyPlan(
  context: ExecutionContext,
  plan: string,
  coders: readonly Coder[],
): Promise<LifecycleCommit> {
  const name = basename(plan)
  if (name.endsWith("-widen.md"))
    throw new Error(`Cannot declare ${name} ready while it is still widening.`)
  await requireCommittedPlan(context.planRoot, plan)
  const source = await readFile(plan, "utf8")
  const steps = readPlanSteps(source)
  readAuditRanges(source, steps.length)

  const stem = planStem(plan)
  const existing = await findMarker(context.planRoot, stem, "ready")
  if (existing !== undefined)
    throw new Error(`${name} already has ready marker ${existing}.`)

  const markers = await readyMarkers(context.planRoot)
  let previous: Coder | null = null
  for (const marker of markers) {
    previous = await markerCoder(context.planRoot, marker.sha)
    if (previous !== null) break
  }
  const coder = nextCoder(coders, previous)

  return commitOnly({
    cwd: context.planRoot,
    subject: `${stem}/ready: declare the plan ready for implementation`,
    body: coderRecord(coder),
  })
}

/** Pick the coder after the newest assigned ready marker, wrapping the list. */
export function nextCoder(
  coders: readonly Coder[],
  previous: Coder | null,
): Coder {
  if (coders.length === 0) throw new Error("Coder list is empty")
  const at =
    previous === null
      ? -1
      : coders.findIndex(
          (coder) =>
            coder.assistant === previous.assistant &&
            coder.model === previous.model &&
            coder.effort === previous.effort,
        )
  return coders[(at + 1) % coders.length]
}

/** Read one active plan's ready assignment, or null before it has one. */
export async function readReadyCoder(
  planRoot: string,
  stem: string,
): Promise<Coder | null> {
  const marker = (await readyMarkers(planRoot)).find(
    (candidate) => candidate.stem === stem,
  )
  return marker === undefined ? null : markerCoder(planRoot, marker.sha)
}

/** Write one repo's empty completion marker without disturbing concurrent work. */
export async function markImplemented(
  context: ExecutionContext,
  stem: string,
  repository: Repository,
  tag: string,
  record: string,
): Promise<LifecycleCommit> {
  const cwd = repository === "repo-edu" ? context.repoEduRoot : context.planRoot
  const share = repository === "repo-edu" ? "Repo Edu" : "plan repo"
  return commitOnly({
    cwd,
    subject: `${stem}/implemented ${tag}: complete the ${share} share`,
    body: record,
  })
}

/**
 * A close without an abort reason archives the plan as shipped work, so it
 * requires the user's ready declaration in the stem scan. A plan that never
 * reached `ready` is an abandoned attempt under the plan doctrine and closes
 * only through `--aborted`.
 */
export async function requireReadyMarker(
  planRoot: string,
  plan: string,
): Promise<void> {
  const existing = await findMarker(planRoot, planStem(plan), "ready")
  if (existing !== undefined) return
  throw new Error(
    `${basename(plan)} has no ready marker. Run pnpm audit-round ready first, or close it with --aborted <reason>.`,
  )
}

/** The newest stem-scan line of the plan's marker with that role, as `<sha>\t<subject>`. */
async function findMarker(
  planRoot: string,
  stem: string,
  role: "ready",
): Promise<string | undefined> {
  const marker = (await readyMarkers(planRoot)).find(
    (candidate) => candidate.stem === stem,
  )
  return marker === undefined || role !== "ready"
    ? undefined
    : `${marker.short}\t${marker.subject}`
}

type ReadyMarker = {
  readonly sha: string
  readonly short: string
  readonly stem: string
  readonly subject: string
}

/** Ready markers in newest-first Git order, across every plan on this branch. */
async function readyMarkers(planRoot: string): Promise<readonly ReadyMarker[]> {
  const { stdout } = await execa("git", ["log", "--format=%H%x09%h%x09%s"], {
    cwd: planRoot,
  })
  const markers: ReadyMarker[] = []
  for (const line of stdout.split("\n")) {
    const [sha, short, subject] = line.split("\t", 3)
    const form = subject === undefined ? null : looseForm(subject)
    if (form?.role === "ready")
      markers.push({ sha, short, stem: form.stem, subject })
  }
  return markers
}

async function markerCoder(
  planRoot: string,
  sha: string,
): Promise<Coder | null> {
  const { stdout } = await execa("git", ["show", "-s", "--format=%b", sha], {
    cwd: planRoot,
  })
  return parseCoderRecord(stdout)
}
