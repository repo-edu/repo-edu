import assert from "node:assert/strict"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import {
  type ImplementationRoundData,
  parseRoundDataFile,
  type RoundFindingReview,
  writeRoundData,
} from "../round-data.js"
import { planRepositoryPrefix } from "../target.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { commitFixture, roundFixture, shortCommit } from "./round-fixture.js"

type Fixture = Awaited<ReturnType<typeof roundFixture>>

const singleAuditorSettings = {
  ...testSettings,
  planningAudit: {
    ...testSettings.planningAudit,
    auditors: [testSettings.planningAudit.auditors[0]],
  },
  implementationAudit: {
    ...testSettings.implementationAudit,
    auditors: [testSettings.implementationAudit.auditors[0]],
  },
}

function disproveRound(
  target = "example-impl-audit-01..01",
  roundNumber = 1,
  verdicts: readonly RoundFindingReview["verdict"][] = ["accept"],
): ImplementationRoundData {
  const vets = ["abx", "atx"].slice(0, verdicts.length)
  return {
    target,
    round: roundNumber,
    tag: "otx",
    started: "2026-11-05T10:00:00.000Z",
    status: "finished",
    settings: {
      vetters: [
        { assistant: "claude", model: "claude-opus-5-5", effort: "xhigh" },
      ],
      fix: { assistant: "codex", model: "gpt-5.6-sol", effort: "xhigh" },
    },
    auditor: {
      assistant: "codex",
      model: "gpt-5.6-sol",
      effort: "xhigh",
      chosenBy: "settings",
    },
    phases: vets.map((tag) => ({
      phase: "vet" as const,
      tag,
      assistant: "claude" as const,
      model: tag === "abx" ? "claude-opus-5-5" : "claude-fable-5-1",
      effort: "xhigh",
      milliseconds: 1000,
      tokens: [],
      peakContext: null,
      compactions: 0,
    })),
    commits: [],
    findings: [
      {
        number: 1,
        title: "Unsupported claim",
        tier: "B",
        reach: "developer",
        rarity: "ordinary",
        complexity: "none",
        growthPattern: "none",
        location: {
          kind: "repo-edu",
          area: "tool-audit-round",
          covers: [],
        },
        reviews: verdicts.map((verdict, index) => ({
          vet: vets[index] as string,
          verdict,
          answer: verdict === "accept" ? null : "agree",
        })),
        outcome: verdicts.includes("drop") ? "dropped" : "kept",
        finalTier: null,
        finalReach: null,
        finalRarity: null,
      },
    ],
    judge: null,
    scope: "1",
    judgedRepos: ["repo-edu"],
  }
}

async function archivedPlan(fixture: Fixture, stem = "example") {
  const directory = join(fixture.planRoot, "archive", stem)
  await mkdir(directory, { recursive: true })
  await rm(join(fixture.activeRoot, `${stem}.md`), { force: true })
  await rm(join(fixture.activeRoot, `${stem}-widen.md`), { force: true })
  await writeFile(join(directory, "plan.md"), `# ${stem}\n`)
  await execa("git", ["add", "-A"], { cwd: fixture.planRoot })
  await commitFixture(fixture.planRoot, `${stem}/closed oth: archive fixture`)
  return directory
}

async function lifecyclePlan(
  fixture: Fixture,
  phase: "settled" | "widening",
  tracked = true,
  stem = "example",
  source = phase === "settled"
    ? `# Example plan

## Implementation plan

1. **Example step.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 1.
`
    : "# Example plan\n",
) {
  const name = phase === "settled" ? `${stem}.md` : `${stem}-widen.md`
  const other = phase === "settled" ? `${stem}-widen.md` : `${stem}.md`
  // The fixture's init holds both example artifacts, so Git drops them before
  // the one this test needs is written in the state it asks for.
  await execa(
    "git",
    [
      "rm",
      "--quiet",
      "--force",
      "--ignore-unmatch",
      "--",
      join("active", name),
      join("active", other),
    ],
    { cwd: fixture.planRoot },
  )
  // Git removes a folder it has emptied.
  await mkdir(fixture.activeRoot, { recursive: true })
  await writeFile(join(fixture.activeRoot, name), source)
  if (tracked)
    await execa("git", ["add", "--", join("active", name)], {
      cwd: fixture.planRoot,
    })
  await commitFixture(
    fixture.planRoot,
    tracked
      ? "example/plan-audit ath clean: track the active plan"
      : "fixture/init ath: leave the active plan untracked",
  )
  return join(fixture.activeRoot, name)
}

async function enableLifecycleHook(fixture: Fixture) {
  const hooks = join(fixture.root, "lifecycle-hooks")
  const signal = join(fixture.root, "lifecycle-hook-ran")
  await mkdir(hooks)
  await writeFile(
    join(hooks, "pre-commit"),
    `#!/bin/sh\nprintf 'ran\\n' >> '${signal}'\n`,
    { mode: 0o755 },
  )
  await execa("git", ["config", "core.hooksPath", hooks], {
    cwd: fixture.planRoot,
  })
  return signal
}

