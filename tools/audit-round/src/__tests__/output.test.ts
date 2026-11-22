import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { Writable } from "node:stream"
import { test } from "node:test"
import { decodeClaude } from "../claude.js"
import { decodeCodex } from "../codex.js"
import { parseRoundDataFile, type RoundAccount } from "../round-data.js"
import { RunClock } from "../run-clock.js"
import { createTerminal } from "../terminal.js"
import type { Assistant, AuditorOverride } from "./configured-runner.js"
import {
  commandText,
  pinned,
  pinnedCoder,
  RoundOutput,
  roundPhases,
  roundRun,
  testFixer,
} from "./configured-runner.js"
import { fixture, inTurn, releases, testContext, testSetup } from "./helpers.js"

test("a round stopped without a ruling prints its session and the rerun", async (t) => {
  const f = await fixture(t)
  const written: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testSetup(f.root), plan: "example.md", scope: "1" },
      Date.now(),
      releases,
    ),
    {
      clock: new RunClock(Date.now),
      terminal: {
        write(text) {
          written.push(text)
        },
        status() {},
        clear() {},
      },
    },
  )
  t.after(() => output.close())
  output.finish({
    status: "awaiting-ruling",
    report: "REPORT.md",
    sessionId: "fix-session",
    commits: [],
    account: { settling: "", judgedRepos: ["repo-edu"], findings: [] },
  })
  const text = written.join("\n")
  assert.match(text, /^Session: fix-session$/m)
  assert.match(text, /^Rerun: pnpm audit-round run example$/m)
  assert.doesNotMatch(text, /Resume:/)
})

/** A B finding on which the panel's two vetters split, so its winner is the user's. */
const splitFinding: RoundAccount["findings"][number] = {
  number: 1,
  title: "Serious split",
  tier: "B",
  reach: "developer",
  rarity: "ordinary",
  complexity: "none",
  growthPattern: "none",
  location: { kind: "repo-edu", area: "tool-audit-round", covers: [] },
  reviews: [
    { vet: "abh", verdict: "accept", answer: null },
    { vet: "obh", verdict: "drop", answer: "agree" },
  ],
  outcome: "kept",
  finalTier: "B",
  finalReach: "developer",
  finalRarity: null,
}

for (const phase of [
  "audit",
  "vet",
  "rebut",
  "rule",
  "fix",
  "watch",
] as const) {
  test(`a failed ${phase} prints its session and the rerun, never a resumed session`, async (t) => {
    const f = await fixture(t)
    const written: string[] = []
    const output = new RoundOutput(
      await roundRun(
        {
          ...testSetup(f.root),
          auditor: "claude",
          plan: "example.md",
          scope: "1",
        },
        Date.now(),
        releases,
      ),
      {
        clock: new RunClock(Date.now),
        terminal: {
          write(text) {
            written.push(text)
          },
          status() {},
          clear() {},
        },
      },
    )
    t.after(() => output.close())
    output.finish({
      status: "failed",
      phase,
      reason: "Selected model is at capacity.",
      sessionId: `${phase}-session`,
      ...(phase === "fix"
        ? { assistant: "codex", model: pinnedCoder() }
        : { assistant: "claude", model: pinned("claude") }),
      ...testContext(f.root),
      commits: [],
      account: {
        settling: "",
        judgedRepos: ["repo-edu"],
        findings: [splitFinding],
      },
    })
    const text = written.join("\n")
    assert.match(text, new RegExp(`^Session: ${phase}-session$`, "m"))
    assert.match(text, /^Rerun: pnpm audit-round run example$/m)
    assert.doesNotMatch(text, /Resume:|by hand|resume-fix/)
  })
}

