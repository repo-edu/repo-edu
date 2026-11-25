import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
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
import { runAssistantPhase } from "../assistant.js"
import { installationRoot } from "../context.js"
import {
  runSplit,
  type SplitDependencies,
  type SplitRequest,
} from "../split.js"
import { namedAnswer } from "../split-answers.js"
import { type AttemptReply, attemptMoveList } from "../split-attempt.js"
import type { SessionAnswer } from "../split-design.js"
import type { DesignAnswer, PickAnswer } from "../split-result-schema.js"
import { pinned, runCommand, testSettings } from "./configured-runner.js"
import {
  fixture as assistantFixture,
  phaseStream,
  recorded,
  testContext,
} from "./helpers.js"
import { roundFixture } from "./round-fixture.js"

const source = "packages/demo/src/source.ts"
const target = "packages/demo/src/target.ts"
const label = "split-source.ts-f4ed5"
const writer = { model: "claude-opus-5", effort: "xhigh", tag: "abx" } as const
const picker = { model: "gpt-6.2-astra", effort: "xhigh", tag: "otx" } as const

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
  const context = testContext(join(directory, "repo-edu"))
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
Size: 2 lines

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
Size: 2 lines

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

function moveAnswer(responsibility = "Holds b."): DesignAnswer {
  return {
    area: "pkg-demo",
    kind: "moves",
    moves: [{ target, responsibility, ranges: [{ start: 2, end: 2 }] }],
  }
}

function noSplitAnswer(result: "fine" | "needs-plan"): DesignAnswer {
  return {
    area: "pkg-demo",
    kind: "no-split",
    result,
    reason: "The file holds one responsibility.",
  }
}

function picked(
  number: number | null,
  replacement: DesignAnswer | null = null,
): PickAnswer {
  return {
    number,
    reason: "The choice follows the source.",
    repairs: replacement?.kind === "moves" ? ["The target holds b."] : [],
    judgements: {},
    replacement,
  }
}

function completed(result: DesignAnswer | PickAnswer) {
  return { status: "finished", reason: null, result }
}

function sessions(designs: DesignAnswer[], pick: PickAnswer = picked(1)) {
  return {
    designers: designs.map((design) => ({
      density: "normal" as const,
      run: async (): Promise<SessionAnswer<"design">> => ({
        status: "finished",
        sessionId: "completed-session",
        writer,
        design,
      }),
    })),
    pick: async (): Promise<SessionAnswer<"pick">> => ({
      status: "finished",
      sessionId: "completed-session",
      writer: picker,
      pick,
    }),
  }
}

async function fixture(t: TestContext) {
  const { context, hash } = await splitFixture(t)
  const trials: string[] = []
  const gitDir = await git(
    context.repoEduRoot,
    "rev-parse",
    "--absolute-git-dir",
  )
  const locked = () =>
    check(gitDir, {
      lockfilePath: join(gitDir, "audit-round-split.lock"),
      realpath: false,
    })
  const deps: SplitDependencies = {
    attempt: async (list) => {
      assert.equal(await locked(), true)
      trials.push(list.moves[0].responsibility)
      return clean
    },
    checks: async (pkg) => {
      assert.equal(pkg, "packages/demo")
      assert.equal(await locked(), false)
      return null
    },
    message: async () => {},
    showReport: () => {},
  }
  const run = async (request: SplitRequest) => {
    const result = await runSplit(context, request, deps)
    if (result.status !== "result") assert.fail(result.reason)
    return result.result
  }
  const design = (
    designs: DesignAnswer[],
    pick?: PickAnswer,
    mode: "design" | "both" = "design",
  ) => run({ mode, source, sessions: sessions(designs, pick) })
  const runFile = async (path: string) =>
    run({
      mode: "run",
      named: await namedAnswer(context, context.planRoot, path),
    })
  const answer = (n: string, tag = writer.tag as string) =>
    join(context.roundRoot, `${label}-design-${n}.${tag}.md`)
  const planFile = (n: string) =>
    join(context.planRoot, `splits/packages/demo/src/source.${n}.mv.md`)
  return { context, hash, deps, trials, design, run, runFile, answer, planFile }
}

