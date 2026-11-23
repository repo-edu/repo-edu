import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type TestContext, test } from "node:test"
import { execa } from "execa"
import { check } from "proper-lockfile"
import type { MoveList } from "../move-list.js"
import { implementationPhase } from "../phase.js"
import {
  type DesignOutcome,
  runSplit,
  type SplitDependencies,
  type SplitSeriesEnding,
} from "../split.js"
import type { AttemptReply } from "../split-attempt.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { phaseStream, testContext } from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

const source = "packages/demo/src/source.ts"
const target = "packages/demo/src/target.ts"
const listFile = "splits/packages/demo/src/source.mv.md"
const label = "split-packages+demo+src+source.ts"
const identity = {
  phaseRun: implementationPhase(testSettings.splitAudit.designer),
  tag: "abx",
  record: "claude-opus-5 xhigh",
}

/** One call's input: it waits after its rounds unless the test asks for one flow. */
const input = (context: ReturnType<typeof testContext>, wait = true) => ({
  ...context,
  source,
  identity,
  wait,
})

async function repository(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await execa("git", ["init", "--quiet"], { cwd: root })
  for (const [key, value] of Object.entries({
    "user.name": "Test",
    "user.email": "test@example.test",
    "commit.gpgsign": "false",
    "core.hooksPath": "/dev/null",
  }))
    await execa("git", ["config", key, value], { cwd: root })
}

async function commitAll(root: string, subject: string): Promise<void> {
  await execa("git", ["add", "--all"], { cwd: root })
  await execa("git", ["commit", "--quiet", "--allow-empty", "-m", subject], {
    cwd: root,
  })
}

const git = async (root: string, ...args: string[]) =>
  (await execa("git", args, { cwd: root })).stdout

/** A Repo Edu checkout holding one source file, and an empty plan checkout. */
async function splitFixture(t: TestContext) {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "audit-round-split-")),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const context = testContext(join(directory, "repo-edu"), "split")
  await repository(context.repoEduRoot)
  await mkdir(join(context.repoEduRoot, "packages/demo/src"), {
    recursive: true,
  })
  await writeFile(
    join(context.repoEduRoot, source),
    "export const a = 1\nexport const b = 2\n",
  )
  await commitAll(context.repoEduRoot, "add the source")
  await repository(context.planRoot)
  await commitAll(context.planRoot, "open the plan checkout")
  await mkdir(context.roundRoot, { recursive: true })
  const hash = await git(context.repoEduRoot, "hash-object", "--", source)
  return { context, hash }
}

function listText(hash: string, responsibility = "Holds b."): string {
  return `# Move list

Source: \`${source}\`
Hash: ${hash}
Area: pkg-demo

## Moves

### 1. \`${target}\`

Responsibility: ${responsibility}
Ranges: 2
`
}

function noSplitText(hash: string, result: "fine" | "needs-plan"): string {
  return `# Move list

Source: \`${source}\`
Hash: ${hash}
Area: pkg-demo

## No split

Result: ${result}. The file holds one responsibility.
`
}

const clean: AttemptReply = {
  outcome: "clean",
  files: [
    { path: source, text: "export const a = 1\n", isNew: false },
    { path: target, text: "export const b = 2\n", isNew: true },
  ],
}

type Calls = {
  designs: number
  series: number
  attempts: Extract<MoveList, { kind: "moves" }>[]
  checks: string[]
  messages: string[]
}

