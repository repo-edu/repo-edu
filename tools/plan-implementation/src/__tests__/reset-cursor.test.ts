import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { promisify } from "node:util"
import { resolvePlanCursor } from "../git-cursor.js"
import { readCommittedImplementationPlan } from "../plan-reader.js"
import { resetPlanCursor } from "../reset-cursor.js"
import { claimPlanImplementationRunnerAdmission } from "../runner-admission.js"

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set<string>()

const planMarkdown = `# Example

## Implementation plan

1. **First step.** Make the first change.

2. **Second step.** Make the second change.
`

async function git(root: string, arguments_: readonly string[]) {
  return await execFileAsync("git", [...arguments_], {
    cwd: root,
    encoding: "utf8",
  })
}

async function createGitRepository(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.add(root)
  await git(root, ["init", "--quiet"])
  await git(root, ["config", "user.name", "Cursor Reset Test"])
  await git(root, ["config", "user.email", "reset@example.invalid"])
  return root
}

async function createPlan(): Promise<string> {
  const root = await createGitRepository("repo-edu-reset-plan-test-")
  const plans = join(root, "plans")
  await mkdir(plans)
  const planPath = join(plans, "plan-example.md")
  await writeFile(planPath, planMarkdown)
  await git(root, ["add", "--", "plans/plan-example.md"])
  await git(root, ["commit", "--quiet", "-m", "add plan"])
  return planPath
}

async function createRepoEdu(): Promise<string> {
  const root = await createGitRepository("repo-edu-reset-code-test-")
  await writeFile(join(root, "README.md"), "clean\n")
  await git(root, ["add", "--", "README.md"])
  await git(root, ["commit", "--quiet", "-m", "initial"])
  return root
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  )
  temporaryRoots.clear()
})

describe("resetPlanCursor", () => {
  it("owns one exact empty current-branch reset commit", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const { stdout: parentOid } = await git(repoEduRoot, ["rev-parse", "HEAD"])
    const { stdout: branchBefore } = await git(repoEduRoot, [
      "branch",
      "--show-current",
    ])

    const result = await resetPlanCursor({
      repoEduRoot,
      planPath,
      nextStep: 3,
    })

    const { stdout: subject } = await git(repoEduRoot, [
      "show",
      "-s",
      "--format=%s",
      "HEAD",
    ])
    const { stdout: body } = await git(repoEduRoot, [
      "show",
      "-s",
      "--format=format:%b",
      "HEAD",
    ])
    const { stdout: parentAfter } = await git(repoEduRoot, [
      "rev-parse",
      "HEAD^",
    ])
    const { stdout: branchAfter } = await git(repoEduRoot, [
      "branch",
      "--show-current",
    ])
    const { stdout: changedPaths } = await git(repoEduRoot, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "HEAD",
    ])
    const { stdout: status } = await git(repoEduRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ])

    assert.equal(
      result.commitOid,
      (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout.trim(),
    )
    assert.equal(subject.trim(), "example/reset-3: reset cursor to step 3")
    assert.equal(
      body,
      `Plan-Source-Commit: ${result.source.commitOid}
Plan-Source-Blob: ${result.source.blobOid}
`,
    )
    assert.equal(parentAfter.trim(), parentOid.trim())
    assert.equal(branchAfter, branchBefore)
    assert.equal(changedPaths, "")
    assert.equal(status, "")
    await assert.rejects(
      readdir(
        join(
          repoEduRoot,
          ".git",
          "repo-edu",
          "plan-implementation",
          "transcripts",
        ),
      ),
      { code: "ENOENT" },
    )

    const plan = await readCommittedImplementationPlan(planPath)
    assert.deepEqual(await resolvePlanCursor(repoEduRoot, plan), {
      nextStep: 3,
      resetCommitOid: result.commitOid,
      stepCommitOids: [],
      completionCommitOid: null,
    })
  })

  it("refuses staged, unstaged and untracked files without committing", async () => {
    const planPath = await createPlan()
    const cases = [
      async (root: string) => {
        await writeFile(join(root, "untracked.txt"), "new\n")
      },
      async (root: string) => {
        await writeFile(join(root, "staged.txt"), "new\n")
        await git(root, ["add", "--", "staged.txt"])
      },
      async (root: string) => {
        await writeFile(join(root, "README.md"), "changed\n")
      },
    ]

    for (const makeDirty of cases) {
      const repoEduRoot = await createRepoEdu()
      const { stdout: headBefore } = await git(repoEduRoot, [
        "rev-parse",
        "HEAD",
      ])
      await makeDirty(repoEduRoot)
      await assert.rejects(
        resetPlanCursor({ repoEduRoot, planPath, nextStep: 1 }),
        /requires no staged, unstaged or untracked files/,
      )
      assert.equal(
        (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout,
        headBefore,
      )
    }
  })

  it("accepts only step 1 through one past the final step", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()

    for (const nextStep of [0, 4]) {
      await assert.rejects(
        resetPlanCursor({ repoEduRoot, planPath, nextStep }),
        /reset step must be from 1 through 3/,
      )
    }
  })

  it("cannot commit while another runner owns admission", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const { stdout: headBefore } = await git(repoEduRoot, ["rev-parse", "HEAD"])
    const admission = await claimPlanImplementationRunnerAdmission(repoEduRoot)
    assert.equal(admission.status, "held")
    try {
      await assert.rejects(
        resetPlanCursor({ repoEduRoot, planPath, nextStep: 1 }),
        /Another plan implementation runner owns this checkout/,
      )
      assert.equal(
        (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout,
        headBefore,
      )
    } finally {
      if (admission.status === "held") {
        admission.release()
      }
    }
  })
})