for (const [side, line] of [
  ["auditor", "The fix runs on the auditor's model."],
  [{ vet: "oth" }, "The fix runs on vetter oth's model."],
  ["neither", "The fix runs on neither side's model."],
] as const) {
  test(`a ruling notice names the ${typeof side === "string" ? side : `vetter ${side.vet}`} fix model, the ruling and both chat commands`, async (t) => {
    const f = await fixture(t)
    const written: string[] = []
    const output = new RoundOutput(
      await roundRun(
        { ...testSetup(f.root), plan: "example.md", scope: "1" },
        Date.now(),
        releases,
      ),
      {
        clock: new RunClock(Date.now),
        terminal: {
          write(text) {
            written.push(text)
          },
          status() {},
          clear() {},
        },
      },
    )
    t.after(() => output.close())
    output.beginRuling({
      target: "example",
      title: output.title,
      ruling: null,
      reports: ["/active/AUDIT.md", "/active/VET.abh.md"],
      fixerSide: side,
      questions: [
        { finding: 1, needs: "winner" },
        { finding: 2, needs: "choice" },
        { finding: 3, needs: "winner" },
      ],
      panel: ["abh", "oth"],
    })
    output.endRuling(null)
    const text = written.join("\n")
    assert.match(text, /Your ruling is needed: Implementation audit of example/)
    // Questions asked before the fix have no ruling document.
    assert.doesNotMatch(text, /^Ruling:/m)
    assert.match(
      text,
      /^Round reports:\n {2}\/active\/AUDIT\.md\n {2}\/active\/VET\.abh\.md$/m,
    )
    assert.match(text, /^Findings that need a winner: 1, 3$/m)
    assert.match(text, /^Findings that need a choice: 2$/m)
    assert.match(
      text,
      /^Winner words: report, neither or one or more of the vetter tags abh, oth$/m,
    )
    assert.ok(text.includes(line))
    // The notice gives the target's command for each app.
    assert.ok(
      text.includes(
        "In a chat on the Repo Edu or plan checkout, type:\nClaude: /ruling example\nCodex: $ruling example\n",
      ),
    )
  })
}

test("long commit lists record every reference without exceeding filename limits", async (t) => {
  const f = await fixture(t)
  const commits = [
    "a".repeat(40),
    ...Array.from({ length: 9 }, (_, n) => String(n).repeat(40)),
  ] as const
  const group = {
    references: commits,
    repository: "repo-edu" as const,
    startingHead: "unused",
    commits,
    shortReferences: commits.map((commit) => commit.slice(0, 6)) as [
      string,
      ...string[],
    ],
  }
  const run = await roundRun(
    {
      ...testSetup(f.root),
      originalGroups: [group],
      groups: [group],
    },
    Date.now(),
    releases,
  )
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write() {}, status() {}, clear() {} },
  })
  output.close()
  const transcript = await readFile(run.paths.markdown, "utf8")
  assert.ok(transcript.includes(`Commit audit of ${commits.join(" ")}`))
})

test("a clean commit audit records its complete commit scope", async (t) => {
  const f = await fixture(t)
  const commit = "a".repeat(40)
  const startingHead = "b".repeat(40)
  const group = {
    references: [commit] as const,
    repository: "repo-edu" as const,
    startingHead,
    commits: [commit] as const,
    shortReferences: [commit.slice(0, 6)] as const,
  }
  const run = await roundRun(
    {
      ...testSetup(f.root),
      originalGroups: [group],
      groups: [group],
    },
    Date.now(),
    releases,
  )
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write() {}, status() {}, clear() {} },
  })
  t.after(() => output.close())
  output.finish({
    status: "finished",
    report: "REPORT.md",
    cleanAudit: true,
    decision: null,
    watch: null,
    deferralChain: "none",
    commits: [],
    account: { settling: "", judgedRepos: ["repo-edu"], findings: [] },
  })

  assert.ok(run.data)
  const [entry] = parseRoundDataFile(
    run.data.path,
    await readFile(run.data.path, "utf8"),
  ).rounds
  assert.ok(entry && "originalGroups" in entry)
  assert.deepEqual(entry.originalGroups, [
    { repository: "repo-edu", commits: [commit], startingHead },
  ])
  // The audited groups keep the references the audit report's target repeats.
  assert.deepEqual(entry.groups, [
    {
      repository: "repo-edu",
      commits: [commit],
      startingHead,
      references: [commit],
    },
  ])
  assert.deepEqual(entry.judgedRepos, ["repo-edu"])
  assert.equal(entry.status, "finished")
})