/** Dependencies that record each call and answer as the test arranges. */
function dependencies(
  context: ReturnType<typeof testContext>,
  arranged: {
    readonly design?: DesignOutcome | (() => Promise<DesignOutcome>)
    readonly roundsDue?: boolean
    readonly series?: (
      afterRound: () => Promise<boolean>,
    ) => Promise<SplitSeriesEnding>
    readonly attempts?: readonly AttemptReply[]
    readonly checks?: { command: string; output: string } | null
  },
): { readonly calls: Calls; readonly dependencies: SplitDependencies } {
  const calls: Calls = {
    designs: 0,
    series: 0,
    attempts: [],
    checks: [],
    messages: [],
  }
  const replies = [...(arranged.attempts ?? [])]
  // A series that finishes leaves every listed auditor with a current read.
  let due = arranged.roundsDue ?? true
  return {
    calls,
    dependencies: {
      design: async () => {
        calls.designs += 1
        const design = arranged.design
        if (design === undefined) throw new Error("No design was arranged")
        return typeof design === "function" ? design() : design
      },
      roundsDue: async () => due,
      series: async (afterRound) => {
        calls.series += 1
        const ending =
          arranged.series === undefined
            ? "finished"
            : await arranged.series(afterRound)
        if (ending === "finished") due = false
        return ending
      },
      attempt: async (list) => {
        // Every attempt runs under the split lock.
        const gitDir = await git(
          context.repoEduRoot,
          "rev-parse",
          "--absolute-git-dir",
        )
        assert.equal(
          await check(gitDir, {
            lockfilePath: join(gitDir, "audit-round-split.lock"),
            realpath: false,
          }),
          true,
        )
        calls.attempts.push(list)
        return replies.shift() ?? clean
      },
      checks: async (pkg) => {
        calls.checks.push(pkg)
        return arranged.checks ?? null
      },
      message: async (text) => {
        calls.messages.push(text)
      },
    },
  }
}

test("a design that judges the file fine ends the call with no list", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: noSplitText(hash, "fine") },
  })
  const outcome = await runSplit(input(context), deps)
  assert.deepEqual(outcome, {
    status: "result",
    result: {
      result: "fine",
      hash,
      message:
        "The design session judged the file fine: The file holds one responsibility.",
    },
    live: false,
  })
  assert.equal(calls.series, 0)
  assert.deepEqual(calls.attempts, [])
  await assert.rejects(readFile(join(context.planRoot, listFile), "utf8"))
})

test("a call whose rounds finished ends as waiting with no file changed, and the next call carries the list out", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
  })
  const before = await git(context.repoEduRoot, "rev-parse", "HEAD")
  assert.deepEqual(await runSplit(input(context), deps), {
    status: "result",
    result: {
      result: "waiting",
      hash,
      message: `The rounds on the move list ${listFile} have finished, and the next call on ${source} carries out the split.`,
    },
    // Every read is current, so the series has finished and moves.
    live: false,
  })
  assert.equal(calls.series, 1)
  // Only the designed list before its commit: no attempt before a write.
  assert.equal(calls.attempts.length, 1)
  assert.deepEqual(calls.checks, [])
  assert.equal(await git(context.repoEduRoot, "rev-parse", "HEAD"), before)
  assert.equal(await git(context.repoEduRoot, "status", "--porcelain"), "")
  const next = await runSplit(input(context), deps)
  assert.equal(next.status, "result")
  if (next.status !== "result") return
  assert.equal(next.result.result, "made")
  assert.equal(calls.designs, 1)
  assert.equal(calls.series, 1)
  assert.deepEqual(calls.checks, ["packages/demo"])
  assert.equal(
    await git(context.repoEduRoot, "show", "--name-only", "--format=", "HEAD"),
    [source, target].join("\n"),
  )
})

test("a call that does not wait tries, commits, judges, writes, checks and commits a designed list as the split", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
  })
  const outcome = await runSplit(input(context, false), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "made")
  assert.equal(outcome.result.hash, hash)
  assert.equal(outcome.live, false)
  assert.equal(calls.designs, 1)
  assert.equal(calls.series, 1)
  // The designed list before its commit, then once more before the write.
  assert.equal(calls.attempts.length, 2)
  assert.deepEqual(calls.checks, ["packages/demo"])
  assert.equal(
    await readFile(join(context.planRoot, listFile), "utf8"),
    listText(hash),
  )
  assert.equal(
    (await git(context.planRoot, "log", "-1", "--format=%s%n%b")).trimEnd(),
    `${label}/design abx: write the move list of ${source}\nclaude-opus-5 xhigh`,
  )
  assert.equal(
    await git(context.repoEduRoot, "log", "-1", "--format=%s"),
    `${label}/split abx refactor(pkg-demo): split source.ts into target.ts`,
  )
  assert.equal(
    (await git(context.repoEduRoot, "log", "-1", "--format=%b")).trimEnd(),
    [
      "claude-opus-5 xhigh",
      "",
      `- Carries out the move list ${listFile} for \`${source}\`.`,
      `- \`${target}\`: Holds b.`,
    ].join("\n"),
  )
  assert.equal(
    await git(context.repoEduRoot, "show", "--name-only", "--format=", "HEAD"),
    [source, target].join("\n"),
  )
  assert.equal(await git(context.repoEduRoot, "status", "--porcelain"), "")
})

