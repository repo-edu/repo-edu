import assert from "node:assert/strict"
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { runCommand } from "../command.js"
import { roundRun, testSettings } from "./configured-runner.js"
import { selections, testContext } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

for (const working of ["repo-edu", "plan"] as const) {
  test(`manual phases at ${working} continue from one report with each session's actual tag`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
    )
    const root = f.runtime.cwd
    const invoke = async (args: string[]) => {
      f.visible.length = 0
      assert.equal(
        await runCommand(args, f.runtime, f.options),
        0,
        f.errors.join("\n"),
      )
      return [...f.visible]
    }
    const [claim, report] = await invoke([
      "name",
      "example.md",
      "--auditor",
      "oux",
    ])
    assert.match(report, /-01-1-audit\.oux\.md$/)
    await writeFile(report, "Audit from a manual session")
    const start = basename(report).replace("-1-audit.oux.md", "")
    // Existing files from another round, scope and root must not supply this round's inputs.
    for (const name of [
      "other-01-2-vet.ath.md",
      `${start}0-2-vet.ath.md`,
      `${start}-extra-01-2-vet.ath.md`,
      `${start}-2-vet.ath.log`,
    ])
      await writeFile(join(root, name), "Unrelated")
    await mkdir(join(root, `${start}-2-vet.atx.md`))
    await writeFile(
      join(
        working === "plan" ? f.repoRoot : f.planRoot,
        `${start}-2-vet.ath.md`,
      ),
      "Peer",
    )
    const paths = async (args: string[]): Promise<string[]> =>
      JSON.parse((await invoke(["paths", ...args]))[0])
    const vet = await paths(["vet", basename(report), "--writer", "abl"])
    assert.deepEqual(vet, [report, join(root, `${start}-2-vet.abl.md`)])
    await writeFile(vet[1], "1. [B] Revise")
    // A fresh rebuttal session can use a different tier and effort from its audit.
    const rebut = await paths(["rebut", report, "--writer", "otm"])
    assert.deepEqual(rebut, [
      report,
      vet[1],
      join(root, `${start}-3-rebut.otm.md`),
    ])
    await writeFile(rebut[2], "1. [B] Agree")
    assert.deepEqual(await paths(["fix", report]), [report, vet[1], rebut[2]])
    assert.equal(await readFile(claim, "utf8"), "")
    assert.deepEqual(
      (await readdir(root)).filter((name) => name.endsWith("-claim.md")),
      [basename(claim)],
    )
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })

  test(`bare manual phases discover eligible inputs only at ${working}`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
    )
    const root = f.runtime.cwd
    const peer = working === "plan" ? f.repoRoot : f.planRoot
    const report = join(root, "task-modifier-05-1-audit.ath.md")
    const ownReport = join(root, "other-06-1-audit.oux.md")
    const transcript = join(root, "task-modifier-05-0-round.ath.md")
    for (const file of [
      report,
      ownReport,
      transcript,
      join(root, "task-modifier-06-claim.md"),
      join(root, "other-07-1-audit.ath.log"),
      join(root, "other-07-2-audit.ath.md"),
      join(root, "other-audit.md"),
      join(peer, "peer-08-1-audit.ath.md"),
      join(peer, "peer-08-0-round.ath.md"),
    ])
      await writeFile(file, "Existing document")
    await mkdir(join(root, "directory-09-1-audit.atx.md"))
    const before = await readdir(root, { recursive: true })
    const paths = async (args: string[]): Promise<string[]> => {
      f.visible.length = 0
      assert.equal(
        await runCommand(["paths", ...args], f.runtime, f.options),
        0,
        f.errors.join("\n"),
      )
      return JSON.parse(f.visible[0])
    }
    const vet = join(root, "task-modifier-05-2-vet.oth.md")
    assert.deepEqual(await paths(["vet", "--writer", "oth"]), [report, vet])
    assert.deepEqual(await paths(["vet", "--writer", "atl"]), [
      ownReport,
      join(root, "other-06-2-vet.atl.md"),
    ])
    assert.deepEqual(await paths(["brief", "--writer", "oul"]), [
      transcript,
      join(root, "task-modifier-05-5-brief.oul.md"),
    ])
    assert.deepEqual(await readdir(root, { recursive: true }), before)
    await writeFile(vet, "1. [B] Revise")
    const rebut = join(root, "task-modifier-05-3-rebut.abx.md")
    assert.deepEqual(await paths(["rebut", "--writer", "abx"]), [
      report,
      vet,
      rebut,
    ])
    await writeFile(rebut, "1. [B] Agree")
    await unlink(ownReport)
    assert.deepEqual(await paths(["fix"]), [report, vet, rebut])
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })
}