test("commit stamps retain each phase's reported selection across later phases", async (t) => {
  const f = await fixture(t)
  const setup = {
    ...testContext(f.root),
    ...testFixer,
    plan: "example.md",
    scope: "1",
    auditor: "claude" as const,
    auditorSelectionSource: "--auditor" as const,
    override: {
      option: "--auditor",
      strength: "top",
      effort: "xhigh",
    } as const,
  }
  const phases = roundPhases(setup.auditor, setup.override)
  const run = await roundRun(setup, 0, releases)
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write() {}, status() {}, clear() {} },
  })
  t.after(() => output.close())
  assert.equal(output.commitStamps(), undefined)
  for (const [phase, selection] of [
    ["audit", { model: "claude-fable-5-1", effort: "high" }],
    ["vet", { model: "gpt-6-astra", effort: "medium" }],
    ["rebut", { model: "claude-fable-5-1", effort: "xhigh" }],
    ["fix", { model: "gpt-6-astra", effort: "medium" }],
    ["watch", { model: "gpt-5.6-sol", effort: "low" }],
  ] as const) {
    await inTurn(output).start(
      {
        ...setup,
        ...(phase === "vet" ? phases.vet[0] : phases[phase]),
        ...(phase === "audit"
          ? {
              phase,
              arguments: [
                "example-impl-audit-01..01-01",
                "example.md",
              ] as const,
            }
          : phase === "rebut"
            ? {
                phase,
                arguments: ["/report.md", "/vet.md", "/rebut.md"] as const,
              }
            : phase === "fix"
              ? {
                  phase,
                  arguments: ["/report.md"] as const,
                  rulingFile: "/ruling.md",
                }
              : phase === "watch"
                ? { phase, evidence: "Episode facts", arguments: [] as const }
                : {
                    phase,
                    arguments: ["/report.md", run.documents.vets[0]] as const,
                  }),

        sessionId: null,
      },
      "prompt",
    )
    await inTurn(output).observe({ type: "model", selection })
  }
  assert.deepEqual(output.commitStamps(), {
    phases:
      "audit: claude-fable-5-1 high\nvet, fix: gpt-6-astra medium\nrebut: claude-fable-5-1 xhigh",
    auditor: "ath",
    series: null,
  })
})

test("reported model feedback prints a change notice after the phase line", async (t) => {
  const f = await fixture(t)
  const visible: string[] = []
  const run = await roundRun(
    { ...testSetup(f.root), plan: "example.md", scope: "1" },
    0,
    releases,
  )
  const output = new RoundOutput(
    {
      ...run,
      previousModels: [
        {
          assistant: "codex",
          launched: { model: "gpt-5.6-sol", effort: "high" },
          reported: { model: "earlier-model", effort: "high" },
        },
      ],
    },
    {
      clock: new RunClock(Date.now),
      terminal: {
        write: (text) => visible.push(text),
        status() {},
        clear() {},
      },
      openFiles: () => ({ log() {}, markdown() {}, close() {} }),
    },
  )
  t.after(() => output.close())
  await inTurn(output).start(
    {
      phase: "audit",
      assistant: "codex",
      model: pinned("codex"),
      ...testContext(f.root),
      arguments: ["example-impl-audit-01..01-01", "example.md"],
      sessionId: null,
    },
    "prompt",
  )
  await inTurn(output).observe({
    type: "model",
    selection: { model: "reported-model", effort: "xhigh" },
  })
  assert.deepEqual(visible.slice(-2), [
    "[audit] codex reported-model extra high",
    "Warning: Model change: audit reported reported-model xhigh; the newest earlier codex run launched on gpt-5.6-sol high reported earlier-model high.",
  ])
})

