import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { test } from "node:test"
import { roundRun as buildRoundRun } from "../output.js"
import { pinnedSelection } from "../output-format.js"
import { parseRoundDataFile } from "../round-data.js"
import { RunClock } from "../run-clock.js"
import { settingsSchema } from "../settings.js"
import {
  noOverride,
  pinned,
  RoundOutput,
  roundPhases,
  roundRun,
  testSettings,
} from "./configured-runner.js"
import {
  fixture,
  inTurn,
  releases,
  resolved,
  testContext,
  testSetup,
} from "./helpers.js"

/** A ruling the run waits for; the clock reads only its begin and end. */
const waiting = {
  target: "example",
  title: "Implementation audit of example.md, step 1 (round 1)",
  ruling: "RULING.md",
  folder: "/repo",
  fixerSide: null,
  findings: [],
  panel: [],
} as const

for (const { zone, instant, timestamp } of [
  {
    zone: "Europe/Amsterdam",
    instant: "2026-09-11T08:28:41.208Z",
    timestamp: "2026-09-11T10:28:41.208+02:00",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-01-11T08:28:41.208Z",
    timestamp: "2026-01-11T09:28:41.208+01:00",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-10-25T00:30:00.000Z",
    timestamp: "2026-10-25T02:30:00.000+02:00",
  },
  {
    zone: "Europe/Amsterdam",
    instant: "2026-10-25T01:30:00.000Z",
    timestamp: "2026-10-25T02:30:00.000+01:00",
  },
  {
    zone: "America/Los_Angeles",
    instant: "2026-01-01T00:15:00.009Z",
    timestamp: "2025-12-31T16:15:00.009-08:00",
  },
  {
    zone: "Asia/Kathmandu",
    instant: "2026-09-11T23:30:00.000Z",
    timestamp: "2026-09-12T05:15:00.000+05:45",
  },
]) {
  test(`run headers retain the system zone ${zone} at ${instant}`, async (t) => {
    const f = await fixture(t)
    const previousZone = process.env.TZ
    process.env.TZ = zone
    t.after(() => {
      if (previousZone === undefined) delete process.env.TZ
      else process.env.TZ = previousZone
    })
    const log: string[] = []
    const markdown: string[] = []
    const visible: string[] = []
    const output = new RoundOutput(
      await roundRun(
        { ...testSetup(f.root), plan: "example.md", scope: "1" },
        Date.parse(instant),
        releases,
      ),
      {
        clock: new RunClock(() => Date.parse(instant)),
        terminal: {
          write: (text) => {
            visible.push(text)
          },
          status: () => {},
          clear: () => {},
        },
        openFiles: () => ({
          log: (text) => {
            log.push(text)
          },
          markdown: (text) => {
            markdown.push(text)
          },
          close: () => {},
        }),
      },
    )
    t.after(() => output.close())

    const logName = basename(output.paths.log)
    assert.equal(logName, "example-impl-audit-01..01-01-1-round.obh.log")
    assert.doesNotMatch(logName, /[:<>"|?*]/)
    assert.equal(
      output.paths.markdown,
      output.paths.log.replace(/\.log$/, ".md"),
    )
    for (const content of [log, markdown, visible]) {
      assert.ok(content.join("\n").includes(`Started ${timestamp}\n`))
    }
  })
}

test("elapsed readings count assistant work and never the user's own time", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const log: string[] = []
  const run = await roundRun(
    { ...testSetup(f.root), plan: "example.md", scope: "1" },
    Date.now(),
    releases,
  )
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write: () => {}, status: () => {}, clear: () => {} },
    openFiles: () => ({
      log: (text) => {
        log.push(text)
      },
      markdown: () => {},
      close: () => {},
    }),
  })
  t.after(() => output.close())
  const stamp = () => log.filter((text) => text.startsWith("\n[fix]")).at(-1)

  t.mock.timers.tick(5_000)
  await inTurn(output).start(
    {
      phase: "fix",
      rulingFile: "RULING.md",
      assistant: "codex",
      model: pinned("codex"),
      ...testContext("/repo"),
      arguments: ["REPORT.md"],
      sessionId: null,
    },
    "Full prompt",
  )
  t.mock.timers.tick(60_000)
  await inTurn(output).observe({ type: "text", text: "A ruling is needed." })
  assert.equal(stamp(), "\n[fix] 01:00  round 01:05  run 01:05")
  await inTurn(output).finish({
    status: "needs-ruling",
    sessionId: "session",
  })

  const session = {
    assistant: "codex" as const,
    model: pinned("codex"),
    sessionId: "session",
    ...testContext("/repo"),
  }
  output.beginRuling(waiting)
  // The user is away with the ruling; the round is doing nothing meanwhile.
  t.mock.timers.tick(30 * 60_000)
  output.endRuling("Take the redesign.")
  await inTurn(output).start(
    {
      ...session,
      phase: "fix",
      rulingFile: "RULING.md",
      arguments: ["REPORT.md"],
      rulingReply: "Take the redesign.",
    },
    "Continue the fix",
  )
  await inTurn(output).observe({ type: "text", text: "Applying your ruling." })
  assert.equal(stamp(), "\n[fix] 00:00  round 01:05  run 01:05")

  t.mock.timers.tick(120_000)
  await inTurn(output).observe({ type: "text", text: "Applied." })
  assert.equal(stamp(), "\n[fix] 02:00  round 03:05  run 03:05")

  output.beginRuling(waiting)
  t.mock.timers.tick(10 * 60_000)
  output.endRuling(null)
  output.finish({
    status: "awaiting-ruling",
    report: "REPORT.md",
    session,
    commits: [],
    account: { settling: "", judgedRepos: ["repo-edu"], findings: [] },
  })
  assert.equal(stamp(), "\n[fix] 02:00  round 03:05  run 03:05")
  assert.ok(run.data)
  assert.equal(
    parseRoundDataFile(run.data.path, await readFile(run.data.path, "utf8"))
      .rounds[0]?.phases[0]?.milliseconds,
    180_000,
  )
})

