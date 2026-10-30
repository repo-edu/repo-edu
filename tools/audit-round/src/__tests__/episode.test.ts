import assert from "node:assert/strict"
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import {
  computeEpisode,
  formatWatchEvidence,
  joinedEpisode,
  readEpisode,
} from "../episode.js"
import { readLog } from "../episode-log.js"
import {
  areas,
  bullet,
  commit,
  correction,
  episode,
  history,
  ratings,
  watchRoundDataFixture,
} from "./episode-fixture.js"
import { commitFixture } from "./round-fixture.js"

test("membership admits only touched-file rework after the anchor", () => {
  const log = history(
    commit("oth growth-none c1 fix(x): rework", bullet()),
    commit("oth growth-none c1 fix(x): unrelated", bullet(), ["other.ts"]),
    commit("example/impl-audit-all old C1: older subject", bullet()),
    commit("example/impl-1 ath feat(x): earlier step", "", ["src/b.ts"]),
  )
  const before = {
    ...correction(),
    sha: "before",
    subject: "oth growth-none c1 fix(x): before the anchor",
  }
  const data = episode([...log, before])
  assert.deepEqual(data.artifacts, ["src/a.ts", "src/b.ts"])
  assert.deepEqual(
    data.commits.map((c) => c.sha),
    ["c000005", "c000003", "c000002", "c000001"],
  )
  assert.equal(data.commits[1].parsed, null)
  assert.equal(data.tokens.reach.developer, 2)
})

test("joined evidence keeps both heads and applies an explicit anchor only in its own repository", () => {
  const logs = {
    "repo-edu": history(correction(), correction()),
    plan: history(
      commit(
        "example/plan-audit ath growth-none C1: change",
        `- C [field:missing] [section:decisions] ${ratings} Correct: it.`,
        ["example.md"],
      ),
    ),
  }
  const data = joinedEpisode(logs, "example", areas, {
    repository: "repo-edu",
    sha: "c000002",
  })
  const [plan, code] = data.repositories
  assert.equal(data.topic, "example")
  assert.equal(plan.head, "c000002")
  assert.equal(plan.anchor, "c000001")
  assert.equal(code.head, "c000003")
  assert.equal(code.anchor, "c000002")
  assert.equal(code.commits.length, 2)
  assert.equal(plan.tokens.sections.decisions, 1)
  assert.throws(
    () => computeEpisode(logs.plan, "plan", "example", areas, "missing"),
    /anchor.*not on/,
  )
  const absent = computeEpisode(logs.plan, "plan", "other", areas)
  assert.equal(absent.anchor, null)
  assert.deepEqual(absent.commits, [])
})

test("subject totals still validate findings without per-commit duplicate facts", () => {
  const mixed = commit(
    "oth pruning-high !B1C1a1d1 redesign(x): reshape",
    [
      bullet("area:area-a", "A"),
      bullet("area:area-a", "B", ratings.replace("developer", "ordinary")),
      bullet("area:area-b", "C", ratings.replace("developer", "rare")),
      bullet("area:area-b", "D"),
    ].join("\n"),
  )
  const data = episode(history(mixed))
  assert.equal(data.commits[0].unreadable, null)
  assert.equal("loose" in data.commits[0], false)
  assert.equal("trajectory" in data.commits[0], false)
  assert.equal("tokens" in data.commits[0], false)
  assert.deepEqual(data.windowStarts, [{ sha: "c000002", kind: "redesign" }])
  const broken = episode(history({ ...mixed, body: "- [A] Missing tokens." }))
  assert.equal(broken.unreadable.length, 1)
  assert.deepEqual(broken.commits[0].findings, [])
  assert.deepEqual(broken.tokens.areas, {})
})