test("output records complete invocations incrementally and refreshes only while a phase runs", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10000 })
  const visible: string[] = []
  const rendered: string[] = []
  const status: string[] = []
  let clears = 0
  const output = new RoundOutput(
    await roundRun(
      { ...testSetup(f.root), plan: "example.md", scope: "1" },
      Date.now(),
      releases,
    ),
    {
      clock: new RunClock(Date.now),
      verbose: true,
      terminal: {
        write: (text, format) => {
          visible.push(text)
          if (format === "markdown") rendered.push(text)
        },
        status: (text) => {
          status.push(text)
        },
        clear: () => {
          clears++
        },
      },
    },
  )
  t.after(() => output.close())
  const start = () =>
    inTurn(output).start(
      {
        phase: "audit",
        assistant: "codex",
        model: pinned("codex"),
        ...testContext(f.root),
        arguments: ["example-impl-audit-01..01-01", "example.md"],
        sessionId: null,
      },
      "Full prompt\nMore prompt",
    )
  t.mock.timers.tick(5000)
  await start()
  const tool = async (command: string) => {
    for (const event of decodeCodex({
      type: "item.started",
      item: {
        type: "command_execution",
        command,
        aggregated_output: "",
        exit_code: null,
        status: "in_progress",
      },
    }))
      if (event.type === "tool") await inTurn(output).observe(event)
  }
  await tool("first command")
  // The step time counts from the phase start, the totals from the round and invocation starts.
  assert.match(
    visible.at(-1) as string,
    /^ {2}00:00 {2}00:05 {2}00:05\s+--\s+--\s+--\s+first command/,
  )
  await inTurn(output).observe({
    type: "context",
    tokens: 26000,
    window: 100000,
  })
  await tool("/bin/zsh -lc 'printf audit-round-probe'")
  assert.match(
    visible.at(-1) as string,
    /--\s+26k\s+26%\s+printf audit-round-probe/,
  )
  await inTurn(output).observe({
    type: "context",
    tokens: 26200,
    window: 100000,
  })
  await tool("second command")
  assert.match(visible.at(-1) as string, /0\.2k\s+26k\s+26%/)
  t.mock.timers.tick(3000)
  assert.match(
    status.at(-1) as string,
    /\[audit\] 00:03\s+round 00:08\s+run 00:08\s+context\s+26\.2k\s+26k\s+26%/,
  )
  await inTurn(output).observe({
    type: "text",
    text: "Full assistant text\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
  })
  // The written stamp consumed the growth, so the live line restarts from it.
  assert.match(status.at(-1) as string, /context\s+26k\s+26%/)
  const markdown = await readFile(output.paths.markdown, "utf8")
  assert.match(markdown, /Full assistant text/)
  assert.match(markdown, /\| 1 \| 2 \|/)
  assert.deepEqual(rendered, [
    "Full assistant text\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
  ])
  for (const text of [
    'Final report\n\nPHASE RESULT: {"status":"finished","reason":null}\n',
    'PHASE RESULT: {"status":"failed","reason":"Stopped"}',
  ])
    await inTurn(output).observe({ type: "text", text })
  assert.equal(rendered.at(-1), "Final report")
  assert.doesNotMatch(visible.join("\n"), /PHASE RESULT:/)
  assert.match(await readFile(output.paths.markdown, "utf8"), /PHASE RESULT:/)
  assert.doesNotMatch(
    await readFile(output.paths.log, "utf8"),
    /Full assistant text/,
  )
  await tool("same count")
  assert.doesNotMatch(visible.at(-1) as string, /0\.0k|0\.2k/)
  // Three seconds passed since the previous tool line, whatever the text stamp reported.
  assert.match(visible.at(-1) as string, /^ {2}00:03 {2}00:08\s+/)
  await inTurn(output).observe({
    type: "context",
    tokens: 8000,
    window: 100000,
  })
  const long = `/bin/zsh -lc 'printf ${"x".repeat(400)}'`
  await tool(long)
  assert.match(visible.at(-1) as string, /^ {2}00:00\s+/)
  assert.equal(visible.at(-1)?.length, 160)
  const log = await readFile(output.paths.log, "utf8")
  assert.equal(log.includes(long), false)
  assert.doesNotMatch(log, /tool started|aggregated_output|exit_code/)
  assert.ok(log.includes("x".repeat(400)))
  assert.match(log, /-18\.2k\s+8k\s+8%/)
  assert.match(log, /Full prompt\nMore prompt/)
  await inTurn(output).finish({
    status: "finished",
    sessionId: "audit",
  })
  inTurn(output).release()
  const count = status.length
  t.mock.timers.tick(5000)
  assert.equal(status.length, count)
  assert.ok(clears > 0)
  await start()
  await tool("new phase")
  assert.match(
    visible.at(-1) as string,
    /^ {2}00:00 {2}00:13 {2}00:13\s+--\s+--\s+--/,
  )
})