test("outputs sharing one clock carry the run reading across rounds and subtract a later wait", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const clock = new RunClock(Date.now)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const fix = {
    phase: "fix" as const,
    rulingFile: "RULING.md",
    assistant: "codex" as const,
    model: pinned("codex"),
    ...testContext("/repo"),
    arguments: ["REPORT.md"] as const,
  }
  const open = async () => {
    const log: string[] = []
    const output = new RoundOutput(
      await roundRun(setup, Date.now(), releases),
      {
        clock,
        terminal: { write: () => {}, status: () => {}, clear: () => {} },
        openFiles: () => ({
          log: (text) => {
            log.push(text)
          },
          markdown: () => {},
          close: () => {},
        }),
      },
    )
    t.after(() => output.close())
    const stamp = () => log.filter((text) => text.startsWith("\n[fix]")).at(-1)
    return { output, stamp }
  }

  // Startup work before the first round counts for the run alone.
  t.mock.timers.tick(2 * 60_000)
  const first = await open()
  await inTurn(first.output).start({ ...fix, sessionId: null }, "Full prompt")
  t.mock.timers.tick(3 * 60_000)
  await inTurn(first.output).observe({ type: "text", text: "Fixed." })
  assert.equal(first.stamp(), "\n[fix] 03:00  round 03:00  run 05:00")
  await inTurn(first.output).finish({ status: "finished", sessionId: "first" })
  first.output.close()

  // Runner work between the rounds belongs to the run too.
  t.mock.timers.tick(60_000)
  const second = await open()
  await inTurn(second.output).start({ ...fix, sessionId: null }, "Full prompt")
  t.mock.timers.tick(60_000)
  await inTurn(second.output).observe({ type: "text", text: "A ruling." })
  assert.equal(second.stamp(), "\n[fix] 01:00  round 01:00  run 07:00")
  await inTurn(second.output).finish({
    status: "needs-ruling",
    sessionId: "second",
  })
  second.output.beginRuling(waiting)
  t.mock.timers.tick(30 * 60_000)
  second.output.endRuling("Take the redesign.")
  await inTurn(second.output).start(
    { ...fix, sessionId: "second", rulingReply: "Take the redesign." },
    "Continue the fix",
  )
  t.mock.timers.tick(2 * 60_000)
  await inTurn(second.output).observe({ type: "text", text: "Applied." })
  // The half hour with the ruling leaves the round and the run alike.
  assert.equal(second.stamp(), "\n[fix] 02:00  round 03:00  run 09:00")
})

