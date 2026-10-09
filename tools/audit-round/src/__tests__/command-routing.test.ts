import assert from "node:assert/strict"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { runCommand, testSettings } from "./configured-runner.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

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
    const invoke = async (target?: string) => {
      f.visible.length = 0
      assert.equal(
        await runCommand(
          ["episode", ...(target === undefined ? [] : [target])],
          f.runtime,
          f.options,
        ),
        0,
        f.errors.join("\n"),
      )
      return JSON.parse(f.visible.join("\n"))
    }
    assert.equal(
      (await invoke()).topic,
      working === "plan" ? "newest" : "planning",
    )
    const planAnchor = await invoke(planNewest)
    assert.equal(planAnchor.topic, "planning")
    assert.ok(
      planAnchor.repositories
        .find((entry: { repository: string }) => entry.repository === "plan")
        .anchor.startsWith(planNewest),
    )
    const stem = await invoke("example")
    assert.equal(stem.topic, "example")
    assert.equal(stem.repositories.length, 2)
    for (const target of ["example.md", "example-widen", "example-widen.md"])
      assert.deepEqual(await invoke(target), stem)
    const named = await invoke("facade.md")
    assert.equal(named.topic, "facade")
    assert.ok(
      named.repositories
        .find((entry: { repository: string }) => entry.repository === "plan")
        .commits.some((commit: { sha: string }) =>
          commit.sha.startsWith(facade),
        ),
    )
    const anchored = await invoke(older)
    assert.equal(anchored.topic, "older")
    assert.ok(
      anchored.repositories
        .find(
          (entry: { repository: string }) => entry.repository === "repo-edu",
        )
        .anchor.startsWith(older),
    )
    const fallback = await invoke("HEAD-1")
    assert.equal(fallback.topic, "newest")
    assert.equal(
      fallback.repositories.find(
        (entry: { repository: string }) => entry.repository === "repo-edu",
      ).anchor,
      unstemmed,
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
    for (const target of ["HEAD-999999999", "HEAD-nope", "f".repeat(40)]) {
      f.visible.length = 0
      f.errors.length = 0
      assert.equal(
        await runCommand(["episode", target], f.runtime, f.options),
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
      before,
    )
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })
}

for (const working of ["repo-edu", "plan"] as const) {
  for (const tag of ["abl", "otx", "oux", "auh"]) {
    test(`name at ${working} preserves the actual ${tag} auditor and only writes its claim`, async (t) => {
      const f = await roundFixture(
        t,
        "codex",
        working,
        false,
        null,
        false,
        working,
      )
      const root = f.planRoot
      const target = working === "plan" ? "example-plan" : "example-impl-02..02"
      await writeFile(join(root, `${target}-09-2-audit.oth.md`), "Peer report")
      const before = await readdir(root)
      const settings = structuredClone(testSettings)
      for (const assistant of ["claude", "codex"] as const)
        settings.phases.audit[assistant] = {
          model: settings.strengthModels[assistant].top,
          effort: "medium",
        }
      const args = [
        "name",
        "example.md",
        ...(working === "plan" ? [] : ["2"]),
        "--auditor",
        tag,
      ]
      assert.equal(
        await runCommand(args, f.runtime, { ...f.options, settings }),
        0,
        f.errors.join("\n"),
      )
      assert.equal(
        JSON.parse(f.visible[0]).cwd,
        working === "plan" ? f.planRoot : f.repoRoot,
      )
      assert.equal(
        JSON.parse(f.visible[0]).workflow,
        join(
          working === "plan" ? f.planRoot : f.repoRoot,
          ".agents/skills/audit/references/workflow.md",
        ),
      )
      assert.deepEqual(
        [JSON.parse(f.visible[0]).claim, JSON.parse(f.visible[0]).arguments[0]],
        [`${target}-10-0-claim.md`, `${target}-10-2-audit.${tag}.md`].map(
          (name) => join(root, name),
        ),
      )
      assert.deepEqual(
        (await readdir(root)).filter((name) => !before.includes(name)),
        [`${target}-10-0-claim.md`],
      )
      assert.equal(await readFile(JSON.parse(f.visible[0]).claim, "utf8"), "")
      f.visible.length = 0
      assert.equal(await runCommand(args, f.runtime, f.options), 0)
      assert.equal(
        JSON.parse(f.visible[0]).claim,
        join(root, `${target}-11-0-claim.md`),
      )
      await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
        code: "ENOENT",
      })
    })
  }
}

test("name shares commit range and list targets with the runner", async (t) => {
  const f = await roundFixture(t)
  for (const [references, target] of [
    [["HEAD-2..HEAD"], `${f.heads["repo-edu"]}-2..${f.heads["repo-edu"]}`],
    [["abcd", "HEAD", "ef01"], "abcd-plus-2"],
  ] as const) {
    f.visible.length = 0
    assert.equal(
      await runCommand(
        ["name", ...references, "--auditor", "oux"],
        f.runtime,
        f.options,
      ),
      0,
    )
    assert.equal(
      JSON.parse(f.visible[0]).arguments[0],
      join(f.planRoot, `${target}-01-2-audit.oux.md`),
    )
  }
})