test("a refused design list ends the call as one that needs a plan and writes no list", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
    attempts: [
      { outcome: "refused", message: "entry 1: the move adds diagnostics" },
    ],
  })
  const outcome = await runSplit(input(context), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "needs-plan")
  assert.match(outcome.result.message, /refused the move list: entry 1/)
  // No committed list means no series, so the call's split log moves alone.
  assert.equal(outcome.live, false)
  assert.equal(calls.series, 0)
  await assert.rejects(readFile(join(context.planRoot, listFile), "utf8"))
})

test("a call whose content another call designed first drops its own design and leaves the series live", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: async () => {
      await mkdir(join(context.planRoot, "splits/packages/demo/src"), {
        recursive: true,
      })
      // The other call writes and commits its list under the lock.
      await writeFile(
        join(context.planRoot, listFile),
        listText(hash, "Holds the other design's b."),
      )
      await commitAll(context.planRoot, "the other call's design")
      return { status: "finished", document: listText(hash) }
    },
  })
  const outcome = await runSplit(input(context), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "skipped")
  assert.equal(outcome.live, true)
  assert.deepEqual(calls.attempts, [])
  assert.match(
    await readFile(join(context.planRoot, listFile), "utf8"),
    /the other design's b/,
  )
})

test("a list that names the current content goes on without a design, and a dirty file skips the write", async (t) => {
  const { context, hash } = await splitFixture(t)
  await mkdir(join(context.planRoot, "splits/packages/demo/src"), {
    recursive: true,
  })
  await writeFile(join(context.planRoot, listFile), listText(hash))
  await commitAll(context.planRoot, "write the list")
  await writeFile(join(context.repoEduRoot, target), "work in progress\n")
  const { calls, dependencies: deps } = dependencies(context, {
    roundsDue: false,
  })
  const outcome = await runSplit(input(context), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "skipped")
  assert.match(
    outcome.result.message,
    /uncommitted changes: packages\/demo\/src\/target\.ts/,
  )
  assert.equal(outcome.live, false)
  assert.equal(calls.designs, 0)
  assert.equal(calls.series, 0)
  // The early attempt, then the attempt before the write.
  assert.equal(calls.attempts.length, 2)
  assert.equal(
    await readFile(join(context.repoEduRoot, source), "utf8"),
    "export const a = 1\nexport const b = 2\n",
  )
  assert.equal(
    await readFile(join(context.repoEduRoot, target), "utf8"),
    "work in progress\n",
  )
})

test("failed checks put every written file back as it was", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
    checks: { command: "pnpm check", output: "src/target.ts(1,1): error" },
  })
  const head = await git(context.repoEduRoot, "rev-parse", "HEAD")
  const outcome = await runSplit(input(context, false), deps)
  assert.deepEqual(outcome, {
    status: "result",
    result: {
      result: "checks-failed",
      hash,
      message: "pnpm check failed:\nsrc/target.ts(1,1): error",
    },
    live: false,
  })
  assert.equal(await git(context.repoEduRoot, "rev-parse", "HEAD"), head)
  assert.equal(await git(context.repoEduRoot, "status", "--porcelain"), "")
})

test("a withdrawn list for the current content gives its recorded result without a session", async (t) => {
  const { context, hash } = await splitFixture(t)
  await mkdir(join(context.planRoot, "splits/packages/demo/src"), {
    recursive: true,
  })
  await writeFile(
    join(context.planRoot, listFile),
    noSplitText(hash, "needs-plan"),
  )
  await commitAll(context.planRoot, "withdraw the list")
  const { calls, dependencies: deps } = dependencies(context, {})
  const outcome = await runSplit(input(context), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "needs-plan")
  assert.match(
    outcome.result.message,
    /records this result for the current content/,
  )
  // A withdrawn list ends its series, so the series moves.
  assert.equal(outcome.live, false)
  assert.equal(calls.designs, 0)
  assert.deepEqual(calls.attempts, [])
})