for (const working of ["repo-edu", "plan"] as const) {
  test(`episode at ${working} prints shared evidence and resolves stems and explicit anchors without writes`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
    )
    const root = f.repoRoot
    const facade = await commitFixture(
      f.planRoot,
      "facade/init ath: commit-shaped plan stem",
    )
    const older = await commitFixture(
      root,
      "older/impl-1 oth docs(x): older topic",
    )
    await execa("git", ["tag", "facade.md", older], { cwd: root })
    await commitFixture(root, "oth docs(x): unstemmed anchor")
    const unstemmed = (await execa("git", ["rev-parse", "HEAD"], { cwd: root }))
      .stdout
    const nextDay = Math.floor(Date.now() / 1000) + 86_400
    const newest = await commitFixture(
      root,
      "newest/impl-1 oth docs(x): newest topic",
      `@${nextDay} +0000`,
    )
    const planNewest = await commitFixture(
      f.planRoot,
      "planning/plan-audit oth clean: newest planning topic",
      `@${nextDay + (working === "plan" ? -1 : 1)} +0000`,
    )
    await commitFixture(
      f.planRoot,
      "oth docs(x): unrelated",
      `@${nextDay + 2} +0000`,
    )
    const before = await Promise.all(
      [f.repoRoot, f.planRoot, f.options.cacheRoot].map((path) =>
        readdir(path, { recursive: true }),
      ),
    )
    const invokePage = async (
      target: string | undefined,
      first = 1,
      last = 100_000,
    ) => {
      f.visible.length = 0
      assert.equal(
        await runCommand(
          [
            "episode",
            ...(target === undefined ? [] : [target]),
            "--lines",
            `${first}-${last}`,
          ],
          f.runtime,
          f.options,
        ),
        0,
        f.errors.join("\n"),
      )
      const [heading, ...lines] = f.visible.join("\n").split("\n")
      const match = /^Evidence lines (none|\d+-\d+) of (\d+)\.$/.exec(heading)
      assert.ok(match, heading)
      return {
        returned: match[1],
        total: Number(match[2]),
        lines,
      }
    }
    const invoke = async (target?: string) => {
      const page = await invokePage(target)
      return JSON.parse(page.lines.join("\n"))
    }
    const topic = (evidence: {
      repositories: readonly { readonly topic: string | null }[]
    }) => evidence.repositories[0]?.topic
    assert.equal(
      topic(await invoke()),
      working === "plan" ? "newest" : "planning",
    )
    const planAnchor = await invoke(planNewest)
    assert.equal(topic(planAnchor), "planning")
    assert.ok(
      planAnchor.repositories
        .find((entry: { repository: string }) => entry.repository === "plan")
        .anchor.startsWith(planNewest),
    )
    const stem = await invoke("example")
    assert.equal(topic(stem), "example")
    assert.equal(stem.repositories.length, 2)
    for (const target of ["example.md", "example-widen", "example-widen.md"])
      assert.deepEqual(await invoke(target), stem)
    const named = await invoke("facade.md")
    assert.equal(topic(named), "facade")
    assert.ok(
      named.repositories
        .find((entry: { repository: string }) => entry.repository === "plan")
        .commits.some((commit: { sha: string }) =>
          commit.sha.startsWith(facade),
        ),
    )
    const anchored = await invoke(older)
    assert.equal(topic(anchored), "older")
    assert.ok(
      anchored.repositories
        .find(
          (entry: { repository: string }) => entry.repository === "repo-edu",
        )
        .anchor.startsWith(older),
    )
    const fallback = await invoke("HEAD-1")
    assert.equal(topic(fallback), "newest")
    assert.equal(
      fallback.repositories.find(
        (entry: { repository: string }) => entry.repository === "repo-edu",
      ).anchor,
      unstemmed.slice(0, 6),
    )
    const head = await invoke("HEAD")
    assert.ok(
      head.repositories
        .find(
          (entry: { repository: string }) => entry.repository === "repo-edu",
        )
        .head.startsWith(newest),
    )
    const exampleAnchor = await invoke(f.heads[working])
    for (const entry of exampleAnchor.repositories)
      assert.ok(
        entry.anchor.startsWith(
          f.heads[entry.repository as keyof typeof f.heads],
        ),
      )

    const whole = await invokePage("example")
    assert.equal(whole.returned, `1-${whole.total}`)
    const wholeLines = whole.lines
    const first = await invokePage("example", 1, 2)
    assert.equal(first.returned, "1-2")
    assert.deepEqual(first.lines, wholeLines.slice(0, 2))
    const middleStart = Math.floor(whole.total / 2)
    const middle = await invokePage("example", middleStart, middleStart + 1)
    assert.equal(middle.returned, `${middleStart}-${middleStart + 1}`)
    assert.deepEqual(
      middle.lines,
      wholeLines.slice(middleStart - 1, middleStart + 1),
    )
    const last = await invokePage("example", whole.total - 1, whole.total + 20)
    assert.equal(last.returned, `${whole.total - 1}-${whole.total}`)
    assert.deepEqual(last.lines, wholeLines.slice(-2))
    const outside = await invokePage(
      "example",
      whole.total + 1,
      whole.total + 20,
    )
    assert.equal(outside.returned, "none")
    assert.deepEqual(outside.lines, [])

    assert.deepEqual(
      await Promise.all(
        [f.repoRoot, f.planRoot, f.options.cacheRoot].map((path) =>
          readdir(path, { recursive: true }),
        ),
      ),
      before,
    )

    const stale = await invoke("example")
    const freshHead = await commitFixture(
      root,
      "example/impl-2 oth docs(audit-round): refresh evidence",
    )
    const afterCommit = await Promise.all(
      [f.repoRoot, f.planRoot, f.options.cacheRoot].map((path) =>
        readdir(path, { recursive: true }),
      ),
    )
    const fresh = await invoke("example")
    assert.notEqual(
      fresh.repositories.find(
        (entry: { repository: string }) => entry.repository === "repo-edu",
      ).head,
      stale.repositories.find(
        (entry: { repository: string }) => entry.repository === "repo-edu",
      ).head,
    )
    assert.equal(
      fresh.repositories.find(
        (entry: { repository: string }) => entry.repository === "repo-edu",
      ).head,
      freshHead.slice(0, 6),
    )
    for (const target of ["HEAD-999999999", "HEAD-nope", "f".repeat(40)]) {
      f.visible.length = 0
      f.errors.length = 0
      assert.equal(
        await runCommand(
          ["episode", target, "--lines", "1-200"],
          f.runtime,
          f.options,
        ),
        1,
      )
      assert.match(
        f.errors.join("\n"),
        new RegExp(`Cannot resolve episode commit reference: ${target}`),
      )
      assert.deepEqual(f.visible, [])
    }
    assert.deepEqual(
      await Promise.all(
        [f.repoRoot, f.planRoot, f.options.cacheRoot].map((path) =>
          readdir(path, { recursive: true }),
        ),
      ),
      afterCommit,
    )
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })
}