test("name requires a complete session tag before any assistant or claim", async (t) => {
  const f = await roundFixture(t)
  for (const tag of [null, "o", "ot", "ox", "utx", "otz", "otxx", "Otx"]) {
    assert.equal(
      await runCommand(
        ["name", "example.md", ...(tag === null ? [] : ["--auditor", tag])],
        f.runtime,
        f.options,
      ),
      2,
    )
  }
  assert.equal(
    (await readdir(f.repoRoot)).some((name) => name.endsWith("-0-claim.md")),
    false,
  )
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("name preserves the hand-run implementation-step route at the plan root", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "plan",
    false,
    null,
    false,
    "plan",
    false,
    false,
    true,
  )
  assert.equal(
    await runCommand(
      ["name", "example.md", "2-3", "--auditor", "oux"],
      f.runtime,
      f.options,
    ),
    0,
  )
  assert.equal(
    JSON.parse(f.visible[0]).arguments[0],
    join(f.planRoot, "example-impl-02..03-01-2-audit.oux.md"),
  )
  assert.equal(
    await runCommand(
      ["name", "abcd", "ef01", "--auditor", "oux"],
      f.runtime,
      f.options,
    ),
    0,
  )
})

test("mark claims the plan's next number for an empty settle or reopen marker that later rounds skip", async (t) => {
  const f = await roundFixture(t, "codex", "plan", false, null, false, "plan")
  const root = f.planRoot
  await writeFile(join(root, "example-plan-03-2-audit.oth.md"), "Peer report")
  const before = await readdir(root)
  assert.equal(
    await runCommand(["mark", "settle", "example"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  const settle = join(root, "example-plan-04-0-settle.md")
  assert.equal(f.visible[0], settle)
  assert.deepEqual(
    (await readdir(root)).filter((name) => !before.includes(name)),
    ["example-plan-04-0-settle.md"],
  )
  assert.equal(await readFile(settle, "utf8"), "")
  assert.equal(
    await runCommand(["mark", "reopen"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.equal(f.visible[1], join(root, "example-plan-05-0-reopen.md"))
  assert.equal(
    await runCommand(
      ["name", "example.md", "--auditor", "oux"],
      f.runtime,
      f.options,
    ),
    0,
  )
  assert.equal(
    JSON.parse(f.visible[2]).claim,
    join(root, "example-plan-06-0-claim.md"),
  )
  for (const args of [
    ["mark", "close", "example"],
    ["mark", "settle", "missing"],
  ])
    assert.notEqual(await runCommand(args, f.runtime, f.options), 0, args[1])
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

for (const working of ["repo-edu", "plan"] as const) {
  test(`delete-reports at ${working} removes and lists only the exact round's numbered report kinds without assistant startup`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
    )
    const root = f.planRoot
    const target = "abcd-2..ef01-01"
    const removed = [
      "2-audit.oux.md",
      "2-audit.abl.md",
      "3-vet.ath.md",
      "4-rebut.oux.md",
    ].map((suffix) => `${target}-${suffix}`)
    const retained = [
      `${target}-0-claim.md`,
      `${target}-1-round.oux.md`,
      `${target}-1-round.oux.log`,
      `${target}-6-brief.obm.md`,
      `${target}-6-brief.obm.log`,
      `${target}-7-ruling.oth.md`,
      `${target}-9-watch.oth.md`,
      `${target}-1-audit.oux.md`,
      `${target}-2-audit.md`,
      `${target}-2-audit.oux.log`,
      "abcd-2..ef01-010-2-audit.oux.md",
      "abcd-2..ef01-02-2-audit.oux.md",
      "abcd-2..ef01-extra-01-2-audit.oux.md",
    ]
    for (const name of [...removed, ...retained])
      await writeFile(join(root, name), name)
    const peerFile = join(f.repoRoot, removed[0])
    await writeFile(peerFile, "Peer report")
    for (const invalid of [
      "example",
      "../example-01",
      "/example-01",
      "example-1",
    ])
      assert.equal(
        await runCommand(["delete-reports", invalid], f.runtime, f.options),
        2,
      )
    assert.equal(
      await runCommand(["delete-reports", target], f.runtime, f.options),
      0,
      f.errors.join("\n"),
    )
    assert.deepEqual(
      f.visible.at(-1)?.split("\n").sort(),
      removed.map((name) => `Deleted ${name}`).sort(),
    )
    const names = await readdir(root)
    for (const name of removed) assert.equal(names.includes(name), false, name)
    for (const name of retained) assert.ok(names.includes(name), name)
    assert.equal(await readFile(peerFile, "utf8"), "Peer report")
    assert.equal(
      await runCommand(["delete-reports", target], f.runtime, f.options),
      1,
    )
    assert.ok(
      f.errors
        .at(-1)
        ?.includes(`No audit, vet or rebuttal report of ${target}`),
      f.errors.join("\n"),
    )
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })
}
