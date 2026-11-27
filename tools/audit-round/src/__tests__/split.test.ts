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
import { splitFolder } from "../round-paths.js"
import {
  runSplit,
  type SplitDependencies,
  type SplitRequest,
} from "../split.js"
import { namedAnswer } from "../split-answers.js"
import { type AttemptReply, attemptMoveList } from "../split-attempt.js"
import type { SessionAnswer } from "../split-design.js"
import {
  type DesignAnswer,
  type PickAnswer,
  pickSchema,
} from "../split-result-schema.js"
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

function listText(
  hash: string,
  responsibility = "Holds b.",
  repairedBy?: {
    readonly model: string
    readonly effort: string
    readonly tag: string
  },
): string {
  const opening = [
    "# Move list",
    "",
    `Source: \`${source}\``,
    `Hash: ${hash}`,
    "Area: pkg-demo",
    "Size: 2 lines",
    "Remaining: 1 lines",
    `Designer: ${writer.tag} (${writer.model} ${writer.effort})`,
  ]
  if (repairedBy !== undefined)
    opening.push(
      `Picker: ${repairedBy.tag} (${repairedBy.model} ${repairedBy.effort})`,
    )
  return `${opening.join("\n")}

## Moves

### 1. \`${target}\`

Responsibility: ${responsibility}
Ranges: 2
Size: 1 lines
`
}

