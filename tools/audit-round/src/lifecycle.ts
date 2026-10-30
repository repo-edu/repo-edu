import { readFile } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { execa } from "execa"
import type { CommitStamps } from "./commit-msg.js"
import type { ExecutionContext } from "./context.js"
import { readPlanSteps } from "./plan-steps.js"
import { markerPath } from "./round-paths.js"
import { claimRound } from "./run-files.js"
import { looseForm } from "./subject.js"
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
): Promise<LifecycleCommit> {
  const name = basename(plan)
  if (name.endsWith("-widen.md"))
    throw new Error(`Cannot declare ${name} ready while it is still widening.`)
  await requireCommittedPlan(context.planRoot, plan)
  readPlanSteps(await readFile(plan, "utf8"))

  const stem = planStem(plan)
  const existing = await findMarker(context.planRoot, stem, "ready")
  if (existing !== undefined)
    throw new Error(`${name} already has ready marker ${existing}.`)

  return commitOnly({
    cwd: context.planRoot,
    subject: `${stem}/ready: declare the plan ready for implementation`,
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
  const { stdout } = await execa("git", ["log", "--format=%h%x09%s"], {
    cwd: planRoot,
  })
  return stdout.split("\n").find((line) => {
    const separator = line.indexOf("\t")
    const form = separator === -1 ? null : looseForm(line.slice(separator + 1))
    return form?.stem === stem && form.role === role
  })
}
