import { realpath, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type RoundKind = "planning" | "implementation"

/** One command-owned context, independent of any phase's workflow owner. */
export type ExecutionContext = {
  readonly cwd: string
  readonly repoEduRoot: string
  readonly planRoot: string
  readonly roundKind: RoundKind
}

export const installationRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
)

export async function executionContext(
  cwd: string,
  installedAt = installationRoot,
): Promise<ExecutionContext> {
  const repoEduRoot = await realpath(installedAt)
  const planRoot = await realpath(resolve(repoEduRoot, "../plan"))
  const root = await realpath(cwd)
  if (root !== repoEduRoot && root !== planRoot)
    throw new Error(
      "Run pnpm audit-round from the Repo Edu or sibling plan checkout root.",
    )
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
  return {
    cwd: root,
    repoEduRoot,
    planRoot,
    roundKind: root === planRoot ? "planning" : "implementation",
  }
}

/** Both assistants can read and change the peer checkout under the phase's authority. */
export function peerRoot(context: ExecutionContext): string {
  return context.cwd === context.planRoot
    ? context.repoEduRoot
    : context.planRoot
}