test("written status stamps chain into the running total", async (t) => {
  const f = await fixture(t)
  const visible: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testSetup(f.root), plan: "example.md", scope: "1" },
      Date.now(),
      releases,
    ),
    {
      clock: new RunClock(Date.now),
      terminal: {
        write: (text) => {
          visible.push(text)
        },
        status: () => {},
        clear: () => {},
      },
    },
  )
  t.after(() => output.close())
  const context = (tokens: number) =>
    inTurn(output).observe({ type: "context", tokens, window: 260000 })
  const text = () => inTurn(output).observe({ type: "text", text: "Progress" })
  const stamp = () => visible.at(-2) as string
  await inTurn(output).start(
    {
      phase: "audit",
      assistant: "codex",
      model: pinned("codex"),
      ...testContext(f.root),
      arguments: ["example-impl-audit-01..01-01", "example.md"],
      sessionId: null,
    },
    "Prompt",
  )
  await context(52000)
  await text()
  assert.match(stamp(), /context\s+52\.0k\s+52k\s+20%/)
  await context(89000)
  await text()
  assert.match(stamp(), /context\s+37\.0k\s+89k\s+34%/)
  await inTurn(output).start(
    {
      phase: "fix",
      arguments: ["/report.md", "/vet.md", "/rebut.md"],
      rulingFile: "/ruling.md",
      rulingReply: "Apply the corrections.",
      assistant: "codex",
      model: pinned("codex"),
      ...testContext(f.root),

      sessionId: "prior",
    },
    "Prompt",
  )
  // A resumed session carries context the round never observed.
  await context(131000)
  await text()
  assert.match(stamp(), /context\s+--\s+131k\s+50%/)
  await context(179000)
  await text()
  assert.match(stamp(), /context\s+48\.0k\s+179k\s+69%/)
})

