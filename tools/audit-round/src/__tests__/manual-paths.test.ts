import assert from "node:assert/strict"
import {
  mkdir,
  readdir,
  readFile,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises"
import { basename, join } from "node:path"
import { test } from "node:test"
import { runCommand } from "../command.js"
import { roundRun } from "./configured-runner.js"
import { selections, testContext } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

for (const working of ["repo-edu", "plan"] as const) {
  test(`manual routing from ${working} follows the report opening rather than its target name or judged repos`, async (t) => {
    const f = await roundFixture(
      t,
      "codex",
      "plan",
      false,
      null,
      false,
      working,
    )
    for (const [opening, name, cwd] of [
      ["Planning round workflow", "example-impl-01..01", f.planRoot],
      ["Implementation audit workflow", "example", f.repoRoot],
    ]) {
      const report = `${name}-01-2-audit.oth.md`
      await writeFile(
        join(f.planRoot, report),
        `# ${opening}\n\nJudged repos: plan@abc123\n`,
      )
      for (const phase of ["vet", "rebut", "fix"]) {
        await writeFile(join(f.planRoot, `${name}-01-3-vet.ath.md`), "Vet")
        f.visible.length = 0
        assert.equal(
          await runCommand(
            [
              "paths",
              phase,
              report,
              "--writer",
              phase === "vet" ? "ath" : "oth",
            ],
            f.runtime,
            f.options,
          ),
          0,
          f.errors.join("\n"),
        )
        const route = JSON.parse(f.visible[0])
        assert.equal(route.cwd, cwd)
        assert.equal(
          route.workflow,
          join(cwd, `.agents/skills/${phase}/references/workflow.md`),
        )
        assert.equal(route.arguments[0], join(f.planRoot, report))
      }
    }
    const report = "unknown-01-2-audit.oth.md"
    await writeFile(
      join(f.planRoot, report),
      "Judged repos: plan@abc123\n\n## Findings\n\nNo findings.",
    )
    assert.equal(
      await runCommand(["paths", "fix", report], f.runtime, f.options),
      1,
    )
    assert.match(f.errors.at(-1) ?? "", /Report opening must name/)
  })
}

for (const working of ["repo-edu", "plan"] as const) {
  test(`manual phases at ${working} continue from one report with each session's actual tag`, async (t) => {
    // The plan has no landed step, so its name alone claims a planning round.
    const f = await roundFixture(
      t,
      "codex",
      working,
      false,
      null,
      false,
      working,
      false,
      false,
      false,
    )
    const root = f.planRoot
    const invoke = async (args: string[]) => {
      f.visible.length = 0
      assert.equal(
        await runCommand(args, f.runtime, f.options),
        0,
        f.errors.join("\n"),
      )
      return [...f.visible]
    }
    const [named] = await invoke(["name", "example.md", "--auditor", "oux"])
    const {
      claim,
      arguments: [report],
    } = JSON.parse(named)
    assert.match(report, /-01-2-audit\.oux\.md$/)
    await writeFile(
      report,
      "# Planning round workflow\n\nJudged repos: plan@abc123",
    )
    const start = basename(report).replace("-2-audit.oux.md", "")
    // Existing files from another round, scope and root must not supply this round's inputs.
    for (const name of [
      "other-01-3-vet.ath.md",
      `${start}0-3-vet.ath.md`,
      `${start}-extra-01-3-vet.ath.md`,
      `${start}-3-vet.ath.log`,
    ])
      await writeFile(join(root, name), "Unrelated")
    await mkdir(join(root, `${start}-3-vet.atx.md`))
    await writeFile(join(f.repoRoot, `${start}-3-vet.ath.md`), "Peer")
    const paths = async (args: string[]): Promise<string[]> =>
      JSON.parse((await invoke(["paths", ...args]))[0]).arguments
    const vet = await paths(["vet", basename(report), "--writer", "abl"])
    assert.deepEqual(vet, [report, join(root, `${start}-3-vet.abl.md`)])
    await writeFile(vet[1], "1. [B] Revise")
    // A fresh rebuttal session can use a different tier and effort from its audit.
    const rebut = await paths(["rebut", basename(report), "--writer", "otm"])
    assert.deepEqual(rebut, [
      report,
      vet[1],
      join(root, `${start}-4-rebut.otm.md`),
    ])
    await writeFile(rebut[2], "1. [B] Agree")
    assert.deepEqual(await paths(["fix", basename(report)]), [
      report,
      vet[1],
      rebut[2],
    ])
    assert.equal(await readFile(claim, "utf8"), "")
    assert.deepEqual(
      (await readdir(root)).filter((name) => name.endsWith("-0-claim.md")),
      [basename(claim)],
    )
    await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
      code: "ENOENT",
    })
  })

  test(`bare manual phases discover plan-root inputs from ${working}`, async (t) => {
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
    const peer = f.repoRoot
    const report = join(root, "task-modifier-05-2-audit.ath.md")
    const ownReport = join(root, "other-06-2-audit.oux.md")
    const transcript = join(root, "task-modifier-05-1-round.ath.md")
    for (const file of [
      report,
      ownReport,
      transcript,
      join(root, "task-modifier-06-0-claim.md"),
      join(root, "other-07-2-audit.ath.log"),
      join(root, "other-07-1-audit.ath.md"),
      join(root, "other-audit.md"),
      join(peer, "peer-08-2-audit.ath.md"),
      join(peer, "peer-08-1-round.ath.md"),
    ])
      await writeFile(
        file,
        file.includes("1-round")
          ? "# Plan audit of example"
          : "# Implementation audit workflow\n\nJudged repos: plan@abc123",
      )
    await mkdir(join(root, "directory-09-2-audit.atx.md"))
    const before = await readdir(root, { recursive: true })
    const paths = async (args: string[]): Promise<string[]> => {
      f.visible.length = 0
      assert.equal(
        await runCommand(["paths", ...args], f.runtime, f.options),
        0,
        f.errors.join("\n"),
      )
      return JSON.parse(f.visible[0]).arguments
    }
    const vet = join(root, "task-modifier-05-3-vet.oth.md")
    assert.deepEqual(await paths(["vet", "--writer", "oth"]), [report, vet])
    assert.deepEqual(await paths(["vet", "--writer", "atl"]), [
      ownReport,
      join(root, "other-06-3-vet.atl.md"),
    ])
    assert.deepEqual(await readdir(root, { recursive: true }), before)
    await writeFile(vet, "1. [B] Revise")
    const rebut = join(root, "task-modifier-05-4-rebut.abx.md")
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

for (const phase of ["vet", "rebut", "fix"] as const) {
  test(`bare ${phase} reports a missing input and picks the newest eligible report`, async (t) => {
    const f = await roundFixture(t)
    const tag = phase === "vet" ? "ath" : "otm"
    const files = ["first-01", "second-02"].map((start) =>
      join(f.planRoot, `${start}-2-audit.${tag}.md`),
    )
    const invoke = async (input?: string) => {
      f.visible.length = 0
      f.errors.length = 0
      return runCommand(
        [
          "paths",
          phase,
          ...(input === undefined ? [] : [basename(input)]),
          "--writer",
          "oth",
        ],
        f.runtime,
        f.options,
      )
    }
    assert.equal(await invoke(), 1)
    assert.match(f.errors[0], /No eligible/)
    for (const file of files) {
      await writeFile(file, "# Implementation audit workflow")
      if (phase === "rebut")
        await writeFile(file.replace("-2-audit.otm", "-3-vet.ath"), "Vet")
    }
    // The later name carries the earlier date, so the date decides rather than the name.
    await utimes(files[1], 1_000, 1_000)
    assert.equal(await invoke(), 0, f.errors.join("\n"))
    assert.equal(JSON.parse(f.visible[0]).arguments[0], files[0])
    assert.equal(await invoke(files[1]), 0, f.errors.join("\n"))
    assert.equal(JSON.parse(f.visible[0]).arguments[0], files[1])
  })
}

test("manual resolution reuses runner filenames without writes or assistant discovery", async (t) => {
  const f = await roundFixture(t)
  const run = await roundRun(
    { ...testContext(f.repoRoot), commits: ["abc123..def456"] },
    0,
    selections,
  )
  await writeFile(run.documents.report, "# Implementation audit workflow")
  await writeFile(run.documents.vet, "Vet")
  const before = await readdir(f.planRoot, { recursive: true })
  for (const [args, expected] of [
    [
      ["vet", basename(run.documents.report), "--writer", "abx"],
      [run.documents.report, run.documents.vet],
    ],
    [
      ["rebut", basename(run.documents.report), "--writer", "oth"],
      [run.documents.report, run.documents.vet, run.documents.rebut],
    ],
    [
      ["fix", basename(run.documents.report)],
      [run.documents.report, run.documents.vet],
    ],
  ]) {
    f.visible.length = 0
    assert.equal(
      await runCommand(["paths", ...args], f.runtime, f.options),
      0,
      f.errors.join("\n"),
    )
    assert.deepEqual(JSON.parse(f.visible[0]).arguments, expected)
  }
  assert.deepEqual(await readdir(f.planRoot, { recursive: true }), before)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})

test("several twins resolve to the round's newest unless one is selected", async (t) => {
  const f = await roundFixture(t)
  const report = join(f.planRoot, "example-impl-all-01-2-audit.oth.md")
  await writeFile(report, "# Implementation audit workflow")
  const invoke = async (args: string[]) => {
    f.visible.length = 0
    f.errors.length = 0
    return runCommand(["paths", ...args], f.runtime, f.options)
  }
  assert.equal(await invoke(["fix", basename(report)]), 0)
  assert.deepEqual(JSON.parse(f.visible[0]).arguments, [report])
  assert.equal(await invoke(["rebut", basename(report), "--writer", "oth"]), 1)
  assert.match(f.errors[0], /No vet file/)
  const vets = ["abl", "ath"].map((tag) =>
    join(f.planRoot, `example-impl-all-01-3-vet.${tag}.md`),
  )
  const rebuts = ["otm", "oux"].map((tag) =>
    join(f.planRoot, `example-impl-all-01-4-rebut.${tag}.md`),
  )
  for (const file of [...vets, ...rebuts]) await writeFile(file, "Review")
  // The later names carry the earlier dates, so the date decides rather than the name.
  for (const file of [vets[1], rebuts[1]]) await utimes(file, 1_000, 1_000)
  // A newer review of another round never joins this one.
  const other = join(f.planRoot, "example-impl-all-02-3-vet.ath.md")
  await writeFile(other, "Other round")
  assert.equal(
    await invoke(["rebut", basename(report), "--writer", "oth"]),
    0,
    f.errors.join("\n"),
  )
  assert.equal(JSON.parse(f.visible[0]).arguments[1], vets[0])
  assert.equal(await invoke(["fix", basename(report)]), 0)
  assert.deepEqual(JSON.parse(f.visible[0]).arguments, [
    report,
    vets[0],
    rebuts[0],
  ])
  assert.equal(
    await invoke([
      "fix",
      basename(report),
      "--vet",
      basename(vets[1]),
      "--rebut",
      basename(rebuts[1]),
    ]),
    0,
  )
  assert.deepEqual(JSON.parse(f.visible[0]).arguments, [
    report,
    vets[1],
    rebuts[1],
  ])
  assert.equal(
    await invoke([
      "rebut",
      basename(report),
      "--writer",
      "oth",
      "--vet",
      basename(other),
    ]),
    1,
  )
  assert.match(f.errors[0], /another round/)
  assert.equal(await invoke(["vet", basename(report)]), 1)
  assert.match(f.errors[0], /needs --writer/)
  assert.equal(await invoke(["vet", basename(report), "--writer", "o"]), 2)
  assert.equal(await invoke(["vet", basename(vets[0]), "--writer", "oth"]), 1)
  assert.match(f.errors[0], /2-audit/)
  await assert.rejects(readFile(join(f.root, "calls.jsonl")), {
    code: "ENOENT",
  })
})
