import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { selectTarget } from "../default-target.js"
import type { LogCommit } from "../episode-log.js"
import type { Repository } from "../subject.js"
import { type AuditTarget, planStem } from "../target.js"

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

const named = { plan: "example", scope: null }

/** Both repos host a step and carry their markers, and plan rounds followed. */
const implemented = logs(
  ["plan", 1, "example/ready abx: ready"],
  ["plan", 2, "example/impl-1 obx docs(audit): step"],
  ["repo-edu", 3, "example/impl-2 obx feat(x): step"],
  ["plan", 4, "example/implemented obx: plan share"],
  ["repo-edu", 5, "example/implemented obx: Repo Edu share"],
  ["plan", 6, "example/plan-audit abx clean: plan round after the steps"],
)

test("the plan's history selects what its name or no target audits", async (t) => {
  const root = await planRoot(t)
  const cases: [
    Record<Repository, LogCommit[]>,
    Extract<AuditTarget, { plan: string }>,
  ][] = [
    [
      logs(
        ["plan", 1, "example/init ath: start"],
        ["repo-edu", 2, "oth growth-none c1 fix(x): unstemmed and newer"],
      ),
      { roundKind: "planning", plan: join(root, "example.md") },
    ],
    [
      logs(
        ["plan", 1, "example/init ath: start"],
        ["plan", 3, "archived/closed ath: archived and newest"],
        ["plan", 2, "widened/plan-audit oth growth-none B1: widening round"],
      ),
      { roundKind: "planning", plan: join(root, "widened-widen.md") },
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
      {
        roundKind: "implementation",
        plan: join(root, "example.md"),
        scope: "3-4",
      },
    ],
    [
      logs(
        ["repo-edu", 1, "example/impl-1 oth feat(x): step"],
        ["repo-edu", 2, "example/implemented oth: marker"],
        ["repo-edu", 3, "example/impl-audit-1 ath growth-none c1 fix(x): x"],
      ),
      {
        roundKind: "implementation",
        plan: join(root, "example.md"),
        scope: "1",
      },
    ],
    [
      implemented,
      {
        roundKind: "implementation",
        plan: join(root, "example.md"),
        scope: "all",
      },
    ],
    [
      logs(
        ["repo-edu", 1, "example/impl-1 oth feat(x): step"],
        ["repo-edu", 2, "example/implemented oth: marker"],
        ["repo-edu", 3, "example/impl-audit-all oth clean: clean record"],
      ),
      {
        roundKind: "implementation",
        plan: join(root, "example.md"),
        scope: "all",
      },
    ],
  ]
  for (const [history, expected] of cases) {
    assert.deepEqual(await selectTarget(history, root, null), expected)
    assert.deepEqual(
      await selectTarget(history, root, {
        plan: planStem(expected.plan),
        scope: null,
      }),
      expected,
    )
  }
})

test("a named scope audits implementation once a step has landed", async (t) => {
  const root = await planRoot(t)
  assert.deepEqual(
    await selectTarget(implemented, root, { plan: "example", scope: "2" }),
    { roundKind: "implementation", plan: join(root, "example.md"), scope: "2" },
  )
  await assert.rejects(
    selectTarget(logs(["plan", 1, "example/ready oth: ready"]), root, {
      plan: "example",
      scope: "all",
    }),
    /No step of example has landed/,
  )
})

test("a plan between its steps and markers stops with its reason", async (t) => {
  const root = await planRoot(t)
  const cases: [Record<Repository, LogCommit[]>, RegExp][] = [
    [
      logs(
        ["repo-edu", 1, "example/impl-1 oth feat(x): step"],
        ["repo-edu", 2, "example/impl-2 oth feat(x): step"],
        ["repo-edu", 3, "example/impl-audit-1-2 oth clean: clean record"],
      ),
      /Landed steps: 1, 2\. The implemented marker is missing in Repo Edu\. Name a step scope, such as example 2/,
    ],
    [
      logs(
        ["plan", 1, "example/impl-1 obx docs(audit): step"],
        ["repo-edu", 2, "example/impl-2 obx feat(x): step"],
        ["repo-edu", 3, "example/implemented obx: Repo Edu share"],
      ),
      /missing in the plan repo/,
    ],
    [
      logs(
        ["repo-edu", 1, "example/impl-1 oth feat(x): step"],
        ["repo-edu", 2, "example/impl-audit-1 oth: no severity"],
      ),
      /does not parse/,
    ],
  ]
  for (const [history, reason] of cases) {
    await assert.rejects(selectTarget(history, root, null), reason)
    await assert.rejects(selectTarget(history, root, named), reason)
  }
  await assert.rejects(
    selectTarget(
      logs(["plan", 1, "archived/init ath: archived only"]),
      root,
      null,
    ),
    /No active plan/,
  )
})