test("a fresh design keeps its number and a committed run uses Git's text and its saved writer", async (t) => {
  const f = await fixture(t)
  const first = await f.design([moveAnswer(), noSplitAnswer("fine")], picked(1))
  assert.equal(first.result, "designed")
  assert.equal(first.message, f.planFile("01"))
  assert.equal(
    await readFile(f.planFile("01"), "utf8"),
    await readFile(f.answer("01"), "utf8"),
  )
  assert.match(
    await git(f.context.planRoot, "log", "-1", "--format=%B"),
    /\/design otx:.*\n\ngpt-6.2-astra xhigh/s,
  )
  await f.design([moveAnswer()], picked(3))
  assert.deepEqual(f.trials, Array(4).fill("Holds b."))
  await assert.rejects(readFile(f.planFile("01")))
  const local = noSplitText(f.hash, "needs-plan")
  await writeFile(f.planFile("03"), local)
  assert.equal((await f.runFile(f.planFile("03"))).result, "made")
  assert.equal(f.trials.length, 5)
  assert.equal(await readFile(f.planFile("03"), "utf8"), local)
  assert.match(
    await git(f.context.repoEduRoot, "log", "-1", "--format=%B"),
    /\/split abx .*\n\nclaude-opus-5 xhigh/s,
  )
})

test("a repair is saved under a new number and the bare call uses its final attempt for the write", async (t) => {
  const f = await fixture(t)
  assert.equal(
    (await f.design([moveAnswer("Holds a.")], picked(1, moveAnswer()), "both"))
      .result,
    "made",
  )
  assert.deepEqual(f.trials, ["Holds a.", "Holds b."])
  assert.equal(
    await readFile(f.planFile("02"), "utf8"),
    await readFile(f.answer("02", "otx"), "utf8"),
  )
  assert.match(
    await git(f.context.repoEduRoot, "log", "-1", "--format=%B"),
    /\/split otx .*\n\ngpt-6.2-astra xhigh/s,
  )
})

test("unanimous no-split answers need no picker and choosing an earlier designer commits its exact number", async (t) => {
  const f = await fixture(t)
  await f.design([moveAnswer(), noSplitAnswer("fine")], picked(2))
  const head = await git(f.context.planRoot, "rev-parse", "HEAD")
  assert.equal((await f.design([noSplitAnswer("fine")])).result, "fine")
  assert.equal((await f.runFile(f.answer("02"))).result, "fine")
  assert.equal(await git(f.context.planRoot, "rev-parse", "HEAD"), head)
  assert.equal((await f.runFile(f.answer("01"))).result, "made")
  assert.deepEqual(f.trials, ["Holds b.", "Holds b."])
  assert.match(
    await git(f.context.planRoot, "log", "-1", "--format=%s"),
    /\/choose: choose answer 1 /,
  )
})

test("refused lists reach the picker with reasons and an all-refused design needs a plan", async (t) => {
  const f = await fixture(t)
  f.deps.attempt = async () => ({
    outcome: "refused",
    message: "target spans an import",
  })
  assert.equal((await f.design([moveAnswer()])).result, "needs-plan")
  const selection = sessions([moveAnswer(), noSplitAnswer("fine")])
  const res = await f.run({
    mode: "both",
    source,
    sessions: {
      ...selection,
      pick: async (_, answers) => {
        assert.deepEqual(
          answers.map((a) => a.refusal),
          ["target spans an import", null],
        )
        return {
          status: "finished",
          sessionId: "completed-session",
          writer: picker,
          pick: picked(null, noSplitAnswer("needs-plan")),
        }
      },
    },
  })
  assert.equal(res.result, "needs-plan")
  assert.equal(
    await readFile(f.answer("04", "otx"), "utf8"),
    noSplitText(f.hash, "needs-plan"),
  )
})

test("publication protects the old and new plan paths and execution protects all affected source paths", async (t) => {
  const f = await fixture(t)
  const list = listText(f.hash)
  await f.design([moveAnswer()], picked(1))
  await writeFile(f.planFile("01"), "local list")
  assert.equal((await f.design([moveAnswer()], picked(2))).result, "skipped")
  assert.equal(await readFile(f.planFile("01"), "utf8"), "local list")
  await writeFile(f.planFile("01"), list)
  await writeFile(f.planFile("03"), "new local list")
  assert.equal((await f.design([moveAnswer()], picked(3))).result, "skipped")
  await writeFile(
    join(f.context.planRoot, ".git/info/exclude"),
    "source.04.mv.md\n",
  )
  await writeFile(f.planFile("04"), "ignored local list")
  const head = await git(f.context.planRoot, "rev-parse", "HEAD")
  assert.equal((await f.design([moveAnswer()], picked(4))).result, "skipped")
  assert.equal(await readFile(f.planFile("04"), "utf8"), "ignored local list")
  assert.equal(await git(f.context.planRoot, "rev-parse", "HEAD"), head)
  await writeFile(join(f.context.repoEduRoot, target), "local target")
  assert.equal((await f.runFile(f.planFile("01"))).result, "skipped")
  assert.equal(
    await readFile(join(f.context.repoEduRoot, target), "utf8"),
    "local target",
  )
})

