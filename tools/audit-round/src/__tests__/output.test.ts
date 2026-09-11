import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { Writable } from "node:stream"
import { test } from "node:test"
import { RoundOutput } from "../output.js"
import { commandText } from "../output-format.js"
import { createTerminal } from "../terminal.js"
import { fixture } from "./helpers.js"

test("output records incrementally, keeps complete detail and refreshes only while a phase runs", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10000 })
  const visible: string[] = []
  const status: string[] = []
  let clears = 0
  const output = new RoundOutput(
    { repoRoot: f.root, plan: "example.md" },
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
        cwd: f.root,
        ownerRoot: f.root,
        arguments: ["example.md"],
        sessionId: null,
      },
      "Full prompt\nMore prompt",
    )
  await start()
  const tool = async (command: string) =>
    output.phase.observe({
      type: "tool",
      name: "shell",
      detail: { command },
      command,
      stage: "started",
    })
  await tool("first command")
  assert.match(visible.at(-1) as string, /--\s+--\s+--\s+shell first command/)
  await output.phase.observe({ type: "context", tokens: 26000, window: 100000 })
  await tool("/bin/zsh -lc 'printf audit-round-probe'")
  assert.match(
    visible.at(-1) as string,
    /--\s+26k\s+26%\s+shell printf audit-round-probe/,
  )
  await output.phase.observe({ type: "context", tokens: 26200, window: 100000 })
  await tool("second command")
  assert.match(visible.at(-1) as string, /0\.2k\s+26k\s+26%/)
  t.mock.timers.tick(3000)
  assert.match(
    status.at(-1) as string,
    /\[audit\] 00:03\s+context\s+0\.2k\s+26k\s+26%/,
  )
  await output.phase.observe({
    type: "text",
    text: "Full assistant text\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
  })
  assert.match(status.at(-1) as string, /0\.2k/)
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
  assert.ok(log.includes(long))
  assert.ok(log.includes("x".repeat(400)))
  assert.match(log, /-18\.2k\s+8k\s+8%/)
  assert.match(log, /Full prompt\nMore prompt/)
  await output.phase.finish({
    status: "finished",
    sessionId: "audit",
    file: "/AUDIT.md",
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

test("Claude measurements omit percentages when the window is unknown", async (t) => {
  const f = await fixture(t)
  const visible: string[] = []
  const output = new RoundOutput(
    { repoRoot: f.root, plan: "example.md" },
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
      cwd: f.root,
      ownerRoot: f.root,
      arguments: ["/AUDIT.md"],
      sessionId: null,
    },
    "prompt",
  )
  await output.phase.observe({ type: "context", tokens: 12000, window: null })
  await output.phase.observe({ type: "text", text: "Assistant reply" })
  assert.match(visible.join("\n"), /context\s+--\s+12k/)
  assert.doesNotMatch(visible.join("\n"), /%/)
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