test("joined totals and repeated growth include findings from both repositories", () => {
  const tokens = ratings.replace(
    "growth-pattern:none",
    "growth-pattern:recurrence",
  )
  const data = joinedEpisode(
    {
      "repo-edu": history(
        commit(
          "oth growth-none c1 fix(x): code",
          bullet("area:area-a", "C", tokens),
        ),
      ),
      plan: history(
        commit(
          "example/plan-audit ath growth-none C1: plan",
          `- C [field:missing] [section:decisions] ${tokens} Correct: it.`,
        ),
      ),
    },
    "example",
    areas,
  )
  assert.equal(data.tokens.growthPattern.recurrence, 2)
  assert.deepEqual(data.growthPatterns, [
    { label: "recurrence", commits: ["repo-edu@c000002", "plan@c000002"] },
  ])
})

test("the watch view keeps only the reduced repository and commit evidence", () => {
  const recurring = ratings
    .replace("growth-pattern:none", "growth-pattern:recurrence")
    .replace("complexity:none", "complexity:low")
  const newestSubject =
    "example/impl-audit-1 oth growth-none c1 redesign(audit-round): newest"
  const earlierSubject =
    "example/impl-audit-1 oth growth-none c1 redesign(audit-round): earlier"
  const unreadableSubject =
    "example/impl-audit-1 oth growth-none c1 fix(audit-round): unreadable"
  const planSubject = "example/plan-audit oth growth-none c1: reopen the shape"
  const logs = {
    "repo-edu": [
      {
        ...commit(newestSubject, bullet("area:area-a", "C", recurring)),
        sha: "a".repeat(40),
        committedAt: "2026-10-30T00:20:39+01:00",
      },
      {
        ...commit(earlierSubject, bullet("area:area-a", "C", recurring)),
        sha: "b".repeat(40),
        committedAt: "2026-10-29T00:00:00+00:00",
      },
      {
        ...commit(unreadableSubject, "- [C] [area:area-a] Old finding form."),
        sha: "c".repeat(40),
        committedAt: "2026-10-28T00:00:00+00:00",
      },
    ],
    plan: [
      {
        ...commit(
          planSubject,
          `- C [field:missing] [section:decisions] ${recurring} Correct: the plan.`,
          ["example.md", "example-widen.md"],
          [{ from: "example.md", to: "example-widen.md" }],
        ),
        sha: "d".repeat(40),
        committedAt: "2026-10-27T00:00:00+00:00",
      },
    ],
  }
  const joined = joinedEpisode(logs, "example", areas)
  for (const commit of joined.repositories[1].commits) {
    assert.equal("loose" in commit, false)
    assert.equal("trajectory" in commit, false)
    assert.equal("tokens" in commit, false)
  }

  const formatted = formatWatchEvidence(joined)
  assert.match(formatted.evidence, /^\{\n {2}"repositories":/)
  assert.deepEqual(formatted.heads, {
    "repo-edu": "aaaaaaa",
    plan: "ddddddd",
  })
  const evidence = JSON.parse(formatted.evidence)
  assert.deepEqual(Object.keys(evidence), [
    "repositories",
    "tokens",
    "growthPatterns",
    "roundData",
  ])
  assert.deepEqual(evidence.tokens, {
    growthPattern: { recurrence: 3 },
    reach: { developer: 3 },
    complexity: { low: 3 },
    sections: { decisions: 1 },
    areas: { "area-a": 2 },
    covers: {},
  })
  assert.deepEqual(evidence.growthPatterns, [
    {
      label: "recurrence",
      commits: ["repo-edu@bbbbbbb", "repo-edu@aaaaaaa", "plan@ddddddd"],
    },
  ])
  assert.deepEqual(evidence.roundData, {})

  const plan = evidence.repositories[0]
  assert.deepEqual(Object.keys(plan), [
    "repository",
    "topic",
    "head",
    "anchor",
    "tokens",
    "runs",
    "commits",
  ])
  assert.deepEqual(
    {
      repository: plan.repository,
      topic: plan.topic,
      head: plan.head,
      anchor: plan.anchor,
      tokens: plan.tokens,
      runs: plan.runs,
    },
    {
      repository: "plan",
      topic: "example",
      head: "ddddddd",
      anchor: "ddddddd",
      tokens: {
        growthPattern: { recurrence: 1 },
        reach: { developer: 1 },
        complexity: { low: 1 },
        sections: { decisions: 1 },
        areas: {},
        covers: {},
      },
      runs: { growthPatterns: [], complexity: [] },
    },
  )
  assert.deepEqual(plan.commits, [
    {
      sha: "ddddddd",
      date: "2026-10-27",
      subject: planSubject,
      windowStart: "widening",
      findings: [`C [field:missing] [section:decisions] ${recurring} Correct`],
    },
  ])

  const repoEdu = evidence.repositories[1]
  assert.deepEqual(Object.keys(repoEdu), [
    "repository",
    "topic",
    "head",
    "anchor",
    "tokens",
    "runs",
    "commits",
  ])
  assert.deepEqual(
    {
      repository: repoEdu.repository,
      topic: repoEdu.topic,
      head: repoEdu.head,
      anchor: repoEdu.anchor,
      tokens: repoEdu.tokens,
      runs: repoEdu.runs,
    },
    {
      repository: "repo-edu",
      topic: "example",
      head: "aaaaaaa",
      anchor: "ccccccc",
      tokens: {
        growthPattern: { recurrence: 2 },
        reach: { developer: 2 },
        complexity: { low: 2 },
        sections: {},
        areas: { "area-a": 2 },
        covers: {},
      },
      runs: {
        growthPatterns: [
          { label: "recurrence", commits: ["bbbbbbb", "aaaaaaa"] },
        ],
        complexity: [["bbbbbbb", "aaaaaaa"]],
      },
    },
  )
  assert.deepEqual(repoEdu.commits.slice(0, 2), [
    {
      sha: "aaaaaaa",
      date: "2026-10-30",
      subject: newestSubject,
      windowStart: "redesign",
      findings: [`[C] [area:area-a] ${recurring} Correct`],
    },
    {
      sha: "bbbbbbb",
      date: "2026-10-29",
      subject: earlierSubject,
      windowStart: "redesign",
      findings: [`[C] [area:area-a] ${recurring} Correct`],
    },
  ])
  assert.deepEqual(
    {
      sha: repoEdu.commits[2].sha,
      date: repoEdu.commits[2].date,
      subject: repoEdu.commits[2].subject,
      findings: repoEdu.commits[2].findings,
    },
    {
      sha: "ccccccc",
      date: "2026-10-28",
      subject: unreadableSubject,
      findings: [],
    },
  )
  assert.match(repoEdu.commits[2].unreadable, /finding bullet/)
  for (const commit of [...plan.commits, ...repoEdu.commits]) {
    for (const field of [
      "committedAt",
      "body",
      "files",
      "renames",
      "parsed",
      "loose",
      "trajectory",
      "tokens",
    ])
      assert.equal(field in commit, false, field)
  }
})

test("the watch view keeps dropped findings from finished rounds and all unfinished findings", () => {
  const roundData = watchRoundDataFixture()
  const evidence = JSON.parse(
    formatWatchEvidence(
      joinedEpisode(
        {
          "repo-edu": history(correction()),
          plan: history(commit("other/init ath: other plan")),
        },
        "example",
        areas,
      ),
      roundData,
    ).evidence,
  )
  const planningSource = roundData.planning?.[0]
  const implementationSource = roundData.implementation?.[0]
  assert.ok(planningSource)
  assert.ok(implementationSource)
  assert.deepEqual(evidence.roundData.planning, [
    {
      target: "example-plan",
      round: 3,
      commits: [{ repository: "repo-edu", sha: "aaaaaaa" }],
      status: "finished",
      findings: [planningSource.findings[0]],
      phases: [
        { phase: "audit", compactions: 1 },
        { phase: "fix", compactions: 0 },
      ],
    },
  ])
  assert.deepEqual(evidence.roundData.implementation, [
    {
      target: "example-impl-01..01",
      round: 4,
      commits: [{ repository: "repo-edu", sha: "bbbbbbb" }],
      status: "failed",
      findings: implementationSource.findings,
      phases: [
        { phase: "audit", compactions: 1 },
        { phase: "fix", compactions: 0 },
      ],
    },
  ])
})

test("each finding resolves current, split and unknown areas while all other tokens still count", () => {
  const body = [
    bullet(
      "area:area-a",
      "C",
      "[cover:cover-x] [growth-pattern:recurrence,ownership] [reach:rare] [complexity:low]",
    ),
    bullet("area:retired", "C"),
    bullet("area:missing", "D"),
  ].join("\n")
  const data = episode(
    history(commit("oth growth-none C1c1d1 fix(x): findings", body)),
  )
  const findings = data.commits[0].findings
  assert.deepEqual(
    findings.map((f) => f.areas),
    [["area-a"], ["child-a", "child-b"], []],
  )
  assert.deepEqual(
    findings.map((f) => f.unresolved),
    [[], [], ["missing"]],
  )
  assert.deepEqual(data.tokens, {
    growthPattern: { recurrence: 1, ownership: 1, none: 2 },
    reach: { rare: 1, developer: 2 },
    complexity: { low: 1, none: 2 },
    sections: {},
    areas: { "area-a": 1, "child-a": 1, "child-b": 1 },
    covers: { "cover-x": 1 },
  })
  assert.match(findings[2].text, /Missing|Correct/)
  const currentWins = computeEpisode(
    history(correction("retired")),
    "repo-edu",
    "example",
    [...areas, { id: "retired", kind: "partition" }],
  )
  assert.deepEqual(currentWins.commits[0].findings[0].areas, ["retired"])
})

test("run evidence counts distinct graded commits including off-plan and D-only work", () => {
  const tokens =
    "[growth-pattern:recurrence] [reach:developer] [complexity:medium]"
  const repeated = commit(
    "oth growth-none d2 docs(x): wording",
    [
      bullet("area:area-a", "D", tokens),
      bullet("area:area-a", "D", tokens),
    ].join("\n"),
  )
  const data = episode(history(repeated, repeated))
  assert.deepEqual(data.runs.growthPatterns, [
    { label: "recurrence", commits: ["c000002", "c000003"] },
  ])
  assert.deepEqual(data.runs.complexity, [["c000002", "c000003"]])
  assert.equal(data.tokens.growthPattern.recurrence, 4)
  assert.deepEqual(episode(history(repeated)).runs.growthPatterns, [])
})

test("complexity runs include all three non-ordinary reaches and positive levels only", () => {
  for (const reach of ["developer", "very-rare", "rare", "ordinary"]) {
    for (const complexity of [
      "low",
      "medium",
      "high",
      "none",
      "minus-low",
      "minus-medium",
      "minus-high",
    ]) {
      const c = commit(
        "oth growth-none C1 fix(x): trade",
        bullet(
          "area:area-a",
          "C",
          `[growth-pattern:none] [reach:${reach}] [complexity:${complexity}]`,
        ),
      )
      const data = episode(history(c, c))
      const eligible =
        reach !== "ordinary" && ["low", "medium", "high"].includes(complexity)
      assert.equal(
        data.runs.complexity.length,
        eligible ? 1 : 0,
        `${reach}/${complexity}`,
      )
      assert.deepEqual(data.runs.growthPatterns, [])
    }
  }
  const c = commit(
    "oth growth-none c1 fix(x): trade",
    bullet(
      "area:area-a",
      "C",
      ratings.replace("complexity:none", "complexity:high"),
    ),
  )
  assert.deepEqual(episode(history(c, correction(), c)).runs.complexity, [])
  const broken = commit(
    "oth growth-none c1 fix(x): unreadable",
    "- [C] [area:area-a] Old tokens.",
  )
  assert.deepEqual(episode(history(c, broken, c)).runs.complexity, [])
  // Different bullets cannot supply the reach and complexity halves of a pair.
  const unpaired = commit(
    "oth growth-none C1c1 fix(x): separate trades",
    [
      bullet(
        "area:area-a",
        "C",
        ratings
          .replace("developer", "ordinary")
          .replace("complexity:none", "complexity:high"),
      ),
      bullet(),
    ].join("\n"),
  )
  assert.deepEqual(episode(history(unpaired, unpaired)).runs.complexity, [])
})

test("a missing or malformed bullet makes the whole commit unreadable, D included", () => {
  for (const body of ["", `${bullet()}\n- [D] [area:area-a] Old.`, bullet()]) {
    const data = episode(
      history(commit("oth growth-none c1d1 fix(x): two findings", body)),
    )
    assert.equal(data.unreadable.length, 1)
    assert.equal(data.commits[0].findings.length, 0)
  }
})

test("widening candidates require an actual rename back to the widening artifact", () => {
  const widened = commit(
    "example/plan-audit ath clean: reopen",
    "",
    ["example.md", "example-widen.md"],
    [{ from: "example.md", to: "example-widen.md" }],
  )
  const data = episode(history(widened, { ...widened, renames: [] }), "plan")
  assert.deepEqual(data.windowStarts, [{ sha: "c000003", kind: "widening" }])
})

test("Git supplies complete bodies, unusual touched paths and both sides of renames", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "episode-log-"))
  try {
    const first = await commitFixture(
      cwd,
      "example/init ath: start",
      "2026-10-30T00:20:39+01:00",
    )
    const name = 'odd\tname\n".md'
    // Git can store names that the host filesystem cannot create.
    const { stdout: blob } = await execa(
      "git",
      ["hash-object", "-w", "--stdin"],
      {
        cwd,
        input: "# Contents\n",
      },
    )
    const { stdout: tree } = await execa("git", ["mktree", "-z"], {
      cwd,
      input: `100644 blob ${blob}\t${name}\0`,
    })
    const { stdout: added } = await execa(
      "git",
      ["commit-tree", tree, "-p", "HEAD"],
      {
        cwd,
        input: `example/plan-audit ath growth-none C1: add\n\n- C [field:missing] [section:decisions] ${ratings} Correct: it.\n`,
      },
    )
    await execa("git", ["update-ref", "HEAD", added], { cwd })
    await writeFile(join(cwd, "example.md"), "# Contents\n")
    await execa("git", ["add", "-A"], { cwd })
    await commitFixture(cwd, "example/settle ath: name")
    await rename(join(cwd, "example.md"), join(cwd, "example-widen.md"))
    await execa("git", ["add", "-A"], { cwd })
    await commitFixture(cwd, "example/plan-audit ath clean: reopen")
    await commitFixture(cwd, "example/ready: empty")
    const log = await readLog(cwd)
    assert.equal(log.length, 5)
    assert.ok(log[4].sha.startsWith(first))
    assert.equal(log[4].committedAt, "2026-10-30T00:20:39+01:00")
    assert.deepEqual(log[0].files, [])
    assert.deepEqual(log[2].renames, [{ from: name, to: "example.md" }])
    assert.deepEqual(log[2].files, [name, "example.md"])
    assert.match(log[3].body, /\[section:decisions\]/)
    const data = computeEpisode(log, "plan", "example", areas)
    assert.deepEqual(data.windowStarts, [{ sha: log[1].sha, kind: "widening" }])
    assert.deepEqual(data.tokens.sections, { decisions: 1 })

    // The running process must see model edits made by a fix before the next glance.
    await writeFile(join(cwd, "code.ts"), "content")
    await execa("git", ["add", "."], { cwd })
    await commitFixture(
      cwd,
      `example/impl-audit-1 oth growth-none c1 fix(x): code\n\n${bullet()}`,
    )
    const modelDirectory = join(cwd, "tools/architecture-check/src")
    await mkdir(modelDirectory, { recursive: true })
    const writeModel = (ids: readonly string[]) =>
      writeFile(
        join(modelDirectory, "area-model.json"),
        JSON.stringify({
          schemaVersion: 1,
          areas: ids.map((id) => ({
            id,
            kind: "partition",
            name: id,
            members: [{ type: "pattern", path: "^src/" }],
            ...(id === "area-a" ? {} : { splitFrom: "area-a" }),
          })),
        }),
      )
    await writeModel(["area-a"])
    const before = await readEpisode(cwd, "repo-edu", "example", cwd)
    assert.deepEqual(before.commits[0].findings[0].areas, ["area-a"])
    await writeModel(["child-a", "child-b"])
    const after = await readEpisode(cwd, "repo-edu", "example", cwd)
    assert.deepEqual(after.commits[0].findings[0].areas, ["child-a", "child-b"])
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
