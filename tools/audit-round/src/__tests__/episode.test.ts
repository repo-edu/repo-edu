import assert from "node:assert/strict"
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { computeEpisode, joinedEpisode, readEpisode } from "../episode.js"
import { readLog } from "../episode-log.js"
import {
  areas,
  bullet,
  commit,
  correction,
  episode,
  history,
  ratings,
} from "./episode-fixture.js"
import { commitFixture } from "./round-fixture.js"

test("membership joins historical stems and admits only touched-file rework after the anchor", () => {
  const log = history(
    commit("oth c1 fix(x): rework", bullet()),
    commit("oth c1 fix(x): unrelated", bullet(), ["other.ts"]),
    commit("topology-example/impl-audit-all old C1: older subject", bullet()),
    commit("plan-example/impl-1 ath feat(x): earlier step", "", ["src/b.ts"]),
  )
  const before = {
    ...correction(),
    sha: "before",
    subject: "oth c1 fix(x): before the anchor",
  }
  const data = episode([...log, before])
  assert.deepEqual(data.artifacts, ["src/a.ts", "src/b.ts"])
  assert.deepEqual(
    data.commits.map((c) => c.sha),
    ["c000005", "c000003", "c000002", "c000001"],
  )
  assert.equal(data.commits[1].parsed, null)
  assert.deepEqual(data.commits[1].loose, {
    stem: "topology-example",
    role: "impl-audit-all",
  })
  assert.equal(data.tokens.reach.developer, 2)
})

test("joined evidence keeps both heads and applies an explicit anchor only in its own repository", () => {
  const logs = {
    "repo-edu": history(correction(), correction()),
    plan: history(
      commit(
        "plan-example/audit ath C1: change",
        `- C [field:missing] [section:decisions] ${ratings} Correct.`,
        ["example.md"],
      ),
    ),
  }
  const data = joinedEpisode(logs, "topology-example", areas, {
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

test("trajectory retains tier counts, reach case and structure independently of finding readability", () => {
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
  assert.deepEqual(data.commits[0].trajectory, {
    maximum: "a",
    counts: { a: 1, b: 1, c: 1, d: 1 },
    upper: [
      { tier: "b", count: 1 },
      { tier: "c", count: 1 },
    ],
    lower: [
      { tier: "a", count: 1 },
      { tier: "d", count: 1 },
    ],
    ordinary: true,
    structure: { direction: "pruning", level: "high" },
  })
  assert.deepEqual(data.windowStarts, [{ sha: "c000002", kind: "redesign" }])
  const broken = episode(history({ ...mixed, body: "- [A] Missing tokens." }))
  assert.equal(broken.unreadable.length, 1)
  assert.equal(broken.commits[0].trajectory.maximum, "a")
  assert.deepEqual(broken.commits[0].findings, [])
  assert.deepEqual(broken.tokens.areas, {})
})

test("joined totals and repeated growth include findings from both repositories", () => {
  const tokens = ratings.replace("growth:none", "growth:recurrence")
  const data = joinedEpisode(
    {
      "repo-edu": history(
        commit("oth c1 fix(x): code", bullet("area:area-a", "C", tokens)),
      ),
      plan: history(
        commit(
          "example/audit ath C1: plan",
          `- C [field:missing] [section:decisions] ${tokens} Correct.`,
        ),
      ),
    },
    "example",
    areas,
  )
  assert.equal(data.tokens.growth.recurrence, 2)
  assert.deepEqual(data.growth, [
    { label: "recurrence", commits: ["repo-edu@c000002", "plan@c000002"] },
  ])
})

test("each finding resolves current, split and unknown areas while all other tokens still count", () => {
  const body = [
    bullet(
      "area:area-a",
      "C",
      "[cover:cover-x] [growth:recurrence,ownership] [reach:rare] [complexity:low]",
    ),
    bullet("area:retired", "C"),
    bullet("area:missing", "D"),
  ].join("\n")
  const data = episode(history(commit("oth C1c1d1 fix(x): findings", body)))
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
    growth: { recurrence: 1, ownership: 1, none: 2 },
    reach: { rare: 1, developer: 2 },
    complexity: { low: 1, none: 2 },
    sections: {},
    areas: { "area-a": 1, "child-a": 1, "child-b": 1 },
    covers: { "cover-x": 1 },
  })
  assert.deepEqual(data.commits[0].tokens, data.tokens)
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
  const tokens = "[growth:recurrence] [reach:developer] [complexity:medium]"
  const repeated = commit(
    "oth d2 docs(x): wording",
    [
      bullet("area:area-a", "D", tokens),
      bullet("area:area-a", "D", tokens),
    ].join("\n"),
  )
  const data = episode(history(repeated, repeated))
  assert.deepEqual(data.runs.growth, [
    { label: "recurrence", commits: ["c000002", "c000003"] },
  ])
  assert.deepEqual(data.runs.complexity, [["c000002", "c000003"]])
  assert.equal(data.tokens.growth.recurrence, 4)
  assert.deepEqual(episode(history(repeated)).runs.growth, [])
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
        "oth C1 fix(x): trade",
        bullet(
          "area:area-a",
          "C",
          `[growth:none] [reach:${reach}] [complexity:${complexity}]`,
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
      assert.deepEqual(data.runs.growth, [])
    }
  }
  const c = commit(
    "oth c1 fix(x): trade",
    bullet(
      "area:area-a",
      "C",
      ratings.replace("complexity:none", "complexity:high"),
    ),
  )
  assert.deepEqual(episode(history(c, correction(), c)).runs.complexity, [])
  const broken = commit(
    "oth c1 fix(x): unreadable",
    "- [C] [area:area-a] Old tokens.",
  )
  assert.deepEqual(episode(history(c, broken, c)).runs.complexity, [])
  // Different bullets cannot supply the reach and complexity halves of a pair.
  const unpaired = commit(
    "oth C1c1 fix(x): separate trades",
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
    const data = episode(history(commit("oth c1d1 fix(x): two findings", body)))
    assert.equal(data.unreadable.length, 1)
    assert.equal(data.commits[0].findings.length, 0)
    assert.equal(data.commits[0].trajectory.counts.d, 1)
  }
})

test("widening candidates require an actual rename back to the widening artifact", () => {
  const widened = commit(
    "example/audit ath clean: reopen",
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
    const first = await commitFixture(cwd, "example/init ath: start")
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
        input: `example/audit ath C1: add\n\n- C [field:missing] [section:decisions] ${ratings} Correct.\n`,
      },
    )
    await execa("git", ["update-ref", "HEAD", added], { cwd })
    await writeFile(join(cwd, "example.md"), "# Contents\n")
    await execa("git", ["add", "-A"], { cwd })
    await commitFixture(cwd, "example/settle ath: name")
    await rename(join(cwd, "example.md"), join(cwd, "example-widen.md"))
    await execa("git", ["add", "-A"], { cwd })
    await commitFixture(cwd, "example/audit ath clean: reopen")
    await commitFixture(cwd, "example/ready ath: empty")
    const log = await readLog(cwd)
    assert.equal(log.length, 5)
    assert.ok(log[4].sha.startsWith(first))
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
      `example/impl-audit-all oth c1 fix(x): code\n\n${bullet()}`,
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