test("a plan-prefixed commit round keeps the typed prefix in its audit arguments", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    null,
    false,
    "repo-edu",
    true,
  )
  const reference = `${planRepositoryPrefix}HEAD-2..HEAD`
  let startingHead = f.heads.plan
  for (const n of [1, 2])
    startingHead = await commitFixture(f.planRoot, `Plan fixture ${n}`)
  const label = `${await shortCommit(f.planRoot, "HEAD~2")}..${await shortCommit(f.planRoot, "HEAD")}`
  const full = async (revision: string) =>
    (await execa("git", ["rev-parse", revision], { cwd: f.planRoot })).stdout
  const commits = await Promise.all(["HEAD~2", "HEAD~1", "HEAD"].map(full))

  assert.equal(
    await runCommand(["round-commits", reference], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
    0,
    f.errors.join("\n"),
  )

  const { log, markdown, transcript } = await f.records()
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([f.report, { repository: "plan", references: [reference], startingHead, commits, shortReferences: [label], originalCommits: commits }])}`,
    ),
  )
  assert.equal(
    markdown.split("\n")[0],
    `# Commit audit of ${reference} (round 1)`,
  )
  assert.ok(basename(transcript).startsWith(`commit-${label}-01-1-round.`))
})

test("a two-repo commit round passes parsed groups and joins their labels", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    null,
    false,
    "repo-edu",
    true,
  )
  const references = ["HEAD", `${planRepositoryPrefix}HEAD`] as const
  // Read before the run, because the round's clean record moves a head.
  const repoCommit = (
    await execa("git", ["rev-parse", "HEAD"], { cwd: f.repoRoot })
  ).stdout
  const planCommit = (
    await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })
  ).stdout

  assert.equal(
    await runCommand(["round-commits", ...references], f.runtime, {
      ...f.options,
      settings: singleAuditorSettings,
    }),
    0,
    f.errors.join("\n"),
  )

  const { log, markdown, transcript } = await f.records()
  const groups = [
    {
      repository: "repo-edu",
      references: ["HEAD"],
      startingHead: f.heads["repo-edu"],
      commits: [repoCommit],
      shortReferences: [f.heads["repo-edu"].slice(0, 6)],
      originalCommits: [repoCommit],
    },
    {
      repository: "plan",
      references: [`${planRepositoryPrefix}HEAD`],
      startingHead: f.heads.plan,
      commits: [planCommit],
      shortReferences: [f.heads.plan.slice(0, 6)],
      originalCommits: [planCommit],
    },
  ]
  assert.ok(
    log.includes(
      `Phase arguments (JSON array): ${JSON.stringify([f.report, ...groups])}`,
    ),
  )
  assert.equal(
    markdown.split("\n")[0],
    `# Commit audit of ${references.join(" ")} (round 1)`,
  )
  assert.ok(
    basename(transcript).startsWith(
      `commit-${f.heads["repo-edu"].slice(0, 6)}+${f.heads.plan.slice(0, 6)}-01-1-round.`,
    ),
  )
})

