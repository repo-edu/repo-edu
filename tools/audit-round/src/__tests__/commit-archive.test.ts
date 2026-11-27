import assert from "node:assert/strict"
import { readdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { archiveSeries, restoreSeries } from "../evidence.js"
import { replayRows } from "../replay.js"
import {
  seriesArchiveFolder,
  seriesFile,
  splitFolder,
  splitLabel,
} from "../round-paths.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { evidencePending, fixture } from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

type Fixture = Awaited<ReturnType<typeof roundFixture>>

const singleAuditorSettings = {
  ...testSettings,
  implementationAudit: {
    ...testSettings.implementationAudit,
    auditors: [testSettings.implementationAudit.auditors[0]],
  },
}

/** One folder's files of one series, sorted. */
async function seriesFiles(folder: string, label: string): Promise<string[]> {
  try {
    return (await readdir(folder))
      .filter((name) => seriesFile(label, name))
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function headLabel(f: Fixture): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "HEAD"], {
    cwd: f.repoRoot,
  })
  return `commit-${stdout.slice(0, 6)}`
}

async function roundCommits(
  f: Fixture,
  args: readonly string[],
  settings: typeof testSettings = singleAuditorSettings,
): Promise<number> {
  return runCommand(["round-commits", ...args, "--no-watch"], f.runtime, {
    ...f.options,
    settings,
  })
}

test("a series file is read whole past its label, so a neighbouring label never matches", () => {
  const label = "commit-abcdef"
  for (const name of [
    "commit-abcdef-01-0-claim.md",
    "commit-abcdef-01-1-round.obx.log",
    "commit-abcdef-12-3-vet.abx.md",
    "commit-abcdef-12-3-vet.gbx.md",
    "commit-abcdef-queue.md",
    "commit-abcdef-handoff.123abc.md",
    "commit-abcdef-rounds.json",
  ])
    assert.equal(seriesFile(label, name), true, name)
  for (const name of [
    "commit-abcdef+123456-01-0-claim.md",
    "commit-abcdef..123456-rounds.json",
    "commit-abcdef+123456-queue.md",
    "commit-abcdef-notes.md",
    "example-plan-audit-01-0-claim.md",
  ])
    assert.equal(seriesFile(label, name), false, name)
})

test("a split label and folder keep a source's split files separate from commit series", () => {
  const label = splitLabel("packages/domain/src/roster.ts")
  assert.equal(label, "split-roster.ts-58b58")
  assert.equal(
    splitFolder("/evidence", label),
    join("/evidence", "splits", label),
  )
  assert.equal(
    splitLabel("a+b/c%d.ts"),
    "split-c%25d.ts-977a1",
    "the name is percent-encoded and the folders show only in the hash",
  )
  assert.notEqual(
    splitLabel("packages/other/src/roster.ts"),
    label,
    "the hash tells same-named files apart",
  )
  for (const name of [
    `${label}-design-01.otx.md`,
    `${label}-design-02.gbh.md`,
    `${label}-pick-01.atx.md`,
    `${label}-designs.json`,
    `${label}-split.log`,
    "split-rosterXts-58b58-rounds.json",
    "split-roster.tsx-9fc30-01-0-claim.md",
    "split-roster.ts-58b58.bak-12345-split.log",
  ])
    assert.equal(seriesFile(label, name), false, name)
})

test("archive and restore move only the labelled commit files, even when cut short", async (t) => {
  const f = await fixture(t)
  const { evidenceRoot, roundRoot } = f.runtime
  const label = "commit-abcdef"
  const neighbour = "commit-abcdef+123456-01-0-claim.md"
  const own = [
    `${label}-01-0-claim.md`,
    `${label}-01-2-audit.obx.md`,
    `${label}-queue.md`,
    `${label}-rounds.json`,
  ]
  for (const name of [...own, neighbour])
    await writeFile(join(roundRoot, name), name)

  const archived = await archiveSeries(evidenceRoot, roundRoot, label)
  const folder = seriesArchiveFolder(evidenceRoot, label)
  assert.equal(folder, join(evidenceRoot, "commits", label))
  assert.equal(archived.folder, folder)
  assert.deepEqual(archived.names, own)
  assert.deepEqual(await seriesFiles(folder, label), own)
  assert.deepEqual(await readdir(roundRoot), [neighbour])

  // A move cut short leaves part of the series in each folder.
  for (const name of own.slice(0, 2))
    await rename(join(folder, name), join(roundRoot, name))
  const restored = await restoreSeries(evidenceRoot, roundRoot, label)
  assert.deepEqual(restored.names, own.slice(2))
  assert.deepEqual(await seriesFiles(roundRoot, label), own)
  for (const name of own)
    assert.equal(await readFile(join(roundRoot, name), "utf8"), name)
  await assert.rejects(readdir(folder), { code: "ENOENT" })
  assert.deepEqual(
    (await restoreSeries(evidenceRoot, roundRoot, label)).names,
    [],
  )
})

test("an automatic stop archives the whole series and its evidence commit records the move", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  const label = await headLabel(f)
  const neighbour = `${label}+abcdef-01-0-claim.md`
  await writeFile(join(f.roundRoot, neighbour), "")

  assert.equal(
    await roundCommits(f, ["HEAD"]),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const folder = seriesArchiveFolder(f.evidenceRoot, label)
  const archived = await seriesFiles(folder, label)
  assert.deepEqual(await seriesFiles(f.roundRoot, label), [])
  assert.ok(archived.includes(`${label}-rounds.json`))
  assert.ok(archived.includes(`${label}-01-0-claim.md`))
  assert.ok((await readdir(f.roundRoot)).includes(neighbour))
  const moved = `Moved ${archived.length} round files of ${label} to ${folder}.`
  assert.ok(f.visible.includes(moved), f.visible.join("\n"))
  // The log's last lines follow the moved file.
  const log = archived.find((name) => name.endsWith(".log")) as string
  assert.match(await readFile(join(folder, log), "utf8"), new RegExp(label))
  assert.ok(
    (await readFile(join(folder, log), "utf8")).includes(moved),
    "the archive line lands in the moved log",
  )
  assert.deepEqual(await evidencePending(f.evidenceRoot), [])
  const { stdout } = await execa("git", ["ls-files", `commits/${label}`], {
    cwd: f.evidenceRoot,
  })
  assert.equal(stdout.split("\n").length, archived.length)
})

