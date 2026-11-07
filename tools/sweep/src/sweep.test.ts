import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { describe, it } from "node:test"

import { markPlanDone } from "./sweep.js"
import {
  type FlagEntry,
  parseFlagEntries,
  REFACTOR_BACKLOG_REPO_PATH,
  readFlagEntries,
  writeFlagEntries,
} from "./sweep-store.js"

const PLAN_STEM = "backlog-close"
const PLAN_REASON = `planned in ${PLAN_STEM}`

describe("plan-scoped done", () => {
  it("stages only the committed plan rows beside unrelated working changes", () => {
    const root = createRepository([
      entry("packages/example/src/plan.ts", PLAN_REASON, 900),
      entry("packages/example/src/retained.ts", "split shared owner", 700),
    ])
    try {
      writeWorkingEntries(root, [
        entry("packages/example/src/plan.ts", PLAN_REASON, 900),
        entry("packages/example/src/retained.ts", "updated reason", 710),
        entry("packages/example/src/working-only.ts", "new flag", 500),
      ])

      const result = markPlanDone(PLAN_STEM, root)

      assert.deepEqual(result, {
        droppedPaths: ["packages/example/src/plan.ts"],
        stagedDeletion: true,
      })
      assert.deepEqual(readWorkingEntries(root), [
        entry("packages/example/src/retained.ts", "updated reason", 710),
        entry("packages/example/src/working-only.ts", "new flag", 500),
      ])
      assert.deepEqual(readIndexEntries(root), [
        entry("packages/example/src/retained.ts", "split shared owner", 700),
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("drops a plan row that exists only in the working backlog", () => {
    const retained = entry(
      "packages/example/src/retained.ts",
      "split shared owner",
      700,
    )
    const root = createRepository([retained])
    try {
      writeWorkingEntries(root, [
        entry("packages/example/src/plan.ts", PLAN_REASON, 900),
        retained,
      ])

      const result = markPlanDone(PLAN_STEM, root)

      assert.deepEqual(result, {
        droppedPaths: ["packages/example/src/plan.ts"],
        stagedDeletion: false,
      })
      assert.deepEqual(readWorkingEntries(root), [retained])
      assert.deepEqual(readIndexEntries(root), [retained])
      assert.equal(runGit(root, ["diff", "--cached", "--name-only"]), "")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("leaves working rows and the index unchanged when no plan row matches", () => {
    const retained = entry(
      "packages/example/src/retained.ts",
      "split shared owner",
      700,
    )
    const workingOnly = entry(
      "packages/example/src/working-only.ts",
      "new flag",
      500,
    )
    const root = createRepository([retained])
    try {
      writeWorkingEntries(root, [retained, workingOnly])

      const result = markPlanDone(PLAN_STEM, root)

      assert.deepEqual(result, { droppedPaths: [], stagedDeletion: false })
      assert.deepEqual(readWorkingEntries(root), [retained, workingOnly])
      assert.deepEqual(readIndexEntries(root), [retained])
      assert.equal(runGit(root, ["diff", "--cached", "--name-only"]), "")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

function createRepository(headEntries: readonly FlagEntry[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "repo-edu-sweep-"))
  mkdirSync(path.dirname(backlogFile(root)), { recursive: true })
  runGit(root, ["init", "--quiet"])
  writeWorkingEntries(root, headEntries)
  runGit(root, ["add", "--", REFACTOR_BACKLOG_REPO_PATH])
  runGit(root, [
    "-c",
    "user.name=Sweep Test",
    "-c",
    "user.email=sweep@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ])
  return root
}

function entry(pathname: string, reason: string, lines: number): FlagEntry {
  return {
    lines,
    path: pathname,
    reason,
    hash: pathname
      .replaceAll(/[^a-f]/gu, "a")
      .slice(0, 40)
      .padEnd(40, "a"),
  }
}

function backlogFile(root: string): string {
  return path.join(root, REFACTOR_BACKLOG_REPO_PATH)
}

function writeWorkingEntries(
  root: string,
  entries: readonly FlagEntry[],
): void {
  writeFlagEntries(entries, backlogFile(root))
}

function readWorkingEntries(root: string): FlagEntry[] {
  return readFlagEntries(backlogFile(root))
}

function readIndexEntries(root: string): FlagEntry[] {
  const content = runGit(root, ["show", `:${REFACTOR_BACKLOG_REPO_PATH}`])
  return parseFlagEntries(content)
}

function runGit(root: string, args: readonly string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trimEnd()
}
