import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { selectTarget } from "../default-target.js"
import type { LogCommit } from "../episode-log.js"
import type { Repository } from "../subject.js"

async function planRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "default-target-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const name of ["example.md", "widened-widen.md"])
    await writeFile(join(root, name), "# Plan\n")
  return root
}

/** Each commit names its repository and its commit time. */
function logs(
  ...commits: readonly [Repository, number, string][]
): Record<Repository, LogCommit[]> {
  const read = (repository: Repository) =>
    commits
      .filter(([owner]) => owner === repository)
      .map(([, committedAt, subject], at) => ({
        sha: `${repository}${at}`.padEnd(40, "0"),
        committedAt,
        subject,
        body: "",
        files: [],
        renames: [],
      }))
      .sort((first, second) => second.committedAt - first.committedAt)
  return { plan: read("plan"), "repo-edu": read("repo-edu") }
}

test("the newest stem commit of an active plan selects the repeated target", async (t) => {
  const root = await planRoot(t)
  const cases: [Record<Repository, LogCommit[]>, unknown][] = [
    [
      logs(
        ["plan", 1, "example/init ath: start"],
        ["repo-edu", 2, "oth growth-none c1 fix(x): unstemmed and newer"],
      ),
      { roundKind: "planning", plan: "example" },
    ],
    [
      logs(
        ["plan", 1, "example/init ath: start"],
        ["plan", 3, "archived/closed ath: archived and newest"],
        ["plan", 2, "widened/audit oth growth-none B1: widening round"],
      ),
      { roundKind: "planning", plan: "widened" },
    ],
    [
      logs(["plan", 1, "plan-example/ready oth: historical stem"]),
      { roundKind: "planning", plan: "example" },
    ],
    [
      logs(
        ["plan", 1, "example/ready oth: ready"],
        ["repo-edu", 2, "example/impl-3 oth feat(x): step"],
        [
          "repo-edu",
          3,
          "example/impl-audit-3-4 ath growth-none c1 fix(x): fix",
        ],
      ),
      { roundKind: "implementation", plan: "example", scope: "3-4" },
    ],
    [
      logs(
        ["repo-edu", 1, "example/impl-audit-all ath growth-none c1 fix(x): x"],
        ["plan", 2, "example/impl-audit-all ath B1: deferral record"],
      ),
      { roundKind: "implementation", plan: "example", scope: "all" },
    ],
  ]
  for (const [history, expected] of cases)
    assert.deepEqual(await selectTarget(history, root), expected)
})

test("any other newest commit stops with its reason", async (t) => {
  const root = await planRoot(t)
  const cases: [Record<Repository, LogCommit[]>, RegExp][] = [
    [
      logs(
        ["repo-edu", 1, "example/impl-audit-1-2 ath growth-none c1 fix(x): x"],
        ["repo-edu", 2, "example/impl-audit-1-2 oth clean: clean record"],
      ),
      /example: its last audit of 1-2 was clean/,
    ],
    [logs(["repo-edu", 1, "example/impl-4 oth feat(x): step"]), /lands step 4/],
    [
      logs(["repo-edu", 1, "example/implemented oth: marker"]),
      /the implemented marker/,
    ],
    [logs(["repo-edu", 1, "example/init ath: plan role"]), /does not parse/],
    [logs(["plan", 1, "archived/init ath: archived only"]), /No active plan/],
  ]
  for (const [history, reason] of cases)
    await assert.rejects(selectTarget(history, root), reason)
})
