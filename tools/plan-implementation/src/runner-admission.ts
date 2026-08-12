import { execFile } from "node:child_process"
import { isAbsolute } from "node:path"
import { promisify } from "node:util"
import {
  claimExclusive,
  type ExclusiveClaim,
} from "@repo-edu/host-node/exclusive-claim"

const execFileAsync = promisify(execFile)
const runnerAdmissionGitPath = "repo-edu/plan-implementation/admission.db"

async function resolveRunnerAdmissionDatabase(
  repoEduRoot: string,
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      runnerAdmissionGitPath,
    ],
    {
      cwd: repoEduRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  )
  const databasePath = stdout.replace(/\r?\n$/, "")
  if (!isAbsolute(databasePath)) {
    throw new Error("Git did not return an absolute runner admission path.")
  }
  return databasePath
}

export type PlanImplementationRunnerAdmission = ExclusiveClaim

export async function claimPlanImplementationRunnerAdmission(
  repoEduRoot: string,
): Promise<PlanImplementationRunnerAdmission> {
  const databasePath = await resolveRunnerAdmissionDatabase(repoEduRoot)
  return await claimExclusive(databasePath)
}