test("settle commits only the widening rename through hooks and then leaves its marker", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const plan = await lifecyclePlan(f, "widening")
  const hook = await enableLifecycleHook(f)
  await writeFile(
    join(f.roundRoot, "example-plan-audit-03-2-audit.oth.md"),
    "Peer report",
  )
  await writeFile(join(f.planRoot, "staged.txt"), "Staged work\n")
  await execa("git", ["add", "staged.txt"], { cwd: f.planRoot })
  await writeFile(join(f.planRoot, "untracked.txt"), "Untracked work\n")

  assert.equal(
    await runCommand(["settle", "example-widen.md"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )

  const settled = join(f.activeRoot, "example.md")
  const marker = join(f.roundRoot, "example-plan-audit-04-0-settle.md")
  await assert.rejects(readFile(plan), { code: "ENOENT" })
  assert.equal(await readFile(settled, "utf8"), "# Example plan\n")
  assert.equal(await readFile(marker, "utf8"), "")
  assert.equal(
    (
      await execa("git", ["log", "-1", "--format=%B"], { cwd: f.planRoot })
    ).stdout.trim(),
    "example/settle: settle the plan's shape",
  )
  assert.match(
    (
      await execa(
        "git",
        [
          "diff-tree",
          "--no-commit-id",
          "--name-status",
          "--find-renames",
          "-r",
          "HEAD",
        ],
        { cwd: f.planRoot },
      )
    ).stdout,
    /^R100\tactive\/example-widen\.md\tactive\/example\.md$/,
  )
  assert.equal(
    (
      await execa("git", ["diff", "--cached", "--name-only"], {
        cwd: f.planRoot,
      })
    ).stdout,
    "staged.txt",
  )
  assert.equal(
    await readFile(join(f.planRoot, "untracked.txt"), "utf8"),
    "Untracked work\n",
  )
  assert.equal(await readFile(hook, "utf8"), "ran\n")
  const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot }))
    .stdout
  assert.equal(
    f.visible.at(-1),
    `Committed ${head}: example/settle: settle the plan's shape\nMarker: ${marker}`,
  )
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

/** Commit a peer plan, a note and an archived plan that each link to the widening plan. */
async function linkingFiles(f: Fixture) {
  const files = {
    "active/peer.md": "The [`example-widen.md`](example-widen.md) peer.\n",
    "notes/design.md": "See [example](../active/example-widen.md#decisions).\n",
    "archive/old/plan.md": "Frozen [example](../../active/example-widen.md).\n",
  }
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(f.planRoot, path)), { recursive: true })
    await writeFile(join(f.planRoot, path), source)
  }
  await execa("git", ["add", "--", ...Object.keys(files)], {
    cwd: f.planRoot,
  })
  await commitFixture(f.planRoot, "fixture/init ath: link to the example plan")
}

