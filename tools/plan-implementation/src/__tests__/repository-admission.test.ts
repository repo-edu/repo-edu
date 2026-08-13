import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { promisify } from "node:util"
import {
  admitOwnedRepositoryDiff,
  commitAdmittedRepositoryDiff,
  openRepositoryAdmission,
  requireAdmittedRepositoryDiff,
  requireCodingRepositoryControl,
  stageAdmittedRepositoryDiff,
} from "../repository-admission.js"

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set<string>()

async function git(root: string, arguments_: readonly string[]) {
  return await execFileAsync("git", [...arguments_], {
    cwd: root,
    encoding: "utf8",
  })
}

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-admission-test-"))
  temporaryRoots.add(root)
  await git(root, ["init", "--quiet"])
  await git(root, ["config", "user.name", "Repository Admission Test"])
  await git(root, ["config", "user.email", "admission@example.invalid"])
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

describe("repository admission", () => {
  it("admits, stages and commits the complete exact path set", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)
    await writeFile(join(root, "README.md"), "changed\n")
    await mkdir(join(root, "packages", "example"), { recursive: true })
    await writeFile(
      join(root, "packages", "example", "package.json"),
      '{"name":"example"}\n',
    )

    const diff = await admitOwnedRepositoryDiff(admission)
    assert.deepEqual(diff.paths, ["README.md", "packages/example/package.json"])
    assert.equal(diff.dependencyManifestChanged, true)

    await stageAdmittedRepositoryDiff(admission, diff)
    const source = {
      planName: "example",
      planPath: "/plans/plan-example.md",
      commitOid: "a".repeat(40),
      blobOid: "b".repeat(40),
    }
    const committed = await commitAdmittedRepositoryDiff(
      admission,
      diff,
      source,
      7,
      {
        subject: "A1 redesign(plan-implementation): admit repository truth",
        decisionBullets: [
          "One exact path set enters the runner-owned commit after every independent gate passes.",
        ],
      },
    )

    assert.equal(
      committed.commitOid,
      (await git(root, ["rev-parse", "HEAD"])).stdout.trim(),
    )
    assert.equal((await git(root, ["status", "--porcelain"])).stdout, "")
    assert.equal(committed.nextAdmission.headOid, committed.commitOid)
    assert.match(
      (await git(root, ["show", "-s", "--format=%b", "HEAD"])).stdout,
      /Plan-Step: 7[\s\S]*Plan-Source-Blob: b{40}/,
    )
  })

  it("rejects forbidden HEAD, branch and index writes", async () => {
    for (const mutate of [
      async (root: string) => {
        await writeFile(join(root, "staged.txt"), "staged\n")
        await git(root, ["add", "--", "staged.txt"])
      },
      async (root: string) => {
        await git(root, ["switch", "--quiet", "-c", "other"])
      },
      async (root: string) => {
        await git(root, ["commit", "--quiet", "--allow-empty", "-m", "outside"])
      },
      async (root: string) => {
        await git(root, ["update-index", "--assume-unchanged", "README.md"])
      },
    ]) {
      const root = await createRepository()
      const admission = await openRepositoryAdmission(root)
      await mutate(root)
      await assert.rejects(
        requireCodingRepositoryControl(admission),
        /changed (HEAD|the current branch|the Git index)/,
      )
    }
  })

  it("rejects paths that enter or leave after admission", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)
    await writeFile(join(root, "README.md"), "changed\n")
    const diff = await admitOwnedRepositoryDiff(admission)
    await writeFile(join(root, "outside.txt"), "outside\n")

    await assert.rejects(
      requireAdmittedRepositoryDiff(admission, diff),
      /path set changed after repository admission/,
    )
  })
})