test("a manual queue that runs out archives the series with its queue", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  const label = await headLabel(f)
  assert.equal(
    await runCommand(
      ["round-commits", "HEAD", "--auditor", "codex", "--no-watch"],
      f.runtime,
      f.options,
    ),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  assert.deepEqual(await seriesFiles(f.roundRoot, label), [])
  assert.ok(
    (
      await seriesFiles(seriesArchiveFolder(f.evidenceRoot, label), label)
    ).includes(`${label}-queue.md`),
  )
})

test("a series that reaches its maximum with another auditor due stays active", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  const label = await headLabel(f)
  assert.equal(
    await roundCommits(f, ["HEAD"], {
      ...testSettings,
      maximumAutomaticRounds: 1,
    }),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  assert.match(f.visible.join("\n"), /reached its maximum of 1 round\./)
  assert.ok((await seriesFiles(f.roundRoot, label)).length > 0)
  assert.deepEqual(
    await seriesFiles(seriesArchiveFolder(f.evidenceRoot, label), label),
    [],
  )
})

test("a failed round and a pending ruling leave the series active", async (t) => {
  for (const ending of ["failed", "ruling"] as const) {
    const f = await roundFixture(t, "codex", "repo-edu", ending === "ruling")
    if (ending === "failed") {
      f.phases.fix = { stream: "", exitCode: 7 }
      await f.configure({ phases: f.phases })
    }
    const label = await headLabel(f)
    await roundCommits(f, ["HEAD"])
    assert.ok((await seriesFiles(f.roundRoot, label)).length > 0, ending)
    assert.deepEqual(
      await seriesFiles(seriesArchiveFolder(f.evidenceRoot, label), label),
      [],
      ending,
    )
  }
})

test("a rerun restores the archived series, reads its earlier fix, takes the next number and archives it again", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  await commitFixture(f.repoRoot, "Original newest commit")
  const original = await Promise.all(
    ["HEAD~1", "HEAD"].map(
      async (revision) =>
        (await execa("git", ["rev-parse", revision], { cwd: f.repoRoot }))
          .stdout,
    ),
  )
  const label = `commit-${original[0].slice(0, 6)}..${original[1].slice(0, 6)}`
  const folder = seriesArchiveFolder(f.evidenceRoot, label)
  assert.equal(
    await roundCommits(f, original),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  const first = await seriesFiles(folder, label)
  const firstContents = await Promise.all(
    first.map((name) => readFile(join(folder, name), "utf8")),
  )

  // Replay reads the series in place, wherever it lives.
  const roots = {
    ...f.runtime,
    repoEduRoot: f.repoRoot,
    planRoot: f.planRoot,
    activeRoot: f.activeRoot,
    evidenceRoot: f.evidenceRoot,
    roundRoot: f.roundRoot,
  }
  const archivedRows = await replayRows(roots)
  assert.ok(archivedRows.some((row) => row.target === label))
  await restoreSeries(f.evidenceRoot, f.roundRoot, label)
  assert.deepEqual(await replayRows(roots), archivedRows)
  await archiveSeries(f.evidenceRoot, f.roundRoot, label)
  assert.deepEqual(await replayRows(roots), archivedRows)

  // An archive cut short leaves its first files in the round folder.
  for (const name of first.slice(0, 2))
    await rename(join(folder, name), join(f.roundRoot, name))

  assert.equal(
    await roundCommits(f, original),
    0,
    `${f.errors.join("\n")}\n${f.visible.join("\n")}`,
  )
  assert.deepEqual(await seriesFiles(f.roundRoot, label), [])
  const second = await seriesFiles(folder, label)
  assert.ok(second.includes(`${label}-02-0-claim.md`))
  assert.equal(second.includes(`${label}-03-0-claim.md`), false)
  for (const [index, name] of first.entries()) {
    assert.ok(second.includes(name), name)
    if (!name.endsWith("-rounds.json") && !name.endsWith(".log"))
      assert.equal(
        await readFile(join(folder, name), "utf8"),
        firstContents[index],
        name,
      )
  }
  const data = JSON.parse(
    await readFile(join(folder, `${label}-rounds.json`), "utf8"),
  ) as {
    rounds: {
      round: number
      commits: { sha: string }[]
      groups: { commits: string[] }[]
    }[]
  }
  assert.deepEqual(
    data.rounds.map((round) => round.round),
    [1, 2],
  )
  const retainedFix = data.rounds[0]?.commits[0]?.sha
  assert.ok(retainedFix)
  assert.deepEqual(data.rounds[1]?.groups[0]?.commits, [
    ...original,
    retainedFix,
  ])
  const restoredLine = f.visible.find((line) =>
    line.startsWith(`Moved ${first.length - 2} round files of ${label} to `),
  )
  assert.ok(restoredLine, f.visible.join("\n"))
  assert.ok(restoredLine.endsWith(`${f.roundRoot}.`))

  // Replay gives the same rows before and after the archive moves them.
  const rows = await replayRows(roots)
  await restoreSeries(f.evidenceRoot, f.roundRoot, label)
  assert.deepEqual(await replayRows(roots), rows)
})