test("settle points other tracked files' links at the settled plan in its commit", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(
    f,
    "widening",
    true,
    "example",
    "# Example plan\n\nThis is [`example-widen.md`](example-widen.md).\n",
  )
  await linkingFiles(f)

  assert.equal(
    await runCommand(["settle", "example"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )

  const read = (path: string) => readFile(join(f.planRoot, path), "utf8")
  assert.equal(
    await read("active/peer.md"),
    "The [`example.md`](example.md) peer.\n",
  )
  assert.equal(
    await read("notes/design.md"),
    "See [example](../active/example.md#decisions).\n",
  )
  assert.equal(
    await read("archive/old/plan.md"),
    "Frozen [example](../../active/example-widen.md).\n",
  )
  assert.equal(
    await read("active/example.md"),
    "# Example plan\n\nThis is [`example-widen.md`](example-widen.md).\n",
  )
  assert.deepEqual(
    (
      await execa(
        "git",
        [
          "diff-tree",
          "--no-commit-id",
          "--name-status",
          "--find-renames",
          "-r",
          "HEAD",
        ],
        { cwd: f.planRoot },
      )
    ).stdout.split("\n"),
    [
      "R100\tactive/example-widen.md\tactive/example.md",
      "M\tactive/peer.md",
      "M\tnotes/design.md",
    ],
  )
  assert.equal(
    (
      await execa("git", ["status", "--porcelain", "--untracked-files=no"], {
        cwd: f.planRoot,
      })
    ).stdout,
    "",
  )
})

test("settle rewrites a file with other changes but leaves it out of its commit", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(f, "widening")
  await linkingFiles(f)
  await writeFile(
    join(f.planRoot, "notes/design.md"),
    "See [example](../active/example-widen.md#decisions).\n\nDraft.\n",
  )
  await writeFile(
    join(f.planRoot, "active/draft.md"),
    "Draft of [example](example-widen.md).\n",
  )

  assert.equal(
    await runCommand(["settle", "example"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )

  const read = (path: string) => readFile(join(f.planRoot, path), "utf8")
  assert.equal(
    await read("notes/design.md"),
    "See [example](../active/example.md#decisions).\n\nDraft.\n",
  )
  assert.equal(
    await read("active/draft.md"),
    "Draft of [example](example.md).\n",
  )
  assert.equal(
    (
      await execa("git", ["show", "HEAD:notes/design.md"], {
        cwd: f.planRoot,
      })
    ).stdout,
    "See [example](../active/example-widen.md#decisions).",
  )
  assert.deepEqual(
    (
      await execa(
        "git",
        [
          "diff-tree",
          "--no-commit-id",
          "--name-status",
          "--find-renames",
          "-r",
          "HEAD",
        ],
        { cwd: f.planRoot },
      )
    ).stdout.split("\n"),
    ["R100\tactive/example-widen.md\tactive/example.md", "M\tactive/peer.md"],
  )
  assert.deepEqual(
    (
      await execa(
        "git",
        ["status", "--porcelain", "--", "active/draft.md", "notes/design.md"],
        { cwd: f.planRoot },
      )
    ).stdout.split("\n"),
    [" M notes/design.md", "?? active/draft.md"],
  )
  assert.equal(
    f.visible.at(-1)?.split("\n").at(-1),
    "Links rewritten but left uncommitted beside other changes: active/draft.md, notes/design.md",
  )
})

test("ready lands one empty commit through hooks and refuses a second marker", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(f, "settled")
  const hook = await enableLifecycleHook(f)
  await writeFile(join(f.planRoot, "staged.txt"), "Staged work\n")
  await execa("git", ["add", "staged.txt"], { cwd: f.planRoot })
  const parentTree = (
    await execa("git", ["rev-parse", "HEAD^{tree}"], { cwd: f.planRoot })
  ).stdout

  assert.equal(
    await runCommand(["ready"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )

  const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot }))
    .stdout
  assert.equal(
    (
      await execa("git", ["log", "-1", "--format=%B"], { cwd: f.planRoot })
    ).stdout.trim(),
    "example/ready: declare the plan ready for implementation\n\nCoder: codex gpt-5.6-sol high",
  )
  assert.equal(
    (await execa("git", ["rev-parse", "HEAD^{tree}"], { cwd: f.planRoot }))
      .stdout,
    parentTree,
  )
  assert.equal(
    (
      await execa("git", ["diff", "--cached", "--name-only"], {
        cwd: f.planRoot,
      })
    ).stdout,
    "staged.txt",
  )
  assert.equal(await readFile(hook, "utf8"), "ran\n")
  assert.match(f.visible.at(-1) ?? "", new RegExp(head))

  assert.equal(await runCommand(["ready", "example"], f.runtime, f.options), 1)
  assert.match(
    f.errors.at(-1) ?? "",
    /already has ready marker .+example\/ready:/,
  )
  assert.equal(
    (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })).stdout,
    head,
  )
  assert.equal(await readFile(hook, "utf8"), "ran\n")
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("ready assignments advance through the coder list and wrap", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const settings = structuredClone(testSettings)
  settings.coders = [
    { assistant: "claude", model: "claude-opus-5-5", effort: "xhigh" },
    { assistant: "codex", model: "gpt-6.1-sol", effort: "high" },
  ]
  const records: string[] = []
  for (const stem of ["example", "second", "third"]) {
    await lifecyclePlan(f, "settled", true, stem)
    assert.equal(
      await runCommand(["ready", stem], f.runtime, {
        ...f.options,
        settings,
      }),
      0,
      f.errors.join("\n"),
    )
    records.push(
      (
        await execa("git", ["log", "-1", "--format=%b"], {
          cwd: f.planRoot,
        })
      ).stdout.trim(),
    )
  }
  assert.deepEqual(records, [
    "Coder: claude claude-opus-5-5 xhigh",
    "Coder: codex gpt-6.1-sol high",
    "Coder: claude claude-opus-5-5 xhigh",
  ])
})

test("ready refuses a committed plan whose implementation steps do not read", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(
    f,
    "settled",
    true,
    "example",
    `# Example plan

## Implementation plan

1. **Example step.** The hosting repo is missing.
`,
  )
  const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot }))
    .stdout

  assert.equal(await runCommand(["ready"], f.runtime, f.options), 1)
  assert.match(f.errors.at(-1) ?? "", /Implementation plan item 1/)
  assert.equal(
    (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })).stdout,
    head,
  )
})

test("ready refuses a committed plan whose audit ranges do not read", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(
    f,
    "settled",
    true,
    "example",
    `# Example plan

## Implementation plan

1. **Example step.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 2.
`,
  )
  const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot }))
    .stdout

  assert.equal(await runCommand(["ready"], f.runtime, f.options), 1)
  assert.match(
    f.errors.at(-1) ?? "",
    /Audit ranges must start at step 1; found step 2/,
  )
  assert.equal(
    (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })).stdout,
    head,
  )
})