for (const assistant of ["claude", "codex"] as const) {
  for (const verbose of [false, true]) {
    test(`${assistant} records only invocation lines with verbose=${verbose}`, async (t) => {
      const f = await fixture(t)
      const visible: string[] = []
      const output = new RoundOutput(
        await roundRun(
          { ...testSetup(f.root), plan: "example.md", scope: "1" },
          Date.now(),
          releases,
        ),
        {
          clock: new RunClock(Date.now),
          verbose,
          terminal: {
            write: (text) => {
              visible.push(text)
            },
            status: () => {},
            clear: () => {},
          },
        },
      )
      t.after(() => output.close())
      await inTurn(output).start(
        {
          phase: "audit",
          assistant,
          model: pinned(assistant),
          ...testContext(f.root),
          arguments: ["example-impl-audit-01..01-01", "example.md"],
          sessionId: null,
        },
        "prompt",
      )
      const logBefore = await readFile(output.paths.log, "utf8")
      const visibleBefore = visible.length
      const records: unknown[] = []
      const expected: string[] = []
      if (assistant === "codex") {
        for (const [item, invocation] of [
          [
            {
              type: "command_execution",
              command: "/bin/zsh -lc 'cat .agents/skills/audit/SKILL.md'",
              aggregated_output: "result-payload",
              exit_code: 0,
              status: "completed",
            },
            "cat .agents/skills/audit/SKILL.md",
          ],
          [
            {
              type: "mcp_tool_call",
              server: "docs",
              tool: "lookup",
              arguments: { topic: "audit" },
              result: "result-payload",
            },
            'docs.lookup {"topic":"audit"}',
          ],
          [{ type: "web_search", query: "audit\nround" }, "web audit round"],
          [
            {
              type: "web_search",
              action: { type: "open", url: "https://example.com" },
            },
            'web {"type":"open","url":"https://example.com"}',
          ],
          [
            {
              type: "file_change",
              changes: [
                { kind: "update", path: "a.ts" },
                { kind: "add", path: "b.ts" },
              ],
            },
            "files update a.ts, add b.ts",
          ],
        ] as const) {
          for (const type of ["item.started", "item.updated", "item.completed"])
            records.push({ type, item: { id: "envelope-id", ...item } })
          expected.push(invocation)
        }
      } else {
        const tools = [
          [
            "Bash",
            {
              command: "cat .agents/skills/audit/SKILL.md",
              description: "hidden description",
            },
            "Bash cat .agents/skills/audit/SKILL.md",
          ],
          ["Read", { file_path: "/tmp/a.ts", offset: 5 }, "Read /tmp/a.ts"],
          ["Glob", { path: "/tmp", pattern: "*.ts" }, "Glob /tmp"],
          [
            "Grep",
            { pattern: "audit", description: "hidden description" },
            "Grep audit",
          ],
          ["Skill", { skill: "audit" }, "Skill audit"],
          [
            "Task",
            { description: "inspect\tthe\nrunner" },
            "Task inspect the runner",
          ],
          ["Other", { topic: "audit" }, 'Other {"topic":"audit"}'],
        ] as const
        records.push(
          {
            type: "assistant",
            message: {
              usage: {
                input_tokens: 0,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
              },
              content: tools.map(([name, input]) => ({
                type: "tool_use",
                name,
                input,
              })),
            },
          },
          {
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "envelope-id",
                  content: "result-payload",
                },
              ],
            },
          },
        )
        expected.push(...tools.map(([, , invocation]) => invocation))
      }
      const decode = assistant === "codex" ? decodeCodex : decodeClaude
      for (const record of records)
        for (const event of decode(record))
          if (event.type === "tool") await inTurn(output).observe(event)
      const invocations = (text: string) =>
        text
          .trim()
          .split("\n")
          .map((line) =>
            line
              .trimStart()
              .replace(/^\d+:\d\d\s+\d+:\d\d\s+\d+:\d\d\s+--\s+--\s+--\s+/, ""),
          )
      const log = (await readFile(output.paths.log, "utf8")).slice(
        logBefore.length,
      )
      assert.deepEqual(invocations(log), expected)
      if (verbose)
        assert.deepEqual(
          invocations(visible.slice(visibleBefore).join("\n")),
          expected,
        )
      else assert.equal(visible.length, visibleBefore)
    })
  }
}

