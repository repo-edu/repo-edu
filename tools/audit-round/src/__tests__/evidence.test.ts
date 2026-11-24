import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { basename, join, relative, sep } from "node:path"
import { test } from "node:test"
import { execa } from "execa"
import { runCommand } from "./configured-runner.js"
import {
  evidencePending,
  evidenceSubjects,
  finishedText,
  phaseStream,
  recorded,
} from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

type Fixture = Awaited<ReturnType<typeof roundFixture>>

const roundCommand = ["round", "example.md", "1", "--auditor", "o"]

/** The evidence checkout's tracked paths below its round folder. */
async function tracked(f: Fixture): Promise<string[]> {
  const { stdout } = await execa("git", ["ls-files", "active"], {
    cwd: f.evidenceRoot,
  })
  return stdout.split("\n").map((path) => basename(path))
}

test("a finished round ends with one evidence commit holding every file it wrote", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  assert.equal(
    await runCommand(roundCommand, f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [
    "audit-round round example.md 1 --auditor o",
  ])
  assert.deepEqual(await evidencePending(f.evidenceRoot), [])
  const files = await tracked(f)
  for (const name of await f.roundFiles()) assert.ok(files.includes(name))
  assert.ok(files.includes("example-impl-rounds.json"))
})

test("a failed round commits its retained files and keeps its exit code", async (t) => {
  const f = await roundFixture(t)
  f.phases.fix = { stream: "", exitCode: 7 }
  await f.configure({ phases: f.phases })
  assert.equal(await runCommand(roundCommand, f.runtime, f.options), 1)
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [
    "audit-round round example.md 1 --auditor o",
  ])
  assert.deepEqual(await evidencePending(f.evidenceRoot), [])
  const files = await tracked(f)
  assert.ok(files.includes(basename(f.report)))
  for (const name of await f.roundFiles()) assert.ok(files.includes(name))
})

test("each ruling is committed before its wait, so a replaced ruling keeps its first version", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  let asked = 0
  const code = await runCommand(roundCommand, f.runtime, {
    ...f.options,
    awaitAnswer: async () => {
      asked += 1
      if (asked > 1) return null
      // The resumed fix leaves a further open decision in the same file.
      await f.configure({
        phases: {
          ...f.phases,
          fix: {
            ...(f.phases.fix as Record<string, unknown>),
            document: { text: "Second ruling by fix" },
          },
        },
      })
      return { rulings: [], choices: [], reply: "Choose option 1." }
    },
  })
  assert.equal(code, 0, f.errors.join("\n"))
  assert.equal(asked, 2)
  // Git names a tree path with forward slashes on every platform.
  const ruling = relative(f.evidenceRoot, f.ruling).split(sep).join("/")
  const versions = (
    await execa("git", ["log", "--format=%H", "--", ruling], {
      cwd: f.evidenceRoot,
    })
  ).stdout.split("\n")
  assert.equal(versions.length, 2)
  const text = async (sha: string | undefined) =>
    (
      await execa("git", ["show", `${sha}:${ruling}`], {
        cwd: f.evidenceRoot,
      })
    ).stdout
  assert.equal(await text(versions.at(-1)), "Written ruling by fix")
  assert.equal(await text(versions[0]), "Second ruling by fix")
  const subjects = await evidenceSubjects(f.evidenceRoot)
  assert.equal(
    subjects.filter((subject) =>
      /^audit-round round example\.md 1 --auditor o: before the ruling wait of Implementation audit of .+, step 1 \(round 1\)$/.test(
        subject,
      ),
    ).length,
    2,
  )
  assert.equal(subjects[0], "audit-round round example.md 1 --auditor o")
  assert.deepEqual(await evidencePending(f.evidenceRoot), [])
})

test("a step run commits its log and transcript", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    null,
    false,
    "repo-edu",
    false,
    false,
    false,
  )
  await commitFixture(
    f.planRoot,
    "example/ready: assign the coder\n\nCoder: codex gpt-5.6-sol xhigh",
  )
  f.phases.implement = {
    commits: [
      {
        cwd: f.repoRoot,
        subject: "example/impl-1 obx feat(audit-round): implement fixture",
      },
    ],
    stream: await phaseStream("codex", finishedText, "implementation-session"),
    usage: {
      path: `${f.root}/rollout-implementation-session.jsonl`,
      text: await recorded("codex-rollout.jsonl"),
    },
  }
  await f.configure({ phases: f.phases })
  assert.equal(
    await runCommand(["implement", "example"], f.runtime, f.options),
    0,
    [...f.errors, ...f.visible].join("\n"),
  )
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [
    "audit-round implement example",
  ])
  assert.deepEqual(await evidencePending(f.evidenceRoot), [])
  const files = await tracked(f)
  assert.ok(files.includes("example-impl-01-implement.log"))
  assert.ok(files.includes("example-impl-01-implement.md"))
})

test("a command that writes no round file commits nothing and leaves a pending file for the next writer", async (t) => {
  const f = await roundFixture(t)
  await writeFile(join(f.roundRoot, "example-yield-1-report.abx.md"), "Yield\n")
  assert.equal(
    await runCommand(["plan"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [])
  assert.ok(
    (await evidencePending(f.evidenceRoot)).some((line) =>
      line.endsWith("example-yield-1-report.abx.md"),
    ),
  )
  assert.equal(
    await runCommand(["mark", "reopen", "example"], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [
    "audit-round mark reopen example",
  ])
  assert.deepEqual(await evidencePending(f.evidenceRoot), [])
  const files = await tracked(f)
  assert.ok(files.includes("example-yield-1-report.abx.md"))
  assert.ok(files.includes("example-plan-audit-01-0-reopen.md"))
  // A writer refused before it wrote anything finds nothing to commit.
  assert.equal(
    await runCommand(["mark", "reopen", "missing"], f.runtime, f.options),
    1,
  )
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [
    "audit-round mark reopen example",
  ])
})

test("a writer refused for its arguments commits nothing and leaves a pending file for the next writer", async (t) => {
  const f = await roundFixture(t)
  await writeFile(join(f.roundRoot, "example-yield-1-report.abx.md"), "Yield\n")
  for (const argv of [
    ["round", "example.md", "0"],
    ["round", "../plan/example.md", "1"],
  ])
    assert.equal(await runCommand(argv, f.runtime, f.options), 2)
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [])
  assert.ok(
    (await evidencePending(f.evidenceRoot)).some((line) =>
      line.endsWith("example-yield-1-report.abx.md"),
    ),
  )
})

test("a failed evidence commit warns and leaves the command's result and files as they were", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", false, "c")
  // Another Git process holding the index refuses every staging step.
  await writeFile(join(f.evidenceRoot, ".git/index.lock"), "")
  assert.equal(await runCommand(roundCommand, f.runtime, f.options), 0)
  assert.match(
    f.errors.join("\n"),
    /^Warning: the evidence commit failed; the next command that writes a round file commits these files\. .*index\.lock/ms,
  )
  assert.deepEqual(await evidenceSubjects(f.evidenceRoot), [])
  const pending = await evidencePending(f.evidenceRoot)
  for (const name of await f.roundFiles())
    assert.ok(pending.some((line) => line.endsWith(name)))
})