test("a finished phase stops its status timer", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const statuses: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testSetup(f.root), plan: "example.md", scope: "1" },
      Date.now(),
      releases,
    ),
    {
      clock: new RunClock(Date.now),
      terminal: {
        write: () => {},
        status: (text) => statuses.push(text),
        clear: () => {},
      },
    },
  )
  t.after(() => output.close())

  await inTurn(output).start(
    {
      phase: "fix",
      rulingFile: "RULING.md",
      assistant: "codex",
      model: pinned("codex"),
      ...testContext("/repo"),
      arguments: ["REPORT.md"],
      sessionId: null,
    },
    "Full prompt",
  )
  t.mock.timers.tick(1_000)
  await inTurn(output).finish({ status: "finished", sessionId: "session" })
  const finishedStatuses = statuses.length

  t.mock.timers.tick(1_000)

  assert.equal(statuses.length, finishedStatuses)
})

test("round data attributes the auditor to the audit phase's reported model", async (t) => {
  const f = await fixture(t)
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const run = await buildRoundRun(setup, Date.now(), releases, testSettings)
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write: () => {}, status: () => {}, clear: () => {} },
  })
  t.after(() => output.close())
  const audit = roundPhases("codex", noOverride).audit
  await inTurn(output).start(
    {
      ...setup,
      ...audit,
      phase: "audit",
      arguments: ["example-impl-audit-01..01-01", "example.md"],
      sessionId: null,
    },
    "Run the audit",
  )
  await inTurn(output).observe({
    type: "model",
    selection: { model: "reported-auditor", effort: "xhigh" },
  })
  await inTurn(output).finish({
    status: "finished",
    sessionId: "audit-session",
  })
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
  // The reported selection names the auditor; the seat keeps what it launched on.
  assert.deepEqual(entry?.auditor, {
    assistant: "codex",
    model: "reported-auditor",
    effort: "xhigh",
    chosenBy: "settings",
    seat: resolved("codex"),
  })
})

test("stopping between retained writes leaves the settled entry in progress", async (t) => {
  const f = await fixture(t)
  const run = await buildRoundRun(
    {
      ...testSetup(f.root),
      plan: "example.md",
      scope: "1",
      pool: testSettings.implementation.auditors,
    },
    Date.now(),
    releases,
    testSettings,
  )
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write: () => {}, status: () => {}, clear: () => {} },
  })
  output.writeSettledRound([], {
    settling: "",
    judgedRepos: ["repo-edu"],
    findings: [],
  })
  output.close()

  assert.ok(run.data)
  const [entry] = parseRoundDataFile(
    run.data.path,
    await readFile(run.data.path, "utf8"),
  ).rounds
  assert.equal(entry?.status, "in-progress")
  assert.equal(entry?.judge, null)
})

