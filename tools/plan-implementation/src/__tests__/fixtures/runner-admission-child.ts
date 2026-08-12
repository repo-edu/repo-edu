import { claimPlanImplementationRunnerAdmission } from "../../runner-admission.js"

const repoEduRoot = process.env.REPO_EDU_RUNNER_ADMISSION_TEST_ROOT
const mode = process.env.REPO_EDU_RUNNER_ADMISSION_TEST_MODE

if (!repoEduRoot || (mode !== "attempt" && mode !== "hold")) {
  throw new Error("The runner admission child requires a root and mode.")
}

const claim = await claimPlanImplementationRunnerAdmission(repoEduRoot)
process.stdout.write(
  `${JSON.stringify({ marker: "repo-edu-runner-admission-test", state: claim.status })}\n`,
)

if (claim.status === "held") {
  if (mode === "attempt") {
    claim.release()
  } else {
    process.stdin.resume()
  }
}
