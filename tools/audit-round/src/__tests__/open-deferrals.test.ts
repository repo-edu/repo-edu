import assert from "node:assert/strict"
import { test } from "node:test"
import type { LogCommit } from "../episode-log.js"
import { openDeferrals } from "../open-deferrals.js"

const ratings = "[growth-pattern:none] [reach:developer] [complexity:none]"

function commit(
  sha: string,
  committedAt: string,
  subject: string,
  body: string,
): LogCommit {
  return { sha, committedAt, subject, body, files: [], renames: [] }
}

function repoDeferral(plan: string, title: string): string {
  return `- [C] [plan:../plan/${plan}.md#decisions] ${ratings} ${title}: The plan needs a decision.`
}

function planDeferral(area: string, title: string): string {
  return `- C [field:missing] [area:${area}] ${ratings} ${title}: Repo Edu needs a correction.`
}

function planApplication(citation: string): string {
  return `- C [field:missing] [section:decisions] [applies:${citation}] ${ratings} Apply plan deferral: The plan changes.`
}

function repoApplication(citation: string): string {
  return `- [C] [area:tool-audit-round] [applies:${citation}] ${ratings} Apply Repo Edu deferral: The tool changes.`
}

test("open deferrals include each direction newest first", () => {
  const logs = {
    "repo-edu": [
      commit(
        "a".repeat(40),
        "2026-10-31T12:00:00.000Z",
        "other/impl-audit-1 obx c1: defer into the active plan",
        repoDeferral("example-widen", "Plan choice"),
      ),
    ],
    plan: [
      commit(
        "b".repeat(40),
        "2026-10-30T12:00:00.000Z",
        "example/plan-audit obx growth-none c1: defer into Repo Edu",
        planDeferral("tool-audit-round", "Tool choice"),
      ),
    ],
  }

  assert.deepEqual(openDeferrals("example", logs), [
    {
      deferringRepository: "repo-edu",
      sha: "aaaaaaa",
      position: 1,
      tier: "c",
      destination: "../plan/example-widen.md#decisions",
      title: "Plan choice",
    },
    {
      deferringRepository: "plan",
      sha: "bbbbbbb",
      position: 1,
      tier: "c",
      destination: "tool-audit-round",
      title: "Tool choice",
    },
  ])
})

test("graded citations apply deferrals in both directions", () => {
  const repoSha = "a".repeat(40)
  const planSha = "b".repeat(40)
  const logs = {
    "repo-edu": [
      commit(
        "d".repeat(40),
        "2026-10-31T14:00:00.000Z",
        "example/impl-audit-1 obx growth-none c1 fix(audit-round): apply the code deferral",
        repoApplication("bbbbbbb/1"),
      ),
      commit(
        repoSha,
        "2026-10-31T11:00:00.000Z",
        "example/impl-audit-1 obx c1: defer into the plan",
        repoDeferral("example", "Plan choice"),
      ),
    ],
    plan: [
      commit(
        "c".repeat(40),
        "2026-10-31T13:00:00.000Z",
        "example/plan-audit obx growth-none c1: apply the plan deferral",
        planApplication("aaaaaaa/1"),
      ),
      commit(
        planSha,
        "2026-10-31T10:00:00.000Z",
        "example/plan-audit obx c1: defer into Repo Edu",
        planDeferral("tool-audit-round", "Tool choice"),
      ),
    ],
  }

  assert.deepEqual(openDeferrals("example", logs), [])
})

test("the destination plan selects Repo Edu deferrals", () => {
  const logs = {
    "repo-edu": [
      commit(
        "a".repeat(40),
        "2026-10-31T12:00:00.000Z",
        "example/impl-audit-1 obx c1: defer into another plan",
        repoDeferral("another", "Other plan choice"),
      ),
    ],
    plan: [],
  }

  assert.deepEqual(openDeferrals("example", logs), [])
})

test("a standing citation closes its numbered deferral only", () => {
  const repoSha = "e".repeat(40)
  const logs = {
    "repo-edu": [
      commit(
        repoSha,
        "2026-10-31T12:00:00.000Z",
        "example/impl-audit-1 obx c3: defer several plan findings",
        [
          repoDeferral("another", "Other plan choice"),
          repoDeferral("example", "Dropped choice"),
          repoDeferral("example", "Open choice"),
        ].join("\n"),
      ),
    ],
    plan: [
      commit(
        "f".repeat(40),
        "2026-10-31T13:00:00.000Z",
        "example/plan-audit obx clean: record that the plan stands",
        "- [applies:eeeeeee/2] The plan stands.",
      ),
    ],
  }

  assert.deepEqual(openDeferrals("example", logs), [
    {
      deferringRepository: "repo-edu",
      sha: "eeeeeee",
      position: 3,
      tier: "c",
      destination: "../plan/example.md#decisions",
      title: "Open choice",
    },
  ])
})

test("a plan with no deferrals has an empty open set", () => {
  const logs = {
    "repo-edu": [
      commit(
        "a".repeat(40),
        "2026-10-31T12:00:00.000Z",
        "example/impl-1 obx feat(audit-round): land the step",
        "gpt-6.1-sol xhigh",
      ),
    ],
    plan: [
      commit(
        "b".repeat(40),
        "2026-10-31T11:00:00.000Z",
        "other/plan-audit obx growth-none c1: defer elsewhere",
        planDeferral("tool-audit-round", "Other tool choice"),
      ),
    ],
  }

  assert.deepEqual(openDeferrals("example", logs), [])
})
