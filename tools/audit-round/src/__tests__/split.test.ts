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
import {
  runSplit,
  type SplitDependencies,
  type SplitRequest,
} from "../split.js"
import { namedAnswer } from "../split-answers.js"
import type { AttemptReply } from "../split-attempt.js"
import type { SessionAnswer } from "../split-design.js"
import { runCommand, testSettings } from "./configured-runner.js"
import { phaseStream, recorded, testContext } from "./helpers.js"
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

function sessions(documents: string[], pick: string) {
  return {
    designers: documents.map((document) => ({
      density: "normal" as const,
      run: async (): Promise<SessionAnswer> => ({
        status: "finished",
        sessionId: "completed-session",
        writer,
        document,
      }),
    })),
    pick: async (): Promise<SessionAnswer> => ({
      status: "finished",
      sessionId: "completed-session",
      writer: picker,
      document: pick,
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
  }
  const run = async (request: SplitRequest) => {
    const result = await runSplit(context, request, deps)
    if (result.status !== "result") assert.fail(result.reason)
    return result.result
  }
  const design = (
    documents: string[],
    pick: string,
    mode: "design" | "both" = "design",
  ) => run({ mode, source, sessions: sessions(documents, pick) })
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
  const list = listText(f.hash)
  const first = await f.design(
    [list, noSplitText(f.hash, "fine")],
    "The first answer separates b.\nPick: 01",
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
  await f.design([list], "One responsibility moves.\nPick: 03")
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
  const before = listText(f.hash, "Holds a.")
  const repair = listText(f.hash)
  assert.equal(
    (
      await f.design(
        [before],
        "The target holds b.\nPick: 1\n\n" + repair,
        "both",
      )
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

test("unanimous no-split answers need no picker and choosing an earlier designer commits its exact number", async (t) => {
  const f = await fixture(t)
  await f.design(
    [listText(f.hash), noSplitText(f.hash, "fine")],
    "Keep the source.\nPick: 2",
  )
  const head = await git(f.context.planRoot, "rev-parse", "HEAD")
  assert.equal(
    (await f.design([noSplitText(f.hash, "fine")], "unused")).result,
    "fine",
  )
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
  assert.equal(
    (await f.design([listText(f.hash)], "unused")).result,
    "needs-plan",
  )
  const selection = sessions(
    [listText(f.hash), noSplitText(f.hash, "fine")],
    "",
  )
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
          document:
            "A different change is needed.\nPick: none\n\n" +
            noSplitText(f.hash, "needs-plan"),
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
  await f.design([list], "Pick: 1")
  await writeFile(f.planFile("01"), "local list")
  assert.equal((await f.design([list], "Pick: 2")).result, "skipped")
  assert.equal(await readFile(f.planFile("01"), "utf8"), "local list")
  await writeFile(f.planFile("01"), list)
  await writeFile(f.planFile("03"), "new local list")
  assert.equal((await f.design([list], "Pick: 3")).result, "skipped")
  await writeFile(join(f.context.repoEduRoot, target), "local target")
  assert.equal((await f.runFile(f.planFile("01"))).result, "skipped")
  assert.equal(
    await readFile(join(f.context.repoEduRoot, target), "utf8"),
    "local target",
  )
})

test("failed checks restore the files and a stale no-split answer skips without an attempt", async (t) => {
  const f = await fixture(t)
  f.deps.checks = async () => ({ command: "pnpm check", output: "failed" })
  assert.equal(
    (
      await f.design(
        [listText(f.hash), noSplitText(f.hash, "fine")],
        "Pick: 1",
        "both",
      )
    ).result,
    "checks-failed",
  )
  assert.equal(await git(f.context.repoEduRoot, "status", "--porcelain"), "")
  await writeFile(join(f.context.repoEduRoot, source), "changed")
  assert.equal((await f.runFile(f.answer("02"))).result, "skipped")
  assert.equal(f.trials.length, 2)
})

test("a failed designer retains the other answers and a failed pick keeps the next answer number", async (t) => {
  const f = await fixture(t)
  const selections = sessions([listText(f.hash), listText(f.hash)], "Pick: 1")
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
            ...sessions([listText(f.hash)], ""),
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
    (await f.design([listText(f.hash)], "Pick: 4")).result,
    "designed",
  )
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
  const finished = '\nPHASE RESULT: {"status":"finished","reason":null}'
  await f.configure({
    phases: {
      ...f.phases,
      design: {
        assistants: {
          claude: {
            stream: await phaseStream(
              "claude",
              noSplitText(hash, "fine") + finished,
              "design-claude",
            ),
          },
          codex: {
            stream: await phaseStream(
              "codex",
              noSplitText(hash, "needs-plan") + finished,
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
          "Keep the source together.\nPick: 1" + finished,
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
    await readFile(join(folder, label + "-designs.json"), "utf8"),
  )
  assert.deepEqual(
    records.map((r: { number: number }) => r.number),
    [1, 2, 3],
  )
  const path = join(folder, `${label}-design-01.${records[0].tag}.md`)
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
