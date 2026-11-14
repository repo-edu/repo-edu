import { realpath, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** One command-owned context, independent of any phase's workflow owner. */
export type ExecutionContext = {
  readonly repoEduRoot: string
  /** The plan checkout, where commands run and the archive and doctrine live. */
  readonly planRoot: string
  /** The plan checkout's `active/` folder, which holds every active plan and its briefs. */
  readonly activeRoot: string
  /** The private evidence checkout that keeps every round file. */
  readonly evidenceRoot: string
  /** The evidence checkout's `active/` folder, the round folder that holds every round file. */
  readonly roundRoot: string
}

/** The two plan folders a plan lookup reads: the active folder and the archive beneath the checkout. */
export type PlanRoots = Pick<ExecutionContext, "planRoot" | "activeRoot">

/** The two folders round data is read from: the round folder and the plan archive. */
export type RoundDataRoots = Pick<ExecutionContext, "planRoot" | "roundRoot">

export const installationRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
)

export async function executionContext(
  installedAt = installationRoot,
): Promise<ExecutionContext> {
  const repoEduRoot = await realpath(installedAt)
  const planRoot = await realpath(resolve(repoEduRoot, "../plan"))
  for (const repository of [repoEduRoot, planRoot]) {
    if (
      !(
        await stat(
          resolve(repository, ".agents/skills/audit/references/workflow.md"),
        )
      ).isFile()
    )
      throw new Error(`Missing audit workflow in ${repository}`)
  }
  if (!(await stat(resolve(repoEduRoot, "pnpm-workspace.yaml"))).isFile())
    throw new Error(`Missing Repo Edu workspace in ${repoEduRoot}`)
  const evidenceRoot = await realpath(resolve(repoEduRoot, "../plan-evidence"))
  const roundRoot = await realpath(resolve(evidenceRoot, "active"))
  return {
    repoEduRoot,
    planRoot,
    activeRoot: resolve(planRoot, "active"),
    evidenceRoot,
    roundRoot,
  }
}

/**
 * The checkouts a session may read and change besides its working one: the
 * peer checkout under the phase's authority and the evidence checkout where it
 * writes its round files.
 */
export function additionalDirectories(
  context: Pick<
    ExecutionContext,
    "repoEduRoot" | "planRoot" | "evidenceRoot"
  > & {
    readonly cwd: string
  },
): readonly string[] {
  return [
    context.cwd === context.planRoot ? context.repoEduRoot : context.planRoot,
    context.evidenceRoot,
  ]
}