test("an uncommitted withdrawal is not reported, and a new design does not overwrite it", async (t) => {
  const { context, hash } = await splitFixture(t)
  const listPath = join(context.planRoot, listFile)
  await mkdir(join(context.planRoot, "splits/packages/demo/src"), {
    recursive: true,
  })
  await writeFile(listPath, noSplitText(hash, "fine"))
  const head = await git(context.planRoot, "rev-parse", "HEAD")
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
  })
  const outcome = await runSplit(input(context), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "skipped")
  assert.match(outcome.result.message, /has uncommitted changes/)
  assert.equal(calls.designs, 1)
  assert.deepEqual(calls.attempts, [])
  assert.equal(await readFile(listPath, "utf8"), noSplitText(hash, "fine"))
  assert.equal(await git(context.planRoot, "rev-parse", "HEAD"), head)
})

test("a stopped fix's uncommitted change does not stop its rounds, and only the committed list is tried", async (t) => {
  const { context, hash } = await splitFixture(t)
  const listPath = join(context.planRoot, listFile)
  await mkdir(join(context.planRoot, "splits/packages/demo/src"), {
    recursive: true,
  })
  await writeFile(listPath, listText(hash))
  await commitAll(context.planRoot, "write the list")
  const fixed = listText(hash, "Holds b, as the stopped fix put it.")
  await writeFile(listPath, fixed)
  const { calls, dependencies: deps } = dependencies(context, {
    series: async (afterRound) => {
      // The continued fix reads its own change and commits it.
      assert.equal(await readFile(listPath, "utf8"), fixed)
      await commitAll(context.planRoot, "the continued fix commits the list")
      return (await afterRound()) ? "finished" : "halted"
    },
  })
  const outcome = await runSplit(input(context, false), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "made")
  assert.deepEqual(
    calls.attempts.map((list) => list.moves[0].responsibility),
    [
      "Holds b.",
      "Holds b, as the stopped fix put it.",
      "Holds b, as the stopped fix put it.",
    ],
  )
})

test("an uncommitted change to a list that no round reads skips the split", async (t) => {
  const { context, hash } = await splitFixture(t)
  const listPath = join(context.planRoot, listFile)
  await mkdir(join(context.planRoot, "splits/packages/demo/src"), {
    recursive: true,
  })
  await writeFile(listPath, listText(hash))
  await commitAll(context.planRoot, "write the list")
  await writeFile(listPath, listText(hash, "Holds b, as edited by hand."))
  const { calls, dependencies: deps } = dependencies(context, {
    roundsDue: false,
  })
  const outcome = await runSplit(input(context), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "skipped")
  assert.match(outcome.result.message, /has uncommitted changes/)
  // Only the early attempt, on the committed list.
  assert.deepEqual(
    calls.attempts.map((list) => list.moves[0].responsibility),
    ["Holds b."],
  )
  assert.deepEqual(calls.checks, [])
  assert.equal(await git(context.repoEduRoot, "status", "--porcelain"), "")
})

test("a fix that changes the list is tried before the next round, and a refusal halts the unfinished series and keeps it live", async (t) => {
  const { context, hash } = await splitFixture(t)
  const listPath = join(context.planRoot, listFile)
  let continued: boolean | undefined
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
    attempts: [clean, { outcome: "refused", message: "entry 1: refused" }],
    series: async (afterRound) => {
      // A clean round leaves the list in place and needs no attempt.
      assert.equal(await afterRound(), true)
      await writeFile(listPath, listText(hash, "Holds b, as the fix put it."))
      await commitAll(context.planRoot, "the fix changes the list")
      continued = await afterRound()
      return continued ? "finished" : "halted"
    },
  })
  const outcome = await runSplit(input(context), deps)
  assert.equal(continued, false)
  assert.equal(calls.attempts.length, 2)
  assert.equal(
    calls.attempts[1].moves[0].responsibility,
    "Holds b, as the fix put it.",
  )
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "needs-plan")
  // A listed auditor still lacks a current read, so the series is not finished.
  assert.equal(outcome.live, true)
  assert.deepEqual(calls.checks, [])
})

test("a later call that ends before any round keeps an unfinished series live and moves a finished one", async (t) => {
  const { context, hash } = await splitFixture(t)
  await mkdir(join(context.planRoot, "splits/packages/demo/src"), {
    recursive: true,
  })
  await writeFile(join(context.planRoot, listFile), listText(hash))
  await commitAll(context.planRoot, "write the list")
  const refused: AttemptReply = {
    outcome: "refused",
    message: "entry 1: refused",
  }
  for (const [roundsDue, live] of [
    [true, true],
    [false, false],
  ] as const) {
    const { calls, dependencies: deps } = dependencies(context, {
      roundsDue,
      attempts: [refused],
    })
    const outcome = await runSplit(input(context), deps)
    assert.equal(outcome.status, "result")
    if (outcome.status !== "result") return
    assert.equal(outcome.result.result, "needs-plan")
    assert.equal(outcome.live, live)
    assert.equal(calls.series, 0)
    assert.equal(calls.attempts.length, 1)
  }
})

