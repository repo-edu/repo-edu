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
  return {
    calls,
    dependencies: {
      design: async () => {
        calls.designs += 1
        const design = arranged.design
        if (design === undefined) throw new Error("No design was arranged")
        return typeof design === "function" ? design() : design
      },
      roundsDue: async () => arranged.roundsDue ?? true,
      series: async (afterRound) => {
        calls.series += 1
        return arranged.series === undefined
          ? "finished"
          : arranged.series(afterRound)
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
  const outcome = await runSplit({ ...context, source, identity }, deps)
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

test("a designed list is tried, committed, judged, written, checked and committed as the split", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
  })
  const outcome = await runSplit({ ...context, source, identity }, deps)
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
  const outcome = await runSplit({ ...context, source, identity }, deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "needs-plan")
  assert.match(outcome.result.message, /refused the move list: entry 1/)
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
      await writeFile(
        join(context.planRoot, listFile),
        listText(hash, "Holds the other design's b."),
      )
      return { status: "finished", document: listText(hash) }
    },
  })
  const outcome = await runSplit({ ...context, source, identity }, deps)
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
  const outcome = await runSplit({ ...context, source, identity }, deps)
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
  const outcome = await runSplit({ ...context, source, identity }, deps)
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
  const { calls, dependencies: deps } = dependencies(context, {})
  const outcome = await runSplit({ ...context, source, identity }, deps)
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "needs-plan")
  assert.match(
    outcome.result.message,
    /records this result for the current content/,
  )
  assert.equal(calls.designs, 0)
  assert.deepEqual(calls.attempts, [])
})

test("a fix that changes the list is tried before the next round, and a refusal halts the series", async (t) => {
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
      continued = await afterRound()
      return continued ? "finished" : "halted"
    },
  })
  const outcome = await runSplit({ ...context, source, identity }, deps)
  assert.equal(continued, false)
  assert.equal(calls.attempts.length, 2)
  assert.equal(
    calls.attempts[1].moves[0].responsibility,
    "Holds b, as the fix put it.",
  )
  assert.equal(outcome.status, "result")
  if (outcome.status !== "result") return
  assert.equal(outcome.result.result, "needs-plan")
  assert.equal(outcome.live, false)
  assert.deepEqual(calls.checks, [])
})

test("the round maximum ends the call as one that needs a plan and keeps the series live", async (t) => {
  const { context, hash } = await splitFixture(t)
  const { calls, dependencies: deps } = dependencies(context, {
    design: { status: "finished", document: listText(hash) },
    series: async () => "limit",
  })
  const outcome = await runSplit({ ...context, source, identity }, deps)
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
  assert.deepEqual(
    await runSplit({ ...context, source, identity }, stopped.dependencies),
    { status: "stopped" },
  )
  await writeFile(join(context.repoEduRoot, source), "export const c = 3\n")
  await commitAll(context.repoEduRoot, "change the source")
  const failed = dependencies(context, {
    design: {
      status: "failed",
      reason: "blocked",
      sessionId: "design-session",
    },
  })
  assert.deepEqual(
    await runSplit({ ...context, source, identity }, failed.dependencies),
    { status: "design-failed", reason: "blocked", sessionId: "design-session" },
  )
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