test("disprove appends an attached ruling to active data without committing", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(f, "settled")
  const path = join(f.roundRoot, "example-impl-rounds.json")
  writeRoundData(path, disproveRound())
  const head = (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot }))
    .stdout

  assert.equal(
    await runCommand(
      [
        "disprove",
        "example",
        "example-impl-audit-01..01",
        "1",
        "1",
        "The retained evidence disproves the claim.",
      ],
      f.runtime,
      { ...f.options, now: () => Date.UTC(2026, 10, 5, 12) },
    ),
    0,
    f.errors.join("\n"),
  )

  const data = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in data)
  assert.deepEqual(data.disproved, [
    {
      date: "2026-11-05",
      reason: "The retained evidence disproves the claim.",
      target: "example-impl-audit-01..01",
      round: 1,
      finding: 1,
      side: "finding",
    },
  ])
  assert.equal(
    (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })).stdout,
    head,
  )
  assert.equal(
    f.visible.at(-1),
    `Recorded the later ruling in ${path}. Loop-close will commit it with the archive move.`,
  )
  assert.equal(
    await runCommand(
      [
        "disprove",
        "example",
        "example-impl-audit-01..01",
        "1",
        "1",
        "--vet",
        "The finding stood as written.",
      ],
      f.runtime,
      { ...f.options, now: () => Date.UTC(2026, 10, 6, 12) },
    ),
    0,
    f.errors.join("\n"),
  )
  const restored = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in restored)
  assert.deepEqual(restored.disproved, [
    {
      ...data.disproved[0],
      date: "2026-11-06",
      reason: "The finding stood as written.",
      side: "vet",
    },
  ])
})

test("disprove --vet commits only an archived attached ruling and names its side", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const archive = await archivedPlan(f)
  const path = join(archive, "example-impl-rounds.json")
  writeRoundData(path, disproveRound(undefined, 1, ["drop"]))
  await execa("git", ["add", "--", relative(f.planRoot, path)], {
    cwd: f.planRoot,
  })
  await commitFixture(f.planRoot, "fixture/init oth: track round data")
  await writeFile(join(f.planRoot, "staged.txt"), "Staged work\n")
  await execa("git", ["add", "staged.txt"], { cwd: f.planRoot })

  assert.equal(
    await runCommand(
      [
        "disprove",
        "example",
        "example-impl-audit-01..01",
        "1",
        "1",
        "--vet",
        "The retained evidence disproves the vet verdict.",
      ],
      f.runtime,
      { ...f.options, now: () => Date.UTC(2026, 10, 5, 12) },
    ),
    0,
    f.errors.join("\n"),
  )

  assert.equal(
    (
      await execa("git", ["log", "-1", "--format=%B"], { cwd: f.planRoot })
    ).stdout.trim(),
    "example/disprove: example-impl-audit-01..01 round 1 vet finding 1\n\nThe retained evidence disproves the vet verdict.",
  )
  assert.equal(
    (
      await execa(
        "git",
        ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
        {
          cwd: f.planRoot,
        },
      )
    ).stdout,
    "archive/example/example-impl-rounds.json",
  )
  assert.equal(
    (
      await execa("git", ["diff", "--cached", "--name-only"], {
        cwd: f.planRoot,
      })
    ).stdout,
    "staged.txt",
  )
})

test("disprove --revision uses the archived round's stored target and checks the named vetter", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const archive = await archivedPlan(f)
  const path = join(archive, "example-impl-rounds.json")
  const target = "example-impl-01..01"
  writeRoundData(path, disproveRound(target, 1, ["accept", "revise"]))
  const reason = "The smaller revision was enough."
  const rule = (tag: string, roundTarget = target) =>
    runCommand(
      ["disprove", "example", roundTarget, "1", "1", "--revision", tag, reason],
      f.runtime,
      { ...f.options, now: () => Date.UTC(2026, 10, 5, 12) },
    )
  assert.equal(await rule("atx", "example-impl-audit-01..01"), 1)
  assert.match(f.errors.at(-1) ?? "", /No example-impl-audit-01\.\.01 round 1/)
  assert.equal(await rule("atx"), 0, f.errors.join("\n"))

  assert.equal(
    (
      await execa("git", ["log", "-1", "--format=%B"], { cwd: f.planRoot })
    ).stdout.trim(),
    `example/disprove: ${target} round 1 finding 1\n\n${reason}`,
  )
  for (const tag of ["abx", "otx"]) {
    assert.equal(await rule(tag), 1)
    assert.match(f.errors.at(-1) ?? "", /gave no revision on finding 1/)
  }
  const data = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in data)
  assert.deepEqual(data.disproved, [
    {
      target,
      round: 1,
      finding: 1,
      date: "2026-11-05",
      reason,
      revision: "atx",
    },
  ])
})