test("the round maximum ends the call as one that needs a plan and keeps the series live", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
    series: async () => "limit",
  })
  const outcome = await runSplit(input(context), deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "needs-plan")
  assert.equal(outcome.live, true)
  assert.equal(calls.attempts.length, 1)
})

test("a stopped round and a failed design give no result", async (t) => {
  const { context, hash } = await splitFixture(t)
  const stopped = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
    series: async () => "stopped",
  })
  assert.deepEqual(await runSplit(input(context), stopped.dependencies), {
    status: "stopped",
  })
  await writeFile(join(context.repoEduRoot, source), "export const c = 3\n")
  await commitAll(context.repoEduRoot, "change the source")
  const failed = dependencies(context, {
    design: {
      status: "failed",
      reason: "blocked",
      sessionId: "design-session",
    },
  })
  assert.deepEqual(await runSplit(input(context), failed.dependencies), {
    status: "design-failed",
    reason: "blocked",
    sessionId: "design-session",
  })
})

test("the split command runs the design session, logs the call under its label and ends with the result line", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    null,
    false,
    "repo-edu",
    true,
  )
  await mkdir(join(f.repoRoot, "packages/demo/src"), { recursive: true })
  await writeFile(join(f.repoRoot, source), "export const a = 1\n")
  await commitAll(f.repoRoot, "add the source")
  const hash = await git(f.repoRoot, "hash-object", "--", source)
  await f.configure({
    phases: {
      ...f.phases,
      design: {
        stream: await phaseStream(
          "claude",
          `${noSplitText(hash, "fine")}\nPHASE RESULT: {"status":"finished","reason":null}`,
          "design-session",
        ),
      },
    },
  })
  const code = await runCommand(["split", `./${source}`], f.runtime, f.options)
  assert.equal(code, 0, f.errors.join("\n"))
  const result = `SPLIT RESULT: ${JSON.stringify({
    result: "fine",
    hash,
    message:
      "The design session judged the file fine: The file holds one responsibility.",
  })}`
  assert.equal(f.visible.at(-1), result)
  const prompt = (await f.prompts()).find((entry) =>
    String(entry.prompt).startsWith("Run the design phase"),
  )?.prompt
  assert.match(
    String(prompt),
    /^Run the design phase, the unattended design session of one file split, in this fresh session\./,
  )
  assert.ok(
    String(prompt).includes(
      `Phase arguments (JSON array): ${JSON.stringify([source, hash])}`,
    ),
  )
  // A design that ends the call leaves no live work, so its log moves with the series.
  const log = await readFile(
    join(f.evidenceRoot, "splits", label, `${label}-split.log`),
    "utf8",
  )
  assert.match(log, /Split of packages\/demo\/src\/source\.ts/)
  assert.ok(log.includes(result))
  await assert.rejects(
    readFile(join(f.roundRoot, `${label}-split.log`), "utf8"),
  )
  await assert.rejects(readFile(join(f.planRoot, listFile), "utf8"))
})

test("a failed design under --no-wait keeps the flag in its rerun line", async (t) => {
  const f = await roundFixture(
    t,
    "codex",
    "repo-edu",
    false,
    null,
    false,
    "repo-edu",
    true,
  )
  await mkdir(join(f.repoRoot, "packages/demo/src"), { recursive: true })
  await writeFile(join(f.repoRoot, source), "export const a = 1\n")
  await commitAll(f.repoRoot, "add the source")
  await f.configure({
    phases: {
      ...f.phases,
      design: {
        stream: await phaseStream(
          "claude",
          'Design failed.\nPHASE RESULT: {"status":"failed","reason":"Missing input"}',
          "design-session",
        ),
      },
    },
  })
  const code = await runCommand(
    ["split", source, "--no-wait"],
    f.runtime,
    f.options,
  )
  assert.equal(code, 1)
  assert.match(
    f.visible.join("\n"),
    /^Rerun: pnpm audit-round split packages\/demo\/src\/source\.ts --no-wait$/m,
  )
})
