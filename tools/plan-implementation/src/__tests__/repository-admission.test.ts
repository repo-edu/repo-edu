import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { promisify } from "node:util"
import {
  admitOutsideWork,
  admitOwnedRepositoryDiff,
  commitAdmittedRepositoryDiff,
  commitPlanImplementationMarker,
  openRepositoryAdmission,
  requireAdmittedRepositoryDiff,
  stageAdmittedRepositoryDiff,
} from "../repository-admission.js"

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set<string>()
const testSource = {
  planName: "example",
  planPath: "/plans/example.md",
  commitOid: "a".repeat(40),
  blobOid: "b".repeat(40),
}
const testProposal = {
  subject: "A1 redesign(plan-implementation): admit repository truth",
  decisionBullets: [
    "One exact path set enters the runner-owned commit after every independent gate passes.",
  ],
}

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
    const committed = await commitAdmittedRepositoryDiff(
      admission,
      diff,
      testSource,
      7,
      testProposal,
    )

    assert.equal(
      committed.commitOid,
      (await git(root, ["rev-parse", "HEAD"])).stdout.trim(),
    )
    assert.equal((await git(root, ["status", "--porcelain"])).stdout, "")
    assert.equal(committed.nextAdmission.headOid, committed.commitOid)
    const { stdout: subjectAndBody } = await git(root, [
      "show",
      "-s",
      "--format=%s%n%b",
      "HEAD",
    ])
    assert.match(
      subjectAndBody,
      /example\/step-7-A1: redesign\(plan-implementation\): admit repository truth[\s\S]*Plan-Source-Blob: b{40}/,
    )
  })

  it("writes one exact empty implemented marker", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)

    const committed = await commitPlanImplementationMarker(
      admission,
      testSource,
    )

    assert.equal(
      (await git(root, ["show", "-s", "--format=%s", "HEAD"])).stdout.trim(),
      "example/implemented: Repo Edu steps have landed",
    )
    assert.equal(
      (await git(root, ["diff-tree", "--name-only", "-r", "HEAD"])).stdout,
      "",
    )
    assert.equal(committed.nextAdmission.headOid, committed.commitOid)
    assert.equal((await git(root, ["status", "--porcelain"])).stdout, "")
  })

  it("admits outside work", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)
    await writeFile(join(root, "README.md"), "active step\n")
    await writeFile(join(root, "outside-work.txt"), "outside work\n")
    await git(root, ["add", "--", "outside-work.txt"])
    await git(root, ["commit", "--quiet", "-m", "outside work"])

    const outsideWork = await admitOutsideWork(admission)

    assert.equal(outsideWork.outsideWorkFound, true)
    assert.deepEqual(outsideWork.outsideWorkPaths, ["outside-work.txt"])
    assert.equal(outsideWork.outsideWorkDependencyManifestChanged, false)
    assert.equal(
      outsideWork.admission.headOid,
      (await git(root, ["rev-parse", "HEAD"])).stdout.trim(),
    )
    assert.deepEqual(
      (await admitOwnedRepositoryDiff(outsideWork.admission)).paths,
      ["README.md"],
    )
  })

  it("rejects outside work that overlaps the active step", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)
    await writeFile(join(root, "README.md"), "outside work\n")
    await git(root, ["add", "--", "README.md"])
    await writeFile(join(root, "README.md"), "active step\n")
    await git(root, ["commit", "--quiet", "-m", "outside work"])

    await assert.rejects(
      admitOutsideWork(admission),
      /Outside work overlaps the active step: README\.md/,
    )
  })

  it("rejects branch, rewritten HEAD and index changes", async () => {
    for (const mutate of [
      async (root: string) => {
        await writeFile(join(root, "staged.txt"), "staged\n")
        await git(root, ["add", "--", "staged.txt"])
      },
      async (root: string) => {
        await git(root, ["switch", "--quiet", "-c", "other"])
      },
      async (root: string) => {
        await git(root, [
          "commit",
          "--quiet",
          "--amend",
          "--allow-empty",
          "-m",
          "rewritten",
        ])
      },
      async (root: string) => {
        await git(root, ["update-index", "--assume-unchanged", "README.md"])
      },
    ]) {
      const root = await createRepository()
      const admission = await openRepositoryAdmission(root)
      await mutate(root)
      await assert.rejects(
        admitOutsideWork(admission),
        /changed (the current branch|the Git index)|does not advance/,
      )
    }
  })

  it("rejects outside work after staging starts", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)
    await writeFile(join(root, "README.md"), "active step\n")
    const diff = await admitOwnedRepositoryDiff(admission)
    await writeFile(join(root, "outside-work.txt"), "outside work\n")
    await git(root, ["add", "--", "outside-work.txt"])
    await git(root, ["commit", "--quiet", "-m", "outside work"])

    await assert.rejects(
      stageAdmittedRepositoryDiff(admission, diff),
      /HEAD changed after repository admission/,
    )
  })

  it("rejects paths that enter or leave after admission", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)
    await writeFile(join(root, "README.md"), "changed\n")
    const diff = await admitOwnedRepositoryDiff(admission)
    await writeFile(join(root, "late.txt"), "late change\n")

    await assert.rejects(
      requireAdmittedRepositoryDiff(admission, diff),
      /path set changed after repository admission/,
    )
  })

  it("does not start a commit after a stop request", async () => {
    const root = await createRepository()
    const admission = await openRepositoryAdmission(root)
    await writeFile(join(root, "stopped.txt"), "inspect me\n")
    const diff = await admitOwnedRepositoryDiff(admission)
    await stageAdmittedRepositoryDiff(admission, diff)
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      commitAdmittedRepositoryDiff(
        admission,
        diff,
        testSource,
        1,
        testProposal,
        controller.signal,
      ),
      /stop request prevented.*commit from starting/,
    )

    assert.equal(
      (await git(root, ["log", "-1", "--format=%s"])).stdout.trim(),
      "initial",
    )
    assert.equal(
      (await git(root, ["diff", "--cached", "--name-only"])).stdout.trim(),
      "stopped.txt",
    )
  })
})