test("disprove creates and commits detached archived data", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const archive = await archivedPlan(f)
  const path = join(archive, "example-plan-rounds.json")

  assert.equal(
    await runCommand(
      [
        "disprove",
        "example",
        "example-plan-audit",
        "--by",
        "gpt-5.6-sol xhigh",
        "The finding predates retained round data.",
      ],
      f.runtime,
      { ...f.options, now: () => Date.UTC(2026, 10, 5, 12) },
    ),
    0,
    f.errors.join("\n"),
  )

  assert.deepEqual(parseRoundDataFile(path, await readFile(path, "utf8")), {
    rounds: [],
    disproved: [
      {
        date: "2026-11-05",
        reason: "The finding predates retained round data.",
        auditor: { model: "gpt-5.6-sol", effort: "xhigh" },
      },
    ],
  })
  assert.equal(
    (
      await execa("git", ["log", "-1", "--format=%B"], { cwd: f.planRoot })
    ).stdout.trim(),
    "example/disprove: example-plan-audit by gpt-5.6-sol xhigh\n\nThe finding predates retained round data.",
  )
})

test("disprove records a graded implementation finding against its coder", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(f, "settled")
  const path = join(f.roundRoot, "example-impl-rounds.json")
  writeRoundData(path, disproveRound())
  const reason =
    "The schema left the audit unable to finish. The session exhausted its output limit."
  const args = [
    "disprove",
    "example",
    "example-impl-audit-01..01",
    "--by",
    "gpt-6.2-sol xhigh",
    "--implementation",
    "A",
    reason,
  ]
  assert.equal(
    await runCommand(args, f.runtime, {
      ...f.options,
      now: () => Date.UTC(2026, 10, 26, 12),
    }),
    0,
    f.errors.join("\n"),
  )
  const data = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in data)
  assert.equal(data.rounds.length, 1)
  assert.deepEqual(data.disproved, [
    {
      date: "2026-11-26",
      reason,
      coder: { model: "gpt-6.2-sol", effort: "xhigh" },
      tier: "A",
    },
  ])
  assert.equal(
    await runCommand(["models"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.match(f.visible.at(-1) ?? "", /### Implementation findings/)
  assert.match(f.visible.at(-1) ?? "", /\| A \| gpt-6\.2-sol xhigh \|/)
})

test("implementation finding options reject missing attribution and incompatible targets or verdicts", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  await lifecyclePlan(f, "settled")
  for (const [target, options, message] of [
    ["example-impl-audit-01..01", ["--implementation", "A"], /requires --by/],
    [
      "example-plan-audit",
      ["--by", "gpt-6.2-sol xhigh", "--implementation", "A"],
      /implementation target/,
    ],
    [
      "example-impl-audit-01..01",
      ["--by", "gpt-6.2-sol xhigh", "--implementation", "E"],
      /Allowed choices/,
    ],
    [
      "example-impl-audit-01..01",
      ["--by", "gpt-6.2-sol xhigh", "--implementation", "A", "--vet"],
      /cannot be used/,
    ],
    [
      "example-impl-audit-01..01",
      [
        "--by",
        "gpt-6.2-sol xhigh",
        "--implementation",
        "A",
        "--revision",
        "abx",
      ],
      /cannot be used/,
    ],
  ] as const) {
    assert.equal(
      await runCommand(
        [
          "disprove",
          "example",
          target,
          ...options,
          "The implementation failed.",
        ],
        f.runtime,
        f.options,
      ),
      2,
      f.errors.join("\n"),
    )
    assert.match(f.errors.at(-1) ?? "", message)
  }
})

test("an archived implementation finding uses the existing named-model ruling commit", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const archive = await archivedPlan(f)
  const reason = "The implementation failed after its plan closed."
  assert.equal(
    await runCommand(
      [
        "disprove",
        "example",
        "example-impl-audit-01..01",
        "--by",
        "gpt-6.2-sol xhigh",
        "--implementation",
        "A",
        reason,
      ],
      f.runtime,
      f.options,
    ),
    0,
    f.errors.join("\n"),
  )
  const path = join(archive, "example-impl-rounds.json")
  const data = parseRoundDataFile(path, await readFile(path, "utf8"))
  assert.ok("disproved" in data)
  assert.equal(data.disproved.length, 1)
  assert.equal(
    (
      await execa("git", ["log", "-1", "--format=%B"], { cwd: f.planRoot })
    ).stdout.trim(),
    `example/disprove: example-impl-audit-01..01 by gpt-6.2-sol xhigh\n\n${reason}`,
  )
})

