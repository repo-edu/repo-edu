import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { InvalidArgumentError } from "commander"
import { selectTarget } from "../default-target.js"
import type { LogCommit } from "../episode-log.js"
import type { Repository } from "../subject.js"
import { type AuditTarget, planStem } from "../target.js"

async function planRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "default-target-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(
    join(root, "example.md"),
    `# Plan

## Implementation plan

1. **First Repo Edu step.** Hosted in Repo Edu.
2. **Second Repo Edu step.** Hosted in Repo Edu.
3. **Plan step.** Hosted in the plan repo.
`,
  )
  for (const name of ["one.md", "widened-widen.md"])
    await writeFile(
      join(root, name),
      `# Plan

## Implementation plan

1. **Only step.** Hosted in Repo Edu.
`,
    )
  await writeFile(
    join(root, "unstructured-widen.md"),
    `# Plan

The shape is still open, so no implementation steps exist yet.
`,
  )
  await writeFile(
    join(root, "malformed.md"),
    `# Plan

## Implementation plan

1. **Title without a full stop** Hosted in Repo Edu.
`,
  )
  return root
}

/** Each repository's commits are supplied oldest first and returned in Git order. */
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
      .reverse()
  return { plan: read("plan"), "repo-edu": read("repo-edu") }
}

const named = { plan: "example", scope: null }

/** Every listed share has landed and both markers follow their hosted steps. */
const implemented = logs(
  ["plan", 1, "example/ready: ready"],
  ["repo-edu", 2, "example/impl-1 obx feat(x): step"],
  ["repo-edu", 3, "example/impl-2 obx feat(x): step"],
  ["plan", 4, "example/impl-3 obx docs(audit): step"],
  ["repo-edu", 5, "example/implemented obx: Repo Edu share"],
  ["plan", 6, "example/implemented obx: plan share"],
  [
    "repo-edu",
    7,
    "example/impl-audit-2 ath growth-none c1 fix(x): newest unfinished record",
  ],
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
      logs(["plan", 1, "unstructured/init ath: start"]),
      { roundKind: "planning", plan: join(root, "unstructured-widen.md") },
    ],
    [
      implemented,
      {
        roundKind: "implementation",
        plan: join(root, "example.md"),
        scope: "1-3",
      },
    ],
    [
      logs(
        ["repo-edu", 1, "one/impl-1 oth feat(x): step"],
        ["repo-edu", 2, "one/implemented oth: marker"],
      ),
      {
        roundKind: "implementation",
        plan: join(root, "one.md"),
        scope: "1",
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

test("a named step or range audits implementation once a step has landed", async (t) => {
  const root = await planRoot(t)
  assert.deepEqual(
    await selectTarget(implemented, root, { plan: "example", scope: "1-2" }),
    {
      roundKind: "implementation",
      plan: join(root, "example.md"),
      scope: "1-2",
    },
  )
  assert.deepEqual(
    await selectTarget(
      logs(["repo-edu", 1, "malformed/impl-1 obx feat(x): step"]),
      root,
      { plan: "malformed", scope: "1" },
    ),
    {
      roundKind: "implementation",
      plan: join(root, "malformed.md"),
      scope: "1",
    },
  )
  await assert.rejects(
    selectTarget(logs(["plan", 1, "example/ready: ready"]), root, {
      plan: "example",
      scope: "1",
    }),
    /No step of example has landed/,
  )
})

test("marker freshness follows Git order when commit dates disagree", async (t) => {
  const root = await planRoot(t)
  assert.deepEqual(
    await selectTarget(
      logs(
        ["repo-edu", 40, "example/impl-1 obx feat(x): first step"],
        ["repo-edu", 30, "example/impl-2 obx feat(x): second step"],
        ["repo-edu", 10, "example/implemented obx: current marker"],
        ["plan", 20, "example/impl-3 obx docs(audit): plan step"],
        ["plan", 50, "example/implemented obx: plan marker"],
      ),
      root,
      named,
    ),
    {
      roundKind: "implementation",
      plan: join(root, "example.md"),
      scope: "1-3",
    },
  )
  await assert.rejects(
    selectTarget(
      logs(
        ["repo-edu", 90, "example/implemented obx: stale marker"],
        ["repo-edu", 40, "example/impl-1 obx feat(x): first step"],
        ["repo-edu", 30, "example/impl-2 obx feat(x): second step"],
        ["plan", 20, "example/impl-3 obx docs(audit): plan step"],
        ["plan", 50, "example/implemented obx: plan marker"],
      ),
      root,
      named,
    ),
    /implemented marker is stale in Repo Edu/,
  )
})

test("a plan between its listed steps and current markers stops with its reason", async (t) => {
  const root = await planRoot(t)
  const cases: [Record<Repository, LogCommit[]>, RegExp][] = [
    [
      logs(
        ["repo-edu", 1, "example/impl-1 oth feat(x): step"],
        ["repo-edu", 2, "example/impl-2 oth feat(x): step"],
        ["repo-edu", 3, "example/implemented oth: marker"],
      ),
      /Pending steps in the plan repo: 3\. The implemented marker is missing in the plan repo/,
    ],
    [
      logs(
        ["repo-edu", 1, "example/impl-1 obx feat(x): first step"],
        ["repo-edu", 2, "example/implemented obx: old marker"],
        ["repo-edu", 3, "example/impl-2 obx feat(x): later step"],
        ["plan", 4, "example/impl-3 obx docs(audit): plan step"],
        ["plan", 5, "example/implemented obx: plan marker"],
      ),
      /implemented marker is stale in Repo Edu/,
    ],
    [
      logs(
        ["repo-edu", 1, "example/impl-1 obx feat(x): first step"],
        ["repo-edu", 2, "example/impl-2 obx feat(x): second step"],
        ["plan", 3, "example/impl-3 obx docs(audit): plan step"],
      ),
      /implemented marker is missing in Repo Edu\. The implemented marker is missing in the plan repo/,
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

test("an unfinished plan omits the scope example when no listed step has landed", async (t) => {
  const root = await planRoot(t)
  await assert.rejects(
    selectTarget(
      logs(["repo-edu", 1, "example/impl-4 obx feat(x): removed step"]),
      root,
      named,
    ),
    (error: unknown) =>
      error instanceof InvalidArgumentError &&
      error.message ===
        "example is still being implemented. Pending steps in Repo Edu: 1, 2. Pending steps in the plan repo: 3. The implemented marker is missing in Repo Edu. The implemented marker is missing in the plan repo. Name a step scope.",
  )
})