test("a stop during the final move attempt leaves the chosen answer unpublished", async (t) => {
  const f = await fixture(t)
  await f.design([moveAnswer(), noSplitAnswer("fine")], picked(2))
  const head = await git(f.context.planRoot, "rev-parse", "HEAD")
  const stop = new AbortController()
  f.deps.attempt = (list) => {
    const result = attemptMoveList(installationRoot, list, stop.signal)
    stop.abort(new Error("Interrupted"))
    return result
  }
  await assert.rejects(
    f.runFile(f.answer("01")),
    (error) => error === stop.signal.reason,
  )
  assert.equal(await git(f.context.planRoot, "rev-parse", "HEAD"), head)
  assert.equal(await git(f.context.planRoot, "status", "--porcelain"), "")
})

test("a reader of the previous writer record keeps its complete version during the next save", async (t) => {
  const f = await fixture(t)
  const design = noSplitAnswer("fine")
  await f.design([design])
  const path = join(f.context.roundRoot, `${label}-designs.json`)
  const before = await readFile(path, "utf8")
  const reader = await open(path)
  try {
    await f.design([design])
    assert.equal(await reader.readFile("utf8"), before)
  } finally {
    await reader.close()
  }
  assert.equal((await f.runFile(f.answer("01"))).result, "fine")
  assert.equal((await f.runFile(f.answer("02"))).result, "fine")
})

test("failed checks restore the files and a stale no-split answer skips without an attempt", async (t) => {
  const f = await fixture(t)
  f.deps.checks = async () => ({ command: "pnpm check", output: "failed" })
  assert.equal(
    (await f.design([moveAnswer(), noSplitAnswer("fine")], picked(1), "both"))
      .result,
    "checks-failed",
  )
  assert.equal(await git(f.context.repoEduRoot, "status", "--porcelain"), "")
  await writeFile(join(f.context.repoEduRoot, source), "changed")
  assert.equal((await f.runFile(f.answer("02"))).result, "skipped")
  assert.equal(f.trials.length, 2)
})

test("a failed designer retains the other answers and a failed pick keeps the next answer number", async (t) => {
  const f = await fixture(t)
  const selections = sessions([moveAnswer(), moveAnswer()])
  selections.designers[0].run = async () => ({
    status: "failed",
    reason: "blocked",
    sessionId: "designer",
  })
  assert.equal(
    (
      await runSplit(
        f.context,
        { mode: "design", source, sessions: selections },
        f.deps,
      )
    ).status,
    "failed",
  )
  assert.equal(await readFile(f.answer("02"), "utf8"), listText(f.hash))
  assert.equal(
    (
      await runSplit(
        f.context,
        {
          mode: "both",
          source,
          sessions: {
            ...sessions([moveAnswer()]),
            pick: async () => ({
              status: "failed",
              reason: "blocked",
              sessionId: "picker",
            }),
          },
        },
        f.deps,
      )
    ).status,
    "failed",
  )
  assert.equal((await f.design([moveAnswer()], picked(4))).result, "designed")
})