test("disprove prints an action refusal with the runner prefix and a parser refusal without it", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")

  assert.equal(
    await runCommand(
      ["disprove", "a/example", "example-plan-audit", "1", "1", "Reason."],
      f.runtime,
      f.options,
    ),
    2,
  )
  assert.equal(
    f.errors.at(-1),
    "audit-round: Name the plan by its stem, without a path.",
  )

  assert.equal(
    await runCommand(
      ["disprove", "example", "example-plan-audit", "--by", "bad", "Reason."],
      f.runtime,
      f.options,
    ),
    2,
  )
  assert.match(f.errors.at(-1) ?? "", /^error: option '--by <model-effort>'/)

  assert.equal(
    await runCommand(
      [
        "disprove",
        "example",
        "example-plan-audit",
        "--by",
        "gpt-5.6-sol xhigh",
        "--vet",
        "Reason.",
      ],
      f.runtime,
      f.options,
    ),
    2,
  )
  assert.match(f.errors.at(-1) ?? "", /cannot be used with/)
  for (const flags of [["--vet"], ["--by", "gpt-5.6-sol xhigh"]]) {
    assert.equal(
      await runCommand(
        [
          "disprove",
          "example",
          "example-plan-audit",
          "1",
          "1",
          "--revision",
          "abx",
          ...flags,
          "Reason.",
        ],
        f.runtime,
        f.options,
      ),
      2,
    )
    assert.match(f.errors.at(-1) ?? "", /cannot be used with/)
  }
})

for (const [command, phase, pattern] of [
  ["settle", "settled", /active plan is not at example-widen\.md/],
  ["ready", "widening", /still widening/],
] as const) {
  test(`${command} refuses a plan in the wrong lifecycle phase`, async (t) => {
    const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
    await lifecyclePlan(f, phase)
    const head = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })
    ).stdout
    assert.equal(
      await runCommand([command, "example"], f.runtime, f.options),
      1,
    )
    assert.match(f.errors.at(-1) ?? "", pattern)
    assert.equal(
      (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })).stdout,
      head,
    )
  })
}

for (const command of ["settle", "ready"] as const) {
  test(`${command} reports its own missing active plan`, async (t) => {
    const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")

    assert.equal(
      await runCommand([command, "missing"], f.runtime, f.options),
      1,
    )
    assert.match(
      f.errors.at(-1) ?? "",
      new RegExp(`The ${command} command requires an active plan\\.`),
    )
    assert.doesNotMatch(f.errors.at(-1) ?? "", /already closed/)
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })

  for (const state of ["unstaged", "staged", "untracked", "ignored"] as const) {
    test(`${command} refuses a plan with ${state} state`, async (t) => {
      const f = await roundFixture(
        t,
        "codex",
        "plan",
        false,
        null,
        false,
        "plan",
      )
      const stem = state === "ignored" ? "implementation-audit" : "example"
      if (state === "ignored") {
        await writeFile(join(f.planRoot, ".gitignore"), "/active/*-audit.md\n")
        await execa("git", ["add", ".gitignore"], { cwd: f.planRoot })
        await commitFixture(
          f.planRoot,
          "fixture/init ath: ignore audit-named plans",
        )
      }
      const plan = await lifecyclePlan(
        f,
        command === "settle" ? "widening" : "settled",
        state !== "untracked" && state !== "ignored",
        stem,
      )
      await writeFile(plan, `# ${state} plan\n`)
      if (state === "staged")
        await execa("git", ["add", "--", plan], { cwd: f.planRoot })
      const head = (
        await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })
      ).stdout

      assert.equal(await runCommand([command, stem], f.runtime, f.options), 1)
      assert.match(
        f.errors.at(-1) ?? "",
        new RegExp(
          state === "unstaged"
            ? "unstaged changes"
            : state === "staged"
              ? "staged changes"
              : "untracked",
        ),
      )
      assert.equal(
        (await execa("git", ["rev-parse", "HEAD"], { cwd: f.planRoot })).stdout,
        head,
      )
      assert.equal(await readFile(plan, "utf8"), `# ${state} plan\n`)
      await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
        code: "ENOENT",
      })
    })
  }
}

test("mark claims the plan's next number only for an empty reopen marker that later claims skip", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const root = f.roundRoot
  await writeFile(
    join(root, "example-plan-audit-03-2-audit.oth.md"),
    "Peer report",
  )
  const before = await readdir(root)
  assert.equal(
    await runCommand(["mark", "reopen", "example"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const reopen = join(root, "example-plan-audit-04-0-reopen.md")
  assert.equal(f.visible[0], reopen)
  assert.deepEqual(
    (await readdir(root)).filter((name) => !before.includes(name)),
    ["example-plan-audit-04-0-reopen.md"],
  )
  assert.equal(await readFile(reopen, "utf8"), "")
  assert.equal(
    await runCommand(["mark", "reopen", "example"], f.runtime, f.options),
    0,
  )
  assert.equal(f.visible[1], join(root, "example-plan-audit-05-0-reopen.md"))
  for (const args of [
    ["mark", "close", "example"],
    ["mark", "settle", "example"],
    ["mark", "reopen", "missing"],
  ])
    assert.notEqual(await runCommand(args, f.runtime, f.options), 0, args[1])
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})