test("widening planning data retains the settling recommendation", async (t) => {
  const f = await fixture(t)
  const run = await buildRoundRun(
    {
      ...testSetup(f.root, "planning"),
      plan: "example-widen.md",
    },
    Date.now(),
    releases,
    testSettings,
  )
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write: () => {}, status: () => {}, clear: () => {} },
  })
  const settling = "keep open. Settle once finding 1 has landed."
  output.writeSettledRound([], {
    settling,
    judgedRepos: ["plan"],
    findings: [],
  })
  output.close()

  assert.ok(run.data)
  const [entry] = parseRoundDataFile(
    run.data.path,
    await readFile(run.data.path, "utf8"),
  ).rounds
  assert.ok(entry && "phase" in entry)
  assert.equal(entry.phase, "widening")
  assert.equal(entry.settling, settling)
})

test("the final retained write stores the series answer and resolved pool", async (t) => {
  const f = await fixture(t)
  const run = await buildRoundRun(
    {
      ...testSetup(f.root),
      plan: "example.md",
      scope: "1",
      pool: testSettings.implementation.auditors,
    },
    Date.now(),
    releases,
    testSettings,
  )
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write: () => {}, status: () => {}, clear: () => {} },
  })
  t.after(() => output.close())
  const account = {
    settling: "",
    judgedRepos: ["repo-edu"] as const,
    findings: [],
  }
  output.writeSettledRound([], account)
  output.finish({
    status: "finished",
    report: "REPORT.md",
    cleanAudit: true,
    decision: {
      answer: testSettings.implementation.auditors[1],
      reason: "Cross-check the retained result.",
    },
    watch: null,
    deferralChain: "none",
    commits: [],
    account,
  })

  assert.ok(run.data)
  const [entry] = parseRoundDataFile(
    run.data.path,
    await readFile(run.data.path, "utf8"),
  ).rounds
  assert.equal(entry?.status, "finished")
  assert.deepEqual(entry?.judge, {
    answer: { assistant: "claude", model: "opus", effort: "high" },
    reason: "Cross-check the retained result.",
  })
  assert.deepEqual(entry?.pool, testSettings.implementation.auditors)
})

for (const [name, abortReason, status] of [
  ["Ctrl-C cancellation", "Interrupted", "interrupted"],
  ["stdout failure cancellation", "stdout failed", "failed"],
] as const) {
  test(`${name} writes the matching retained status`, async (t) => {
    const f = await fixture(t)
    const run = await buildRoundRun(
      { ...testSetup(f.root), plan: "example.md", scope: "1" },
      Date.now(),
      releases,
      testSettings,
    )
    const output = new RoundOutput(run, {
      clock: new RunClock(Date.now),
      terminal: { write: () => {}, status: () => {}, clear: () => {} },
    })
    t.after(() => output.close())
    const account = {
      settling: "",
      judgedRepos: ["repo-edu"] as const,
      findings: [],
    }
    const interruption = new AbortController()
    interruption.abort(new Error(abortReason))
    output.finish(
      {
        status: "failed",
        phase: "audit",
        sessionId: "audit-session",
        assistant: "codex",
        model: pinned("codex"),
        ...testContext(f.root),
        reason: "Command was canceled",
        commits: [],
        account,
      },
      interruption.signal,
    )

    assert.ok(run.data)
    const [entry] = parseRoundDataFile(
      run.data.path,
      await readFile(run.data.path, "utf8"),
    ).rounds
    assert.equal(entry?.status, status)
  })
}