test("Claude measurements omit percentages when the window is unknown", async (t) => {
  const f = await fixture(t)
  const visible: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testSetup(f.root), plan: "example.md", scope: "1" },
      Date.now(),
      releases,
    ),
    {
      clock: new RunClock(Date.now),
      terminal: {
        write: (text) => {
          visible.push(text)
        },
        status: () => {},
        clear: () => {},
      },
    },
  )
  t.after(() => output.close())
  await inTurn(output).start(
    {
      phase: "fix",
      rulingFile: "/ruling.md",
      assistant: "claude",
      model: pinned("claude"),
      ...testContext(f.root),
      arguments: ["/AUDIT.md"],
      sessionId: null,
    },
    "prompt",
  )
  await inTurn(output).observe({ type: "context", tokens: 12000, window: null })
  await inTurn(output).observe({ type: "text", text: "Assistant reply" })
  assert.match(visible.join("\n"), /context\s+12\.0k\s+12k/)
  assert.doesNotMatch(visible.join("\n"), /%/)
})

test("the settings header lists phases in round order in aligned columns", async (t) => {
  const markdown: string[] = []
  const header = async (auditor: Assistant) => {
    const f = await fixture(t)
    const visible: string[] = []
    const output = new RoundOutput(
      await roundRun(
        {
          ...testContext(f.root),
          ...testFixer,
          plan: "example.md",
          scope: "1",
          auditor,
          auditorSelectionSource: "settings",
        },
        Date.now(),
        releases,
      ),
      {
        clock: new RunClock(Date.now),
        terminal: {
          write: (text) => {
            visible.push(text)
          },
          status: () => {},
          clear: () => {},
        },
        openFiles: () => ({
          log: () => {},
          markdown: (text) => markdown.push(text),
          close: () => {},
        }),
      },
    )
    t.after(() => output.close())
    output.models({
      claude: new Map([["opus", "claude-opus-5[1m]"]]),
      codex: new Map(),
    })
    return visible.at(-1)
  }
  // Model, effort and source each start in their own column.
  const codexHeader = [
    "audit    codex   gpt-5.6-sol       high  audit-round defaults",
    "vet abh  claude  claude-opus-5[1m] high  audit-round implementation vetters",
    "rebut    codex   gpt-5.6-sol       high  audit-round defaults",
    "rule     claude  claude-opus-5[1m] high  audit-round implementation ruler",
    "fix      codex   gpt-5.6-sol       high  audit-round coders",
    "watch    codex   gpt-5.6-sol       high  audit-round implementation watch",
  ]
  assert.equal(
    await header("claude"),
    [
      "audit    claude  claude-opus-5[1m] high  audit-round defaults",
      "vet abh  claude  claude-opus-5[1m] high  audit-round implementation vetters",
      "rebut    claude  claude-opus-5[1m] high  audit-round defaults",
      "rule     claude  claude-opus-5[1m] high  audit-round implementation ruler",
      "fix      codex   gpt-5.6-sol       high  audit-round coders",
      "watch    codex   gpt-5.6-sol       high  audit-round implementation watch",
    ].join("\n"),
  )
  assert.equal(await header("codex"), codexHeader.join("\n"))
  assert.equal(
    markdown.at(-1),
    `\`\`\`text\n${codexHeader.join("\n")}\n\`\`\`\n`,
  )
})

