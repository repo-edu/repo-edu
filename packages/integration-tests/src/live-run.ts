import { run } from "node:test"
import { spec } from "node:test/reporters"
import { fileURLToPath } from "node:url"
import { selectedGitProviders } from "./git-provider-harness.js"
import { githubLiveRunMutationsSent } from "./github-request-admission.js"
import { removeRunFixtures, seedRunFixtures } from "./run-fixture.js"

/** The live suite's entry. It seeds the run fixture, runs the five live test
 * files in this process so they share that fixture and one GitHub admission
 * owner, removes the fixture and reports the GitHub write count. */
const liveTestFiles = [
  "create-clone-operations.test.ts",
  "update-username-operations.test.ts",
  "repo-create.test.ts",
  "repo-clone.test.ts",
  "repo-discover.test.ts",
]

async function runLiveTestFiles(): Promise<boolean> {
  const stream = run({
    files: liveTestFiles.map((file) =>
      fileURLToPath(new URL(`./${file}`, import.meta.url)),
    ),
    isolation: "none",
  })
  let failed = false
  stream.on("test:fail", () => {
    failed = true
  })
  stream.compose(spec).pipe(process.stdout)
  await new Promise<void>((resolve) => stream.on("end", resolve))
  return failed
}

try {
  await seedRunFixtures()
  try {
    if (await runLiveTestFiles()) {
      process.exitCode = 1
    }
  } finally {
    await removeRunFixtures()
  }
} finally {
  if (selectedGitProviders().includes("github")) {
    console.log(
      `GitHub live run sent ${githubLiveRunMutationsSent()} mutating requests.`,
    )
  }
}