for (const assistant of ["claude", "codex"] as const) {
  test(`${assistant} fix tokens span a ruling resume exactly once in retained round data`, async (t) => {
    const f = await fixture(t)
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
    const settings = {
      ...testSettings,
      implementation: {
        ...testSettings.implementation,
        coders: [{ ...testSettings.implementation.coders[0], assistant }],
      },
    }
    const setup = {
      ...testSetup(f.root),
      plan: "example.md",
      scope: "1",
      fixer: settings.implementation.coders[0],
    }
    const run = await buildRoundRun(setup, Date.now(), releases, settings)
    const log: string[] = []
    const output = new RoundOutput(run, {
      clock: new RunClock(Date.now),
      terminal: { write: () => {}, status: () => {}, clear: () => {} },
      openFiles: () => ({
        log: (text) => {
          log.push(text)
        },
        markdown: () => {},
        close: () => {},
      }),
    })
    t.after(() => output.close())
    const turn = {
      ...setup,
      phase: "fix" as const,
      rulingFile: "RULING.md",
      assistant,
      model: pinned(assistant),
      arguments: ["REPORT.md"] as const,
    }
    const tokens = (input: number, cached: number, outputTokens: number) =>
      assistant === "claude"
        ? ({
            type: "tokens",
            update: {
              kind: "models",
              models: [
                {
                  model: resolved("claude").model,
                  input,
                  cached,
                  output: outputTokens,
                },
              ],
            },
          } as const)
        : ({
            type: "tokens",
            update: {
              kind: "selected-model",
              tokens: { input, cached, output: outputTokens },
            },
          } as const)

    await inTurn(output).start({ ...turn, sessionId: null }, "Start the fix")
    await inTurn(output).observe(tokens(100, 50, 10))
    t.mock.timers.tick(1000)
    await inTurn(output).finish({
      status: "needs-ruling",
      sessionId: "fix-session",
    })
    output.beginRuling(waiting)
    t.mock.timers.tick(60_000)
    output.endRuling("Use the single owner.")
    await inTurn(output).start(
      {
        ...turn,
        sessionId: "fix-session",
        rulingReply: "Use the single owner.",
      },
      "Resume the fix",
    )
    await inTurn(output).observe(tokens(120, 60, 12))
    t.mock.timers.tick(2000)
    await inTurn(output).finish({
      status: "finished",
      sessionId: "fix-session",
    })
    output.finish({
      status: "finished",
      report: "REPORT.md",
      cleanAudit: false,
      decision: null,
      watch: null,
      deferralChain: "none",
      commits: [
        {
          repository: "repo-edu",
          sha: "0123456789abcdef0123456789abcdef01234567",
        },
      ],
      account: { settling: "", judgedRepos: ["repo-edu"], findings: [] },
    })

    assert.ok(run.data)
    const data = parseRoundDataFile(
      run.data.path,
      await readFile(run.data.path, "utf8"),
    ).rounds[0]
    assert.ok(data)
    assert.equal(data.target, "example-impl-audit-01..01")
    assert.equal(data.round, 1)
    assert.equal(data.started, "1970-01-01T00:00:10.000Z")
    assert.equal(data.settings.fix.assistant, assistant)
    assert.deepEqual(data.auditor, {
      assistant: "codex",
      ...resolved("codex"),
      chosenBy: "settings",
      seat: resolved("codex"),
    })
    assert.deepEqual(data.phases, [
      {
        phase: "fix",
        assistant,
        ...resolved(assistant),
        launched: pinnedSelection(pinned(assistant)),
        milliseconds: 3000,
        tokens: [
          {
            model: resolved(assistant).model,
            input: 120,
            cached: 60,
            output: 12,
          },
        ],
        peakContext: null,
        compactions: 0,
      },
    ])
    assert.deepEqual(data.commits, [
      {
        repository: "repo-edu",
        sha: "0123456789abcdef0123456789abcdef01234567",
      },
    ])
    assert.ok(
      log.some(
        (line) => line.includes("tokens  ") && line.includes("input 0.1k"),
      ),
    )
  })
}