test("the settings header names what set each phase's model and effort", async (t) => {
  const header = async (
    override: AuditorOverride,
    auditor: Assistant = "codex",
  ) => {
    const f = await fixture(t)
    const visible: string[] = []
    const output = new RoundOutput(
      await roundRun(
        {
          ...testContext(f.root),
          ...testFixer,
          plan: "example.md",
          scope: "1",
          auditor,
          auditorSelectionSource:
            typeof override === "object" && "option" in override
              ? override.option
              : "settings",
          override,
        },
        Date.now(),
        releases,
      ),
      {
        clock: new RunClock(Date.now),
        terminal: {
          write: (text) => {
            visible.push(text)
          },
          status: () => {},
          clear: () => {},
        },
        openFiles: () => ({
          log: () => {},
          markdown: () => {},
          close: () => {},
        }),
      },
    )
    t.after(() => output.close())
    output.models({
      claude: new Map([["opus", "claude-opus-5-5"]]),
      codex: new Map(),
    })
    return (visible.at(-1) as string).split("\n")
  }
  const auditorRow = (row: string) => /^(audit|rebut) /.test(row)
  // Both flags name the whole selection, and the fix keeps the defaults.
  assert.deepEqual(
    await header({ option: "--auditor", strength: "top", effort: "xhigh" }),
    [
      "audit    codex   gpt-6-astra     extra high  --auditor",
      "vet abh  claude  claude-opus-5-5 high        audit-round implementation vetters",
      "rebut    codex   gpt-6-astra     extra high  --auditor",
      "rule     claude  claude-opus-5-5 high        audit-round implementation ruler",
      "fix      codex   gpt-5.6-sol     high        audit-round coders",
      "watch    codex   gpt-5.6-sol     high        audit-round implementation watch",
    ],
  )
  // One flag names one field, so the row reports both sources, model first.
  assert.deepEqual(
    (
      await header({ option: "--auditor", strength: "top", effort: null })
    ).filter(auditorRow),
    [
      "audit    codex   gpt-6-astra     high  --auditor/audit-round defaults",
      "rebut    codex   gpt-6-astra     high  --auditor/audit-round defaults",
    ],
  )
  assert.deepEqual(
    (
      await header({ option: "--auditor", strength: null, effort: "medium" })
    ).filter(auditorRow),
    [
      "audit    codex   gpt-5.6-sol     medium  audit-round defaults/--auditor",
      "rebut    codex   gpt-5.6-sol     medium  audit-round defaults/--auditor",
    ],
  )
  // A listed auditor names both fields from the auditor list.
  assert.deepEqual(
    (
      await header({ listed: { model: "gpt-6-astra", effort: "xhigh" } })
    ).filter(auditorRow),
    [
      "audit    codex   gpt-6-astra     extra high  audit-round auditors",
      "rebut    codex   gpt-6-astra     extra high  audit-round auditors",
    ],
  )
  // A --first tag names its own option.
  assert.deepEqual(
    (
      await header({ option: "--first", strength: "top", effort: "xhigh" })
    ).filter(auditorRow),
    [
      "audit    codex   gpt-6-astra     extra high  --first",
      "rebut    codex   gpt-6-astra     extra high  --first",
    ],
  )
  // A family alias reads as the release the CLI resolved it to.
  assert.deepEqual(
    (
      await header(
        { option: "--auditor", strength: "base", effort: "xhigh" },
        "claude",
      )
    ).slice(0, 3),
    [
      "audit    claude  claude-opus-5-5 extra high  --auditor",
      "vet abh  claude  claude-opus-5-5 high        audit-round implementation vetters",
      "rebut    claude  claude-opus-5-5 extra high  --auditor",
    ],
  )
})

test("shell display decoding retains unrecognised commands without evaluating them", () => {
  assert.equal(
    commandText("/bin/zsh -lc 'printf \"hello world\"; $(danger)'"),
    'printf "hello world"; $(danger)',
  )
  for (const value of [
    "/bin/zsh -lc 'unclosed",
    "env KEY=value /bin/zsh -lc 'printf test'",
    "zsh -lc 'printf test' extra",
    "bash -c 'printf test'",
  ])
    assert.equal(commandText(value), value)
})

test("terminal adapter uses replaceable output only on terminals and retains full permanent text", () => {
  for (const tty of [false, true]) {
    let text = ""
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        text += chunk.toString()
        callback()
      },
    })
    Object.assign(stream, { isTTY: tty, columns: 180, rows: 30 })
    const terminal = createTerminal(stream as NodeJS.WriteStream)
    terminal.status("[audit] 00:01")
    terminal.write("A permanent message")
    terminal.status("[audit] 00:02")
    terminal.clear()
    assert.ok(text.includes("A permanent message"))
    if (tty) {
      assert.ok(text.includes("[audit] 00:02"))
      assert.ok(text.includes("\u001b"))
    } else assert.equal(text, "A permanent message\n")
  }
})