test("split design runs same-tag designers in separate slots and split run returns a saved answer without assistant startup", async (t) => {
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
  await commitAll(f.repoRoot, "add source")
  const hash = await git(f.repoRoot, "hash-object", "--", source)
  const cli = testSettings.split.picker
  const config = {
    ...testSettings,
    split: {
      designers: [
        { ...cli, density: "normal" as const },
        { ...cli, density: "coarse" as const },
        {
          assistant: "codex" as const,
          ...testSettings.defaults.codex,
          density: "normal" as const,
        },
      ],
      picker: cli,
    },
  }
  await f.configure({
    phases: {
      ...f.phases,
      design: {
        assistants: {
          claude: {
            stream: await phaseStream(
              "claude",
              completed(noSplitAnswer("fine")),
              "design-claude",
            ),
          },
          codex: {
            stream: await phaseStream(
              "codex",
              completed(noSplitAnswer("needs-plan")),
              "design-codex",
            ),
            usage: {
              path: join(f.root, "rollout-design-codex.jsonl"),
              text: await recorded("codex-rollout.jsonl"),
            },
          },
        },
      },
      pick: {
        stream: await phaseStream(
          "claude",
          completed({
            ...picked(1),
            judgements: {
              1: "Keep the source together.",
              2: "Same division.",
              3: "The file can stay whole.",
            },
          }),
          "fresh-picker",
        ),
      },
    },
  })
  const code = await runCommand(["split", "design", source], f.runtime, {
    ...f.options,
    settings: config,
  })
  assert.equal(code, 0, f.errors.join("\n"))
  assert.match(f.visible.at(-1) ?? "", /"result":"fine"/)
  const prompts = (await f.prompts()).map((entry) => String(entry.prompt))
  for (const density of ["normal", "coarse"])
    assert.ok(
      prompts.some((prompt) =>
        prompt.includes(
          "Phase arguments (JSON array): " +
            JSON.stringify([source, hash, density]),
        ),
      ),
    )
  const pickPrompt = prompts.find((prompt) =>
    prompt.startsWith("Run the pick phase"),
  )
  assert.ok(pickPrompt)
  for (const number of ["01", "02", "03"])
    assert.ok(pickPrompt.includes(`${label}-design-${number}.`))
  const folder = join(f.evidenceRoot, "splits", label)
  const records = JSON.parse(
    await readFile(join(folder, `${label}-designs.json`), "utf8"),
  )
  assert.deepEqual(
    records.map((r: { number: number }) => r.number),
    [1, 2, 3],
  )
  const path = join(folder, `${label}-design-01.${records[0].tag}.md`)
  const reportName = (await readdir(folder)).find((name) =>
    name.includes("-pick-"),
  )
  assert.ok(reportName)
  const report = await readFile(join(folder, reportName), "utf8")
  assert.match(report, /### Answer 3\n\nThe file can stay whole\./)
  assert.match(report, /Pick: 1\n$/)
  const calls = await f.calls()
  const lookups = f.releaseLookup.mock.callCount()
  assert.equal(
    await runCommand(["split", "run", path], f.runtime, f.options),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(await f.calls(), calls)
  assert.equal(f.releaseLookup.mock.callCount(), lookups)
  assert.match(f.visible.at(-1) ?? "", /"result":"fine"/)
})

test("a designer can send prose before its structured move list and the runner tries the saved moves", async (t) => {
  const f = await fixture(t)
  const cli = await assistantFixture(t)
  const prose = "I found one independent declaration to move."
  const stream = (await phaseStream("claude", completed(moveAnswer())))
    .trimEnd()
    .split("\n")
    .map((line) => {
      const event = JSON.parse(line)
      if (event.type === "assistant")
        for (const block of event.message.content)
          if (block.type === "text") block.text = prose
      return JSON.stringify(event)
    })
    .join("\n")
  await cli.configure({ stream: `${stream}\n` })
  const attempt = f.deps.attempt
  f.deps.attempt = async (list) => {
    const saved = await readFile(f.answer("01"), "utf8")
    assert.ok(saved.startsWith("# Move list\n"))
    return attempt(list)
  }
  const result = await f.run({
    mode: "design",
    source,
    sessions: {
      ...sessions([], picked(1)),
      designers: [
        {
          density: "normal",
          run: async (hash) => {
            const design = await runAssistantPhase<"design">(
              {
                ...testContext(cli.root),
                phase: "design",
                assistant: "claude",
                model: pinned("claude"),
                number: 1,
                arguments: [source, hash, "normal"],
                sessionId: null,
              },
              cli.output,
              cli.runtime,
            )
            return design.status === "failed" ? design : { ...design, writer }
          },
        },
      ],
    },
  })
  assert.ok(
    cli.feedback.some((event) => event.type === "text" && event.text === prose),
  )
  assert.equal(result.result, "designed")
  const saved = await readFile(f.answer("01"), "utf8")
  assert.ok(saved.startsWith("# Move list\n"))
  assert.equal(saved, listText(f.hash))
  assert.deepEqual(f.trials, ["Holds b.", "Holds b."])
})
