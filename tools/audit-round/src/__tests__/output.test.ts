import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Writable } from "node:stream"
import { test } from "node:test"
import { decodeClaude } from "../claude.js"
import { decodeCodex } from "../codex.js"
import { briefRun, RoundOutput, roundRun } from "../output.js"
import { commandText } from "../output-format.js"
import type { Assistant, AuditorOverride } from "../phase.js"
import { unpinned } from "../phase.js"
import { createTerminal } from "../terminal.js"
import { fixture, selections, testContext } from "./helpers.js"

test("long commit lists record every reference without exceeding filename limits", async (t) => {
  const f = await fixture(t)
  const commits = [
    "a".repeat(40),
    ...Array.from({ length: 9 }, (_, n) => String(n).repeat(40)),
  ] as const
  const run = await roundRun(
    { ...testContext(f.root), commits },
    Date.now(),
    selections,
  )
  const output = new RoundOutput(run, {
    terminal: { write() {}, status() {}, clear() {} },
  })
  output.close()
  const transcript = await readFile(run.paths.markdown, "utf8")
  assert.ok(transcript.includes(`Audit round of commits ${commits.join(" ")}`))
})

test("output records complete invocations incrementally and refreshes only while a phase runs", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10000 })
  const visible: string[] = []
  const status: string[] = []
  let clears = 0
  const output = new RoundOutput(
    await roundRun(
      { ...testContext(f.root), plan: "example.md" },
      Date.now(),
      selections,
    ),
    {
      verbose: true,
      terminal: {
        write: (text) => {
          visible.push(text)
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
    output.phase.start(
      {
        phase: "audit",
        assistant: "codex",
        model: unpinned,
        ...testContext(f.root),
        ownerRoot: f.root,
        arguments: ["example-all-01", "example.md"],
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
      if (event.type === "tool") await output.phase.observe(event)
  }
  await tool("first command")
  assert.match(visible.at(-1) as string, /--\s+--\s+--\s+first command/)
  await output.phase.observe({ type: "context", tokens: 26000, window: 100000 })
  await tool("/bin/zsh -lc 'printf audit-round-probe'")
  assert.match(
    visible.at(-1) as string,
    /--\s+26k\s+26%\s+printf audit-round-probe/,
  )
  await output.phase.observe({ type: "context", tokens: 26200, window: 100000 })
  await tool("second command")
  assert.match(visible.at(-1) as string, /0\.2k\s+26k\s+26%/)
  t.mock.timers.tick(3000)
  assert.match(
    status.at(-1) as string,
    /\[audit\] 00:03\s+total 00:08\s+context\s+26\.2k\s+26k\s+26%/,
  )
  await output.phase.observe({
    type: "text",
    text: "Full assistant text\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
  })
  // The written stamp consumed the growth, so the live line restarts from it.
  assert.match(status.at(-1) as string, /context\s+26k\s+26%/)
  const markdown = await readFile(output.paths.markdown, "utf8")
  assert.match(markdown, /Full assistant text/)
  assert.match(markdown, /\| 1 \| 2 \|/)
  assert.doesNotMatch(
    await readFile(output.paths.log, "utf8"),
    /Full assistant text/,
  )
  await tool("same count")
  assert.doesNotMatch(visible.at(-1) as string, /0\.0k|0\.2k/)
  await output.phase.observe({ type: "context", tokens: 8000, window: 100000 })
  const long = `/bin/zsh -lc 'printf ${"x".repeat(400)}'`
  await tool(long)
  assert.equal(visible.at(-1)?.length, 160)
  const log = await readFile(output.paths.log, "utf8")
  assert.equal(log.includes(long), false)
  assert.doesNotMatch(log, /tool started|aggregated_output|exit_code/)
  assert.ok(log.includes("x".repeat(400)))
  assert.match(log, /-18\.2k\s+8k\s+8%/)
  assert.match(log, /Full prompt\nMore prompt/)
  await output.phase.finish({
    status: "finished",
    sessionId: "audit",
    file: "/AUDIT.md",
    context: null,
  })
  output.phase.release()
  const count = status.length
  t.mock.timers.tick(5000)
  assert.equal(status.length, count)
  assert.ok(clears > 0)
  await start()
  await tool("new phase")
  assert.match(visible.at(-1) as string, /--\s+--\s+--/)
})

test("written status stamps chain into the running total", async (t) => {
  const f = await fixture(t)
  const visible: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testContext(f.root), plan: "example.md" },
      Date.now(),
      selections,
    ),
    {
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
    output.phase.observe({ type: "context", tokens, window: 260000 })
  const text = () => output.phase.observe({ type: "text", text: "Progress" })
  const stamp = () => visible.at(-2) as string
  await output.phase.start(
    {
      phase: "audit",
      assistant: "codex",
      model: unpinned,
      ...testContext(f.root),
      ownerRoot: f.root,
      arguments: ["example-all-01", "example.md"],
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
  await output.phase.start(
    {
      phase: "rebut",
      assistant: "codex",
      model: unpinned,
      ...testContext(f.root),
      ownerRoot: f.root,
      arguments: ["/AUDIT.md"],
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
          { ...testContext(f.root), plan: "example.md" },
          Date.now(),
          selections,
        ),
        {
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
      await output.phase.start(
        {
          phase: "audit",
          assistant,
          model: unpinned,
          ...testContext(f.root),
          ownerRoot: f.root,
          arguments: ["example-all-01", "example.md"],
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
          if (event.type === "tool") await output.phase.observe(event)
      const invocations = (text: string) =>
        text
          .trim()
          .split("\n")
          .map((line) => line.trimStart().replace(/^--\s+--\s+--\s+/, ""))
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
      { ...testContext(f.root), plan: "example.md" },
      Date.now(),
      selections,
    ),
    {
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
  await output.phase.start(
    {
      phase: "fix",
      assistant: "claude",
      model: unpinned,
      ...testContext(f.root),
      ownerRoot: f.root,
      arguments: ["/AUDIT.md"],
      sessionId: null,
    },
    "prompt",
  )
  await output.phase.observe({ type: "context", tokens: 12000, window: null })
  await output.phase.observe({ type: "text", text: "Assistant reply" })
  assert.match(visible.join("\n"), /context\s+12\.0k\s+12k/)
  assert.doesNotMatch(visible.join("\n"), /%/)
})

test("the settings header groups phases by assistant in aligned columns", async (t) => {
  const markdown: string[] = []
  const header = async (auditor: Assistant) => {
    const f = await fixture(t)
    const visible: string[] = []
    const output = new RoundOutput(
      await roundRun(
        { ...testContext(f.root), plan: "example.md", auditor },
        Date.now(),
        selections,
      ),
      {
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
      claude: { model: "claude-opus-5[1m]", effort: "xhigh" },
      codex: { model: "gpt-6-astra", effort: "high" },
    })
    return visible.at(-1)
  }
  const codexHeader = [
    "audit    codex   gpt-6-astra high              codex settings",
    "rebut    codex   gpt-6-astra high              codex settings",
    "fix      codex   gpt-6-astra high              codex settings",
    "brief    codex   gpt-5.6-terra low             phase pin",
    "vet      claude  claude-opus-5[1m] extra high  claude settings",
    "verdict  claude  claude-opus-5[1m] extra high  claude settings",
  ]
  assert.equal(
    await header("claude"),
    [
      "audit    claude  claude-opus-5[1m] extra high  claude settings",
      "rebut    claude  claude-opus-5[1m] extra high  claude settings",
      "verdict  claude  claude-opus-5[1m] extra high  claude settings",
      "vet      codex   gpt-6-astra high              codex settings",
      "fix      codex   gpt-6-astra high              codex settings",
      "brief    codex   gpt-5.6-terra low             phase pin",
    ].join("\n"),
  )
  assert.equal(await header("codex"), codexHeader.join("\n"))
  assert.equal(
    markdown.at(-1),
    `\`\`\`text\n${codexHeader.join("\n")}\n\`\`\`\n`,
  )
})

test("the settings header names what set each phase's model and effort", async (t) => {
  const header = async (override: AuditorOverride) => {
    const f = await fixture(t)
    const visible: string[] = []
    const output = new RoundOutput(
      await roundRun(
        { ...testContext(f.root), plan: "example.md", override },
        Date.now(),
        selections,
      ),
      {
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
      claude: { model: "claude-opus-5[1m]", effort: "xhigh" },
      codex: { model: "gpt-5.6-sol", effort: "high" },
    })
    return (visible.at(-1) as string).split("\n")
  }
  // Both flags name the whole selection, and the fix keeps the CLI's own.
  assert.deepEqual(await header({ strength: "top", effort: "xhigh" }), [
    "audit    codex   gpt-6-astra extra high        --auditor",
    "rebut    codex   gpt-6-astra extra high        --auditor",
    "fix      codex   gpt-5.6-sol high              codex settings",
    "brief    codex   gpt-5.6-terra low             phase pin",
    "vet      claude  claude-opus-5[1m] extra high  claude settings",
    "verdict  claude  claude-opus-5[1m] extra high  claude settings",
  ])
  // One flag names one field, so the row reports both sources, model first.
  assert.deepEqual(
    (await header({ strength: "top", effort: null })).slice(0, 2),
    [
      "audit    codex   gpt-6-astra high              --auditor/codex settings",
      "rebut    codex   gpt-6-astra high              --auditor/codex settings",
    ],
  )
  assert.deepEqual(
    (await header({ strength: null, effort: "medium" })).slice(0, 2),
    [
      "audit    codex   gpt-5.6-sol medium            codex settings/--auditor",
      "rebut    codex   gpt-5.6-sol medium            codex settings/--auditor",
    ],
  )
})

test("the brief's text stays out of the transcript it retells", async (t) => {
  const f = await fixture(t)
  const visible: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testContext(f.root), plan: "example.md" },
      Date.now(),
      selections,
    ),
    {
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
  await output.phase.start(
    {
      phase: "brief",
      assistant: "claude",
      model: unpinned,
      ...testContext(f.root),
      ownerRoot: f.root,
      arguments: [output.paths.markdown],
      sessionId: null,
    },
    "Brief prompt",
  )
  await output.phase.observe({ type: "text", text: "Plain words" })
  const markdown = await readFile(output.paths.markdown, "utf8")
  assert.doesNotMatch(markdown, /## brief|Plain words/)
  assert.ok(visible.join("\n").includes("Plain words"))
  assert.match(await readFile(output.paths.log, "utf8"), /Brief prompt/)
})

test("a brief on its own logs beside the transcript and keeps no transcript", async (t) => {
  const f = await fixture(t)
  const transcript = join(f.root, "example-all-01-oth-round.md")
  const visible: string[] = []
  const markdown: string[] = []
  const output = new RoundOutput(
    briefRun(transcript, Date.parse("2026-09-13T08:00:00Z"), selections),
    {
      terminal: {
        write: (text) => {
          visible.push(text)
        },
        status: () => {},
        clear: () => {},
      },
      openFiles: (paths) => {
        assert.equal(paths.markdown, null)
        return {
          log: () => {},
          markdown: null,
          close: () => {},
        }
      },
    },
  )
  t.after(() => output.close())
  assert.match(output.paths.log, /example-all-01-oul-brief\.log$/)
  assert.equal(output.paths.markdown, null)
  assert.match(visible[1] as string, /^Brief of example-all-01-oth-round\.md\n/)
  assert.doesNotMatch(visible[1] as string, /Texts:/)
  output.models({
    claude: { model: "claude-opus-5[1m]", effort: "xhigh" },
    codex: { model: "gpt-6-astra", effort: "high" },
  })
  assert.equal(visible.at(-1), "brief  codex  gpt-5.6-terra low  phase pin")
  assert.deepEqual(markdown, [])
  output.finish({
    status: "finished",
    brief: `${transcript.slice(0, -3)}-brief.md`,
  })
  assert.equal(visible.at(-1), "Brief finished.")
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
