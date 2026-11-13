import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { runCommand } from "./configured-runner.js"
import {
  shortCacheRoot as cacheRoot,
  phaseStream,
  recorded,
} from "./helpers.js"
import { commitFixture, roundFixture } from "./round-fixture.js"

type Fixture = Awaited<ReturnType<typeof roundFixture>>

/** Run one hidden chat command against the fixture and capture what it prints. */
async function chat(
  f: Fixture,
  cache: string,
  argv: readonly string[],
): Promise<{ readonly code: number; readonly text: string }> {
  const written: string[] = []
  const code = await runCommand(argv, f.runtime, {
    ...f.options,
    cacheRoot: cache,
    terminal: {
      write: (text: string) => {
        written.push(text)
      },
      status() {},
      clear() {},
    },
    emergency: (text: string) => {
      written.push(text)
    },
  })
  return { code, text: written.join("\n") }
}

/** Ask as the chat does until the run listens, then return what it asks. */
async function untilWaiting(f: Fixture, cache: string): Promise<string> {
  for (;;) {
    const asked = await chat(f, cache, ["ruling"])
    if (asked.code === 0) return asked.text
    await delay(20)
  }
}

async function answer(
  f: Fixture,
  cache: string,
  document: unknown,
): Promise<{ readonly code: number; readonly text: string }> {
  const file = join(f.root, "answer.json")
  await writeFile(file, JSON.stringify(document))
  return chat(f, cache, ["answer", "example", file])
}

async function finishFixOnAnswer(f: Fixture): Promise<void> {
  await f.configure({
    phases: {
      ...f.phases,
      fix: {
        ...(f.phases.fix as Record<string, unknown>),
        assistants: {
          codex: {
            stream: await phaseStream(
              "codex",
              'Applied the ruling.\nPHASE RESULT: {"status":"finished","reason":null}',
              "fix-session",
            ),
          },
        },
        commits: [
          {
            cwd: f.repoRoot,
            subject:
              "example/impl-audit-1 oth growth-none c1 fix(audit-round): apply ruling",
          },
        ],
      },
    },
  })
}

test("the chat reads the waiting ruling, is refused an incomplete answer and resumes the fix with a complete one", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  const cache = await cacheRoot(t)
  // A failed assertion must not leave the run listening, or the test never ends.
  const interruption = new AbortController()
  t.after(() => interruption.abort(new Error("Interrupted")))
  const run = runCommand(
    ["round", "example.md", "1", "--auditor", "codex", "--no-watch"],
    { ...f.runtime, signal: interruption.signal },
    { ...f.options, cacheRoot: cache, awaitAnswer: undefined },
  )
  const asked = await untilWaiting(f, cache)
  assert.match(
    asked,
    /^Your ruling is needed: Implementation audit of .+\/example\.md, step 1 \(round 1\)$/m,
  )
  assert.match(asked, /^Target: example$/m)
  assert.match(asked, /^Ruling: .+-ruling\..+\.md$/m)
  assert.match(asked, /^Findings that need a winner: none$/m)
  assert.match(asked, /^The fix runs on the auditor's model\.$/m)
  assert.match(asked, /^Answer with: pnpm audit-round answer example <file>$/m)

  const refused = await answer(f, cache, { rulings: [], reply: "" })
  assert.equal(refused.code, 1)
  assert.match(
    refused.text,
    /^Refused: The reply is empty; this ruling has no finding to decide/,
  )

  await finishFixOnAnswer(f)
  const accepted = await answer(f, cache, {
    rulings: [],
    reply: "Choose option 1.",
  })
  assert.equal(accepted.code, 0, accepted.text)
  assert.match(accepted.text, /^Accepted: /)
  assert.equal(await run, 0, f.errors.join("\n"))

  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Answer it in the Claude desktop app with: \/ruling example/,
  )
  assert.match(visible, /Applied the ruling/)
  assert.deepEqual(await f.desktop(), [f.repoRoot])
  const { markdown } = await f.records()
  assert.ok(markdown.includes("## User ruling\n\nChoose option 1."))
  assert.equal((await chat(f, cache, ["ruling"])).code, 1)
})