for (const phase of ["vet", "rebut", "fix", "brief"] as const) {
  test(`bare ${phase} reports missing and ambiguous inputs without picking the newest`, async (t) => {
    const f = await roundFixture(t)
    const inputKind = phase === "brief" ? "0-round" : "1-audit"
    const tag = phase === "vet" ? "ath" : "otm"
    const files = ["first-01", "second-02"].map((start) =>
      join(f.repoRoot, `${start}-${inputKind}.${tag}.md`),
    )
    const invoke = async (input?: string) => {
      f.visible.length = 0
      f.errors.length = 0
      return runCommand(
        [
          "paths",
          phase,
          ...(input === undefined ? [] : [input]),
          "--writer",
          "oth",
        ],
        f.runtime,
        f.options,
      )
    }
    assert.equal(await invoke(), 1)
    assert.match(f.errors[0], /No eligible/)
    for (const file of files) await writeFile(file, "Input")
    assert.equal(await invoke(), 1)
    assert.match(f.errors[0], /Several eligible/)
    for (const file of files) assert.ok(f.errors[0].includes(file))
    if (phase === "rebut")
      await writeFile(join(f.repoRoot, "first-01-2-vet.ath.md"), "Vet")
    assert.equal(await invoke(files[0]), 0, f.errors.join("\n"))
    assert.equal(JSON.parse(f.visible[0])[0], files[0])
  })
}

test("manual resolution reuses runner filenames without writes or assistant discovery", async (t) => {
  const f = await roundFixture(t)
  const run = await roundRun(
    { ...testContext(f.repoRoot), commits: ["abc123..def456"] },
    0,
    selections,
  )
  await writeFile(run.documents.report, "Audit")
  await writeFile(run.documents.vet, "Vet")
  await writeFile(run.paths.markdown, "Transcript")
  assert.ok(run.documents.brief)
  const before = await readdir(f.repoRoot, { recursive: true })
  for (const [args, expected] of [
    [
      ["vet", run.documents.report, "--writer", "abx"],
      [run.documents.report, run.documents.vet],
    ],
    [
      ["rebut", run.documents.report, "--writer", "oth"],
      [run.documents.report, run.documents.vet, run.documents.rebut],
    ],
    [
      ["fix", run.documents.report],
      [run.documents.report, run.documents.vet],
    ],
    [
      ["brief", run.paths.markdown, "--writer", "oul"],
      [run.paths.markdown, run.documents.brief],
    ],
  ]) {
    f.visible.length = 0
    assert.equal(
      await runCommand(["paths", ...args], f.runtime, f.options),
      0,
      f.errors.join("\n"),
    )
    assert.deepEqual(JSON.parse(f.visible[0]), expected)
  }
  // The manual brief records its own session, even when configured brief settings differ.
  f.visible.length = 0
  assert.equal(
    await runCommand(
      ["paths", "brief", run.paths.markdown, "--writer", "atx"],
      { ...f.runtime, cwd: f.planRoot },
      { ...f.options, settings: testSettings },
    ),
    0,
  )
  assert.deepEqual(JSON.parse(f.visible[0]), [
    run.paths.markdown,
    join(f.repoRoot, `${run.nameStart}-5-brief.atx.md`),
  ])
  assert.deepEqual(await readdir(f.repoRoot, { recursive: true }), before)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("missing or ambiguous twins are resolved explicitly without selecting another round", async (t) => {
  const f = await roundFixture(t)
  const report = join(f.repoRoot, "example-all-01-1-audit.oth.md")
  await writeFile(report, "Audit")
  const invoke = async (args: string[]) => {
    f.visible.length = 0
    f.errors.length = 0
    return runCommand(["paths", ...args], f.runtime, f.options)
  }
  assert.equal(await invoke(["fix", report]), 0)
  assert.deepEqual(JSON.parse(f.visible[0]), [report])
  assert.equal(await invoke(["rebut", report, "--writer", "oth"]), 1)
  assert.match(f.errors[0], /No vet file/)
  const vets = ["abl", "ath"].map((tag) =>
    join(f.repoRoot, `example-all-01-2-vet.${tag}.md`),
  )
  for (const file of vets) await writeFile(file, "Vet")
  assert.equal(await invoke(["rebut", report, "--writer", "oth"]), 1)
  for (const file of vets) assert.ok(f.errors[0].includes(file))
  assert.equal(
    await invoke(["rebut", report, "--writer", "oth", "--vet", vets[1]]),
    0,
  )
  assert.equal(JSON.parse(f.visible[0])[1], vets[1])
  const rebuts = ["otm", "oux"].map((tag) =>
    join(f.repoRoot, `example-all-01-3-rebut.${tag}.md`),
  )
  for (const file of rebuts) await writeFile(file, "Rebuttal")
  assert.equal(await invoke(["fix", report, "--vet", vets[0]]), 1)
  for (const file of rebuts) assert.ok(f.errors[0].includes(file))
  assert.equal(
    await invoke(["fix", report, "--vet", vets[0], "--rebut", rebuts[1]]),
    0,
  )
  assert.deepEqual(JSON.parse(f.visible[0]), [report, vets[0], rebuts[1]])
  const other = join(f.repoRoot, "example-all-02-2-vet.ath.md")
  await writeFile(other, "Other round")
  assert.equal(
    await invoke(["rebut", report, "--writer", "oth", "--vet", other]),
    1,
  )
  assert.match(f.errors[0], /another round/)
  assert.equal(await invoke(["vet", report]), 1)
  assert.match(f.errors[0], /needs --writer/)
  assert.equal(await invoke(["vet", report, "--writer", "o"]), 2)
  assert.equal(await invoke(["vet", vets[0], "--writer", "oth"]), 1)
  assert.match(f.errors[0], /1-audit/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})