function noSplitText(
  hash: string,
  result: "fine" | "needs-plan",
  by: "designer" | "picker" = "designer",
): string {
  const author = by === "designer" ? writer : picker
  const labelName = by === "designer" ? "Designer" : "Picker"
  return `# Move list

Source: \`${source}\`
Hash: ${hash}
Area: pkg-demo
Size: 2 lines
${labelName}: ${author.tag} (${author.model} ${author.effort})

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

function moveAnswer(responsibility = "Holds b.") {
  return {
    area: "pkg-demo",
    kind: "moves" as const,
    moves: [{ target, responsibility, ranges: [{ start: 2, end: 2 }] }],
  }
}

function noSplitAnswer(result: "fine" | "needs-plan") {
  return {
    area: "pkg-demo",
    kind: "no-split" as const,
    result,
    reason: "The file holds one responsibility.",
  }
}

function picked(
  ...[number, replacement]:
    | [number: number, replacement?: ReturnType<typeof moveAnswer>]
    | [number: null, replacement: ReturnType<typeof noSplitAnswer>]
): PickAnswer {
  const details = {
    reason: "The choice follows the source.",
    repairs: replacement?.kind === "moves" ? ["The target holds b."] : [],
    judgements: {},
  }
  return number === null
    ? { ...details, number, replacement }
    : { ...details, number, replacement: replacement ?? null }
}

function completed(result: DesignAnswer | PickAnswer) {
  return { status: "finished", reason: null, result }
}

test("the picker must choose an answer, repair its moves or supply a no-split answer", () => {
  const schema = pickSchema([{ number: 1, path: source, refusal: null }])
  const details = {
    reason: "The file decides the choice.",
    repairs: [],
    judgements: { 1: "The answer fits." },
  }
  for (const [number, replacement, valid] of [
    [1, null, true],
    [1, moveAnswer(), true],
    [null, noSplitAnswer("fine"), true],
    [null, null, false],
    [null, moveAnswer(), false],
    [1, noSplitAnswer("fine"), false],
  ] as const) {
    assert.equal(
      schema.safeParse({ ...details, number, replacement }).success,
      valid,
    )
  }
})

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
    if (result.status !== "result") assert.fail(JSON.stringify(result))
    return result.result
  }
  const design = async (designs: DesignAnswer[]) => {
    const result = await runSplit(
      context,
      { mode: "design", source, sessions: sessions(designs) },
      deps,
    )
    if (result.status !== "answers-saved") assert.fail(JSON.stringify(result))
    return result.answers.map(({ record }) => record.number)
  }
  const pick = (numbers: number[], choice?: PickAnswer) =>
    run({ mode: "pick", source, numbers, sessions: sessions([], choice) })
  const designAndPick = async (designs: DesignAnswer[], choice?: PickAnswer) =>
    pick(await design(designs), choice)
  const runFile = async (path: string) =>
    run({
      mode: "run",
      named: await namedAnswer(context, context.planRoot, path),
    })
  const folder = splitFolder(context.evidenceRoot, label)
  const answer = (n: string, tag = writer.tag as string) =>
    join(folder, `${label}-design-${n}.${tag}.md`)
  const planFile = (n: string) =>
    join(context.planRoot, `splits/packages/demo/src/source.${n}.mv.md`)
  return {
    context,
    folder,
    hash,
    deps,
    trials,
    design,
    pick,
    designAndPick,
    run,
    runFile,
    answer,
    planFile,
  }
}

test("a fresh design keeps its number and a committed run uses Git's text and its saved writer", async (t) => {
  const f = await fixture(t)
  const first = await f.designAndPick(
    [moveAnswer(), noSplitAnswer("fine")],
    picked(1),
  )
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
  await f.designAndPick([moveAnswer()], picked(3))
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
    (
      await f.run({
        mode: "both",
        source,
        sessions: sessions([moveAnswer("Holds a.")], picked(1, moveAnswer())),
      })
    ).result,
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

test("a repair takes the next answer number even when newer designs were not named", async (t) => {
  const f = await fixture(t)
  await f.design([moveAnswer("Holds a.")])
  await f.design([moveAnswer("Later design.")])
  const result = await f.pick([1], picked(1, moveAnswer()))
  assert.equal(result.result, "designed")
  assert.equal(result.message, f.planFile("03"))
  assert.deepEqual(f.trials, ["Holds a.", "Holds b."])
  assert.equal(
    await readFile(f.answer("02"), "utf8"),
    listText(f.hash, "Later design."),
  )
  assert.equal(
    await readFile(f.answer("03", "otx"), "utf8"),
    listText(f.hash, "Holds b.", picker),
  )
  assert.match(
    await readFile(join(f.folder, `${label}-pick-01.otx.md`), "utf8"),
    /Pick: 1\n\nReplacement answer: 3\n$/,
  )
  const secondPicker = {
    model: "gemini-4-neon",
    effort: "xhigh",
    tag: "gbx",
  } as const
  const rePicked = await f.run({
    mode: "pick",
    source,
    numbers: [3],
    sessions: {
      ...sessions([]),
      pick: async () => ({
        status: "finished",
        sessionId: "completed-session",
        writer: secondPicker,
        pick: picked(3, moveAnswer("Holds repaired b.")),
      }),
    },
  })
  assert.equal(rePicked.result, "designed")
  assert.equal(rePicked.message, f.planFile("04"))
  assert.equal(
    await readFile(f.answer("04", "gbx"), "utf8"),
    listText(f.hash, "Holds repaired b.", secondPicker),
  )
})

test("unanimous no-split answers need no picker and choosing an earlier designer commits its exact number", async (t) => {
  const f = await fixture(t)
  await f.designAndPick([moveAnswer(), noSplitAnswer("fine")], picked(2))
  const head = await git(f.context.planRoot, "rev-parse", "HEAD")
  assert.equal((await f.designAndPick([noSplitAnswer("fine")])).result, "fine")
  assert.equal((await f.runFile(f.answer("02"))).result, "fine")
  assert.equal(await git(f.context.planRoot, "rev-parse", "HEAD"), head)
  assert.equal((await f.runFile(f.answer("01"))).result, "made")
  assert.deepEqual(f.trials, ["Holds b.", "Holds b."])
  assert.match(
    await git(f.context.planRoot, "log", "-1", "--format=%s"),
    /\/choose: choose answer 1 /,
  )
  const activeAnswer = join(
    f.context.roundRoot,
    `${label}-design-01.${writer.tag}.md`,
  )
  await writeFile(activeAnswer, await readFile(f.answer("01"), "utf8"))
  await assert.rejects(
    namedAnswer(f.context, f.context.planRoot, activeAnswer),
    /Name a designer's answer in the evidence checkout/,
  )
})

test("refused lists reach the picker with reasons and an all-refused pick needs a plan", async (t) => {
  const f = await fixture(t)
  f.deps.attempt = async () => ({
    outcome: "refused",
    message: "target spans an import",
  })
  assert.equal((await f.designAndPick([moveAnswer()])).result, "needs-plan")
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
    noSplitText(f.hash, "needs-plan", "picker"),
  )
  assert.match(
    await readFile(join(f.folder, `${label}-pick-01.otx.md`), "utf8"),
    /Pick: none\n\nReplacement answer: 4\n$/,
  )
})

test("publication protects the old and new plan paths and execution protects all affected source paths", async (t) => {
  const f = await fixture(t)
  const list = listText(f.hash)
  await f.designAndPick([moveAnswer()], picked(1))
  await writeFile(f.planFile("01"), "local list")
  assert.equal(
    (await f.designAndPick([moveAnswer()], picked(2))).result,
    "skipped",
  )
  assert.equal(await readFile(f.planFile("01"), "utf8"), "local list")
  await writeFile(f.planFile("01"), list)
  await writeFile(f.planFile("03"), "new local list")
  assert.equal(
    (await f.designAndPick([moveAnswer()], picked(3))).result,
    "skipped",
  )
  await writeFile(
    join(f.context.planRoot, ".git/info/exclude"),
    "source.04.mv.md\n",
  )
  await writeFile(f.planFile("04"), "ignored local list")
  const head = await git(f.context.planRoot, "rev-parse", "HEAD")
  assert.equal(
    (await f.designAndPick([moveAnswer()], picked(4))).result,
    "skipped",
  )
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
  await f.designAndPick([moveAnswer(), noSplitAnswer("fine")], picked(2))
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
  const path = join(f.folder, `${label}-designs.json`)
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
    (
      await f.run({
        mode: "both",
        source,
        sessions: sessions([moveAnswer(), noSplitAnswer("fine")], picked(1)),
      })
    ).result,
    "checks-failed",
  )
  assert.equal(await git(f.context.repoEduRoot, "status", "--porcelain"), "")
  await writeFile(join(f.context.repoEduRoot, source), "changed")
  assert.deepEqual(await f.pick([1, 2]), {
    result: "skipped",
    hash: f.hash,
    message: `${source} changed since the move list was designed.`,
  })
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
  assert.equal(
    (await f.designAndPick([moveAnswer()], picked(4))).result,
    "designed",
  )
})

test("split commands save numbered designs, retry only the picker and run a saved answer without startup", async (t) => {
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
  const design = {
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
  }
  const configurePick = async (result: object, sessionId: string) =>
    f.configure({
      phases: {
        ...f.phases,
        design,
        pick: { stream: await phaseStream("claude", result, sessionId) },
      },
    })
  await configurePick(
    { status: "failed", reason: "Picker stopped.", result: null },
    "failed-picker",
  )
  const command = (...args: string[]) =>
    runCommand(["split", ...args], f.runtime, {
      ...f.options,
      settings: config,
    })
  const prompts = async () =>
    (await f.prompts()).map(({ prompt }) => String(prompt))
  assert.equal(await command("design", source), 0, f.errors.join("\n"))
  assert.equal(
    f.visible.at(-1),
    `SPLIT RESULT: ${JSON.stringify({
      result: "answers-saved",
      hash,
      message: `pnpm audit-round split pick ${source} 1 2 3`,
    })}`,
  )
  const designPrompts = await prompts()
  assert.equal(designPrompts.length, 3)
  assert.ok(
    designPrompts.every((prompt) => prompt.startsWith("Run the design phase")),
  )
  for (const density of ["normal", "coarse"])
    assert.ok(
      designPrompts.some((prompt) =>
        prompt.includes(
          "Phase arguments (JSON array): " +
            JSON.stringify([source, hash, density]),
        ),
      ),
    )
  const folder = join(f.evidenceRoot, "splits", label)
  const records = JSON.parse(
    await readFile(join(folder, `${label}-designs.json`), "utf8"),
  )
  assert.deepEqual(
    records.map((r: { number: number }) => r.number),
    [1, 2, 3],
  )
  const path = join(folder, `${label}-design-01.${records[0].tag}.md`)
  assert.ok(f.visible.some((line) => line.includes(path)))
  assert.deepEqual(await readdir(f.roundRoot), [])
  assert.ok(!(await readdir(folder)).some((name) => name.includes("-pick-")))
  assert.equal(await command(source), 1)
  assert.deepEqual(await readdir(f.roundRoot), [])
  const retry = f.visible.find((line) =>
    line.includes("Session: failed-picker"),
  )
  assert.equal(
    retry,
    `Split session failed: Picker stopped.\nSession: failed-picker\nRerun: pnpm audit-round split pick ${source} 4 5 6`,
  )
  const beforeRetry = (await prompts()).length
  await configurePick(
    completed({
      ...picked(4),
      judgements: { 4: "Keep it whole.", 5: "Agrees.", 6: "Needs a plan." },
    }),
    "retry-picker",
  )
  assert.equal(
    await command("pick", source, "4", "5", "6"),
    0,
    f.errors.join("\n"),
  )
  assert.deepEqual(await readdir(f.roundRoot), [])
  const retryPrompts = (await prompts()).slice(beforeRetry)
  assert.equal(retryPrompts.length, 1)
  assert.ok(retryPrompts[0].startsWith("Run the pick phase"))
  for (const number of ["04", "05", "06"])
    assert.ok(
      retryPrompts[0].includes(join(folder, `${label}-design-${number}.`)),
    )
  assert.match(f.visible.at(-1) ?? "", /"result":"fine"/)
  const reports = async () =>
    (await readdir(folder)).filter((name) => name.includes("-pick-")).sort()
  const [firstReport] = await reports()
  assert.ok(firstReport.startsWith(`${label}-pick-01.`))
  const firstText = await readFile(join(folder, firstReport), "utf8")
  assert.match(firstText, /### Answer 6\n\nNeeds a plan\./)
  assert.match(firstText, /Pick: 4\n$/)

  await configurePick(
    completed({
      ...picked(1),
      judgements: { 1: "Keep it whole.", 6: "Needs a plan." },
    }),
    "mixed-picker",
  )
  for (const reportNumber of ["02", "03"]) {
    const beforePick = (await prompts()).length
    assert.equal(
      await command("pick", source, "06", "01"),
      0,
      f.errors.join("\n"),
    )
    const [prompt, ...otherPrompts] = (await prompts()).slice(beforePick)
    assert.deepEqual(otherPrompts, [])
    const candidates = Array.from(
      prompt.matchAll(new RegExp(`${label}-design-(\\d+)\\.`, "g")),
      (match) => match[1],
    )
    assert.deepEqual(candidates, ["01", "06"])
    const name = (await reports()).at(-1)
    assert.ok(name?.startsWith(`${label}-pick-${reportNumber}.`))
  }
  assert.deepEqual(
    (await reports()).map((name) => name.split("-pick-")[1].split(".")[0]),
    ["01", "02", "03"],
  )
  assert.equal(await readFile(join(folder, firstReport), "utf8"), firstText)
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
  assert.deepEqual(await readdir(f.roundRoot), [])
  assert.equal(
    f.visible.some((line) => line.startsWith("Moved ")),
    false,
  )
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
  const result = await runSplit(
    f.context,
    {
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
    },
    f.deps,
  )
  assert.ok(
    cli.feedback.some((event) => event.type === "text" && event.text === prose),
  )
  assert.equal(result.status, "answers-saved")
  assert.deepEqual(f.trials, [])
  const saved = await readFile(f.answer("01"), "utf8")
  assert.ok(saved.startsWith("# Move list\n"))
  assert.equal(saved, listText(f.hash))
  assert.equal((await f.pick([1])).result, "designed")
  assert.deepEqual(f.trials, ["Holds b.", "Holds b."])
})