for (const assistant of ["claude", "codex"] as const) {
  test(`${assistant} phase retains peak context and warns once after compaction`, async (t) => {
    const f = await fixture(t)
    const visible: string[] = []
    const settings = {
      ...testSettings,
      implementation: {
        ...testSettings.implementation,
        coders: [{ ...testSettings.implementation.coders[0], assistant }],
      },
    }
    const setup = {
      ...testSetup(f.root),
      plan: "example.md",
      scope: "1",
      fixer: settings.implementation.coders[0],
    }
    const run = await buildRoundRun(setup, Date.now(), releases, settings)
    const output = new RoundOutput(run, {
      clock: new RunClock(Date.now),
      terminal: {
        write: (text) => visible.push(text),
        status: () => {},
        clear: () => {},
      },
    })
    t.after(() => output.close())
    await inTurn(output).start(
      {
        ...setup,
        phase: "fix",
        rulingFile: "RULING.md",
        assistant,
        model: pinned(assistant),
        arguments: ["REPORT.md"],
        sessionId: null,
      },
      "Run the fix",
    )
    await inTurn(output).observe({
      type: "context",
      tokens: 240_000,
      window: assistant === "codex" ? 258_400 : null,
    })
    await inTurn(output).observe({ type: "compaction" })
    await inTurn(output).observe({
      type: "context",
      tokens: 12_000,
      window: null,
    })
    await inTurn(output).observe({ type: "compaction" })
    await inTurn(output).finish({ status: "finished", sessionId: "session" })
    output.finish({
      status: "finished",
      report: "REPORT.md",
      cleanAudit: false,
      decision: null,
      watch: null,
      deferralChain: "none",
      commits: [],
      account: { settling: "", judgedRepos: ["repo-edu"], findings: [] },
    })

    assert.ok(run.data)
    const phase = parseRoundDataFile(
      run.data.path,
      await readFile(run.data.path, "utf8"),
    ).rounds[0]?.phases[0]
    assert.deepEqual(phase?.peakContext, {
      tokens: 240_000,
      window: assistant === "codex" ? 258_400 : null,
    })
    assert.equal(phase?.compactions, 2)
    assert.equal(
      visible.filter((text) => text.includes("phase compacted")).length,
      1,
    )
    assert.match(
      visible.join("\n"),
      /Use a narrower scope instead of a larger context window\./,
    )
  })
}

test("commit stamps time the finished audit, every vet and rebuttal and never the fix", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const settings = settingsSchema.parse({
    ...testSettings,
    implementation: {
      ...testSettings.implementation,
      vetters: [
        { assistant: "claude", model: "opus", effort: "high" },
        { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
      ],
    },
  })
  const phases = roundPhases("codex", noOverride, settings)
  const run = await buildRoundRun(setup, Date.now(), releases, settings)
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write: () => {}, status: () => {}, clear: () => {} },
    openFiles: () => ({ log: () => {}, markdown: () => {}, close: () => {} }),
  })
  t.after(() => output.close())
  const time = () => output.commitStamps()?.phases.split("\n").at(-1)
  const vet = (index: number) =>
    output.phase.start(
      {
        ...setup,
        ...phases.vet[index],
        phase: "vet",
        arguments: ["/report.md", run.documents.vets[index]],
        sessionId: null,
      },
      "prompt",
    )
  const start = (phase: "audit" | "rebut" | "fix") =>
    inTurn(output).start(
      {
        ...setup,
        ...phases[phase],
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
              : {
                  phase,
                  arguments: ["/report.md", "/rebut.md"] as const,
                  rulingFile: "/ruling.md",
                }),
        sessionId: null,
      },
      "prompt",
    )
  const finished = { status: "finished", sessionId: "session" } as const
  const finish = () => inTurn(output).finish(finished)

  await start("audit")
  t.mock.timers.tick(4 * 60_000)
  // A running audit has taken no time a commit could state yet.
  assert.equal(time(), "audit: gpt-5.6-sol high")
  await finish()
  assert.equal(time(), "Audit took 4 min.")
  // Both vets run at once; the line adds up each vet's own time.
  const first = await vet(0)
  const second = await vet(1)
  t.mock.timers.tick(2 * 60_000)
  await first.finish(finished)
  first.release()
  t.mock.timers.tick(60_000)
  await second.finish(finished)
  second.release()
  assert.equal(time(), "Audit and vet took 9 min.")
  // The Codex vet runs on the audit's own selection, so it shares its line.
  assert.deepEqual(output.commitStamps()?.phases.split("\n").slice(0, -1), [
    "audit, vet: gpt-5.6-sol high",
    "vet: claude-opus-5 high",
  ])
  await start("rebut")
  t.mock.timers.tick(60_000)
  await finish()
  await start("fix")
  t.mock.timers.tick(10 * 60_000)
  await finish()
  // The fix commits while it runs, so the line never counts it.
  assert.equal(time(), "Audit, vet and rebuttal took 10 min.")
})