test("ruling and answer report that no run waits", async (t) => {
  const f = await roundFixture(t)
  const cache = await cacheRoot(t)
  assert.deepEqual(await chat(f, cache, ["ruling"]), {
    code: 1,
    text: "audit-round: No run waits for a ruling.",
  })
  assert.deepEqual(await chat(f, cache, ["ruling", "example"]), {
    code: 1,
    text: "audit-round: No run waits for a ruling on example.",
  })
  assert.deepEqual(await answer(f, cache, { rulings: [], reply: "Go on." }), {
    code: 1,
    text: "audit-round: No run waits for a ruling on example.",
  })
})

test("Ctrl-C during the wait ends the round as an unanswered ruling", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  const cache = await cacheRoot(t)
  const interruption = new AbortController()
  const run = runCommand(
    ["round", "example.md", "1", "--auditor", "codex", "--no-watch"],
    { ...f.runtime, signal: interruption.signal },
    { ...f.options, cacheRoot: cache, awaitAnswer: undefined },
  )
  await untilWaiting(f, cache)
  interruption.abort(new Error("Interrupted"))
  await run
  const visible = f.visible.join("\n")
  assert.match(
    visible,
    /Stopped without a ruling\. The round files are retained\./,
  )
  assert.match(visible, /Resume: /)
  assert.equal((await chat(f, cache, ["ruling"])).code, 1)
})

test("a failed app start is reported and the run keeps waiting", async (t) => {
  const f = await roundFixture(t, "codex", "repo-edu", true)
  await f.configure({ phases: f.phases, desktopExit: 9 })
  let asked = 0
  const code = await runCommand(
    ["round", "example.md", "1", "--auditor", "codex", "--no-watch"],
    f.runtime,
    {
      ...f.options,
      awaitAnswer: async () => {
        asked += 1
        return null
      },
    },
  )
  assert.equal(code, 0, f.errors.join("\n"))
  assert.equal(asked, 1)
  assert.match(
    f.visible.join("\n"),
    /The Claude desktop app did not open: error: unknown option '--desktop'/,
  )
})

for (const [host, repository] of [
  ["Repo Edu", "repo-edu"],
  ["the plan repo", "plan"],
] as const) {
  test(`an implementation ruling on a step hosted in ${host} opens that folder`, async (t) => {
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
    await writeFile(
      join(f.activeRoot, "example.md"),
      `# Example plan\n\n## Implementation plan\n\n1. **Fixture step.** Hosted in ${host}.\n\n### Execution and audits\n\nAudit ranges: 1.\n`,
    )
    await commitFixture(
      f.planRoot,
      "example/ready: assign the coder\n\nCoder: codex gpt-5.6-sol xhigh",
    )
    f.phases.implement = {
      document: { text: "Which parser should the step use?" },
      stream: await phaseStream(
        "codex",
        'A ruling is needed.\nPHASE RESULT: {"status":"needs-ruling","reason":null}',
        "implementation-session",
      ),
      usage: {
        path: `${f.root}/rollout-implementation-session.jsonl`,
        text: await recorded("codex-rollout.jsonl"),
      },
    }
    await f.configure({ phases: f.phases })
    const rulings: unknown[] = []
    await runCommand(["implement", "example"], f.runtime, {
      ...f.options,
      awaitAnswer: async (ruling) => {
        rulings.push(ruling)
        return null
      },
    })
    assert.deepEqual(await f.desktop(), [
      repository === "plan" ? f.planRoot : f.repoRoot,
    ])
    assert.equal(rulings.length, 1)
    assert.deepEqual(
      {
        ...(rulings[0] as Record<string, unknown>),
        ruling: undefined,
        title: undefined,
      },
      {
        target: "example",
        title: undefined,
        ruling: undefined,
        folder: repository === "plan" ? f.planRoot : f.repoRoot,
        fixerSide: null,
        findings: [],
      },
    )
    assert.match(
      f.visible.join("\n"),
      /Your ruling is needed: Implementation of example\.md, step 1/,
    )
  })
}