test("two vets' mixed events keep their own slots and records, each vet's text held whole and named by its tag", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const setup = { ...testSetup(f.root), plan: "example.md", scope: "1" }
  const settings = settingsSchema.parse({
    ...testSettings,
    implementation: {
      ...testSettings.implementation,
      vetters: [
        { assistant: "claude", model: "opus", effort: "high" },
        { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
      ],
    },
  })
  const phases = roundPhases("codex", noOverride, settings)
  const run = await buildRoundRun(setup, Date.now(), releases, settings)
  const log: string[] = []
  const markdown: string[] = []
  const output = new RoundOutput(run, {
    clock: new RunClock(Date.now),
    terminal: { write: () => {}, status: () => {}, clear: () => {} },
    openFiles: () => ({
      log: (text) => {
        log.push(text)
      },
      markdown: (text) => {
        markdown.push(text)
      },
      close: () => {},
    }),
  })
  t.after(() => output.close())
  const [claude, codex] = await Promise.all(
    phases.vet.map((vet, index) =>
      output.phase.start(
        {
          ...setup,
          ...vet,
          phase: "vet",
          arguments: ["/report.md", run.documents.vets[index]],
          sessionId: null,
        },
        "prompt",
      ),
    ),
  )
  const tokens = (input: number) =>
    ({
      type: "tokens",
      update: {
        kind: "selected-model",
        tokens: { input, cached: 0, output: 1 },
      },
    }) as const
  // The two vets' events arrive interleaved, as two sessions stream at once.
  await claude.observe({ type: "session", sessionId: "claude-vet" })
  await codex.observe({ type: "session", sessionId: "codex-vet" })
  await claude.observe({ type: "text", text: "Claude opens." })
  await codex.observe({ type: "text", text: "Codex opens." })
  await codex.observe({
    type: "tool",
    invocation: "rg finding",
    detail: null,
    stage: "started",
  })
  await claude.observe({ type: "text", text: "Claude closes." })
  await claude.observe(tokens(100))
  await codex.observe(tokens(200))
  t.mock.timers.tick(2 * 60_000)
  // Only a vet that ends writes its texts, whole and under its own heading.
  assert.equal(
    markdown.some((text) => text.includes("opens.")),
    false,
  )
  await codex.observe({ type: "text", text: "Codex closes." })
  await codex.finish({ status: "finished", sessionId: "codex-vet" })
  codex.release()
  t.mock.timers.tick(60_000)
  await claude.finish({ status: "finished", sessionId: "claude-vet" })
  claude.release()

  const transcript = markdown.join("")
  const codexStart = transcript.indexOf("## vet obh (codex, fresh)")
  const claudeStart = transcript.indexOf("## vet abh (claude, fresh)")
  assert.ok(codexStart >= 0 && claudeStart > codexStart, transcript)
  assert.deepEqual(
    ["Codex opens.", "Codex closes.", "Claude opens.", "Claude closes."].map(
      (text) =>
        transcript.indexOf(text) >
        (text.startsWith("Codex") ? codexStart : claudeStart),
    ),
    [true, true, true, true],
  )
  assert.ok(transcript.indexOf("Codex closes.") < claudeStart)
  const text = log.join("\n")
  assert.match(text, /\[vet abh\] claude session claude-vet/)
  assert.match(text, /\[vet obh\] codex session codex-vet/)
  assert.match(text, /\[vet obh\] .* rg finding/)
  assert.match(text, /\[vet obh\] finished/)
  assert.match(text, /\[vet abh\] finished/)
  output.finish({
    status: "finished",
    report: "REPORT.md",
    cleanAudit: false,
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
  // Each vet keeps its own phase entry: its tag, model, time and tokens.
  assert.deepEqual(
    entry?.phases.map((phase) =>
      phase.phase === "vet"
        ? {
            tag: phase.tag,
            assistant: phase.assistant,
            milliseconds: phase.milliseconds,
            input: phase.tokens.map((usage) => usage.input),
          }
        : phase.phase,
    ),
    [
      { tag: "abh", assistant: "claude", milliseconds: 180_000, input: [100] },
      { tag: "obh", assistant: "codex", milliseconds: 120_000, input: [200] },
    ],
  )
  // The settings name the panel by the releases its aliases resolved to.
  assert.deepEqual(entry?.settings.vetters, [
    { assistant: "claude", model: "claude-opus-5", effort: "high" },
    { assistant: "codex", model: "gpt-5.6-sol", effort: "high" },
  ])
})

test("tool lines report step and total assistant time, excluding user waits", async (t) => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 10_000 })
  const log: string[] = []
  const output = new RoundOutput(
    await roundRun(
      { ...testSetup(f.root), plan: "example.md", scope: "1" },
      Date.now(),
      releases,
    ),
    {
      clock: new RunClock(Date.now),
      terminal: { write: () => {}, status: () => {}, clear: () => {} },
      openFiles: () => ({
        log: (text) => {
          log.push(text)
        },
        markdown: () => {},
        close: () => {},
      }),
    },
  )
  t.after(() => output.close())
  const tool = (invocation: string) =>
    inTurn(output).observe({
      type: "tool",
      invocation,
      detail: null,
      stage: "started",
    })
  const line = () => log.at(-1)

  await inTurn(output).start(
    {
      phase: "fix",
      rulingFile: "RULING.md",
      assistant: "codex",
      model: pinned("codex"),
      ...testContext("/repo"),
      arguments: ["REPORT.md"],
      sessionId: null,
    },
    "Full prompt",
  )
  t.mock.timers.tick(7_000)
  await tool("first")
  assert.match(
    line() as string,
    /^ {2}00:07 {2}00:07 {2}00:07\s+--\s+--\s+--\s+first$/,
  )
  // A written stamp in between does not reset the step: it counts tool line to tool line.
  t.mock.timers.tick(60_000)
  await inTurn(output).observe({ type: "text", text: "Half way." })
  t.mock.timers.tick(11 * 60_000)
  await tool("second")
  assert.match(
    line() as string,
    /^ {2}12:00 {2}12:07 {2}12:07\s+--\s+--\s+--\s+second$/,
  )

  const session = {
    assistant: "codex" as const,
    model: pinned("codex"),
    sessionId: "session",
    ...testContext("/repo"),
  }
  output.beginRuling(waiting)
  t.mock.timers.tick(30 * 60_000)
  output.endRuling("Take the redesign.")
  await inTurn(output).start(
    {
      ...session,
      phase: "fix",
      rulingFile: "RULING.md",
      arguments: ["REPORT.md"],
      rulingReply: "Take the redesign.",
    },
    "Continue the fix",
  )
  await inTurn(output).observe({ type: "text", text: "Applying your ruling." })
  t.mock.timers.tick(4_000)
  await inTurn(output).observe({
    type: "tool",
    invocation: "third",
    detail: null,
    stage: "started",
  })
  // The resumed fix restarted the step and the user's half hour was theirs.
  assert.match(
    line() as string,
    /^ {2}00:04 {2}12:11 {2}12:11\s+--\s+--\s+--\s+third$/,
  )
})
