import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { nextCoder } from "../lifecycle.js"
import { auditorSetting } from "../queue.js"
import { codexArguments } from "../requests.js"
import {
  coderRecord,
  defaultSettings,
  parseCoderRecord,
  readSettings,
  settingsSchema,
} from "../settings.js"
import {
  listedSeat,
  modelStrength,
  noOverride,
  parseAuditor,
  roundPhases,
  testSettings as settings,
} from "./configured-runner.js"

test("a missing settings file is generated from the built-in defaults", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "audit-settings-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "settings.json")
  assert.deepEqual(await readSettings(path), defaultSettings)
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), defaultSettings)
  assert.equal(defaultSettings.defaultAuditor, "random")

  const edited = structuredClone(settings)
  edited.defaultAuditor = "random"
  edited.phases.watch = {
    assistant: "claude",
    model: "custom-watch",
    effort: "low",
  }
  const contents = JSON.stringify(edited)
  await writeFile(path, contents)
  assert.deepEqual(await readSettings(path), edited)
  assert.equal(await readFile(path, "utf8"), contents)
})

test("settings may carry comments and trailing commas", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "audit-settings-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "settings.json")
  const edited = structuredClone(settings)
  edited.coders = [{ assistant: "claude", model: "opus", effort: "high" }]
  const contents = JSON.stringify(edited, null, 2)
    .replace(
      '"coders": [',
      '"coders": [\n    // { "assistant": "codex", "model": "gpt-5.6-sol", "effort": "high" },',
    )
    .replace('"effort": "high" }\n  ]', '"effort": "high" },\n  ]')
    .replace("{\n", "{ /* local selection */\n")
  await writeFile(path, contents)
  assert.deepEqual(await readSettings(path), edited)
  assert.equal(await readFile(path, "utf8"), contents)
})

test("malformed and invalid settings report their path without replacing the file", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "audit-settings-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "settings.json")
  for (const contents of ["{broken", '{"defaultAuditor":"unknown"}']) {
    await writeFile(path, contents)
    await assert.rejects(readSettings(path), (error: Error) => {
      assert.ok(error.message.includes(path))
      assert.match(error.message, /Invalid audit-round settings/)
      return true
    })
    assert.equal(await readFile(path, "utf8"), contents)
  }
})

test("ready coder records parse exactly and assignment advances through the list", () => {
  const coders = [
    { assistant: "claude", model: "claude-opus-5-5", effort: "xhigh" },
    { assistant: "codex", model: "gpt-6.1-sol", effort: "high" },
  ] as const
  assert.deepEqual(parseCoderRecord(coderRecord(coders[0])), coders[0])
  assert.deepEqual(nextCoder(coders, null), coders[0])
  assert.deepEqual(nextCoder(coders, coders[0]), coders[1])
  assert.deepEqual(nextCoder(coders, coders[1]), coders[0])
  assert.deepEqual(nextCoder([coders[1]], coders[1]), coders[1])
  for (const body of [
    "",
    "Coder: codex gpt-6.1-sol",
    "Coder: unknown gpt-6.1-sol high",
    `${coderRecord(coders[0])}\nExtra: value`,
  ])
    assert.equal(parseCoderRecord(body), null)
})

test("phase fields read the assistant's defaults and apply partial auditor overrides", () => {
  const config = structuredClone(settings)
  config.strengthModels.codex.top = "custom-top-model"
  config.defaults.codex = { model: "codex-default", effort: "xhigh" }
  config.coders = [
    { assistant: "codex", model: "assigned-coder", effort: "xhigh" },
  ]
  config.auditors = [
    { assistant: "codex", model: "listed-auditor", effort: "medium" },
  ]
  config.phases.watch = { assistant: "codex", model: "default", effort: "low" }
  const phases = roundPhases(
    "codex",
    { option: "--auditor", strength: "top", effort: null },
    config,
  )
  // A field the tag leaves unnamed reads the defaults, never a listed auditor.
  assert.deepEqual(phases.audit.model, {
    model: { value: "custom-top-model", source: "--auditor" },
    effort: { value: "xhigh", source: "audit-round defaults" },
  })
  assert.deepEqual(phases.rebut, phases.audit)
  assert.deepEqual(phases.watch.model, {
    model: { value: "codex-default", source: "audit-round defaults" },
    effort: { value: "low", source: "audit-round settings" },
  })
  assert.deepEqual(codexArguments(null, phases.watch.model), [
    "exec",
    "--approve-for-me",
    "-m",
    "codex-default",
    "-c",
    "model_reasoning_effort=low",
    "--json",
  ])
  assert.deepEqual(phases.fix.model, {
    model: { value: "assigned-coder", source: "audit-round coders" },
    effort: { value: "xhigh", source: "audit-round coders" },
  })
  assert.equal(modelStrength("codex", "custom-top-model", config), "top")
  assert.equal(modelStrength("codex", "gpt-6-astra", config), null)
  // A field names the option its tag came from.
  const effortOnly = roundPhases(
    "codex",
    { option: "--first", strength: null, effort: "high" },
    config,
  )
  assert.deepEqual(effortOnly.audit.model, {
    model: { value: "codex-default", source: "audit-round defaults" },
    effort: { value: "high", source: "--first" },
  })
})

test("the auditors list names whole selections and replaces the audit pins", () => {
  const config = structuredClone(settings)
  config.auditors = [
    { assistant: "claude", model: "claude-fable-5-1", effort: "high" },
    { assistant: "claude", model: "claude-opus-5-5", effort: "xhigh" },
  ]
  assert.equal(settingsSchema.safeParse(config).success, true)
  // Full names resolve to themselves, so each entry runs as written.
  const releases = { claude: new Map(), codex: new Map() }
  for (const auditor of config.auditors) {
    const seat = listedSeat(auditor)
    const phases = roundPhases(seat.assistant, seat.override, config)
    assert.deepEqual(phases.audit, {
      assistant: "claude",
      model: {
        model: { value: auditor.model, source: "audit-round auditors" },
        effort: { value: auditor.effort, source: "audit-round auditors" },
      },
    })
    assert.deepEqual(phases.rebut, phases.audit)
    assert.equal(phases.vet.assistant, "codex")
    assert.deepEqual(auditorSetting(seat, releases, config), auditor)
  }
  // A resolved command-line seat joins the pool as the entry it runs.
  const first = parseAuditor("otx", "--first")
  assert.ok(first)
  assert.deepEqual(auditorSetting(first, releases, config), {
    assistant: "codex",
    model: config.strengthModels.codex.top,
    effort: "xhigh",
  })
  // No pin remains, so an unnamed seat runs the assistant's defaults.
  assert.deepEqual(
    roundPhases("codex", noOverride, config).audit.model,
    roundPhases(
      "codex",
      { option: "--auditor", strength: null, effort: null },
      config,
    ).audit.model,
  )

  for (const auditors of [
    [],
    [{ assistant: "codex", model: "default", effort: "high" }],
    [{ assistant: "codex", model: "gpt-5.6-sol", effort: "default" }],
    [{ assistant: "codex", model: "gpt-5.6-sol" }],
  ])
    assert.equal(
      settingsSchema.safeParse({ ...config, auditors }).success,
      false,
    )
  assert.equal(
    settingsSchema.safeParse({
      ...config,
      phases: {
        ...config.phases,
        audit: {
          claude: { model: "default", effort: "default" },
          codex: { model: "default", effort: "default" },
        },
      },
    }).success,
    false,
  )
  for (const defaultAuditor of ["claude", "codex", "alternate"])
    assert.equal(
      settingsSchema.safeParse({ ...config, defaultAuditor }).success,
      false,
    )
})

test("the coder and assigned phases follow their configured assistants independently of the auditor", () => {
  for (const auditor of ["claude", "codex"] as const) {
    for (const assistant of ["claude", "codex"] as const) {
      const config = structuredClone(settings)
      config.coders = [{ assistant, model: "custom-fixer", effort: "high" }]
      config.phases.watch = { assistant, model: "default", effort: "default" }
      config.phases.judge = { assistant, model: "cheap-judge", effort: "low" }
      const phases = roundPhases(auditor, noOverride, config)
      assert.deepEqual(phases.fix, {
        assistant,
        model: {
          model: { value: "custom-fixer", source: "audit-round coders" },
          effort: { value: "high", source: "audit-round coders" },
        },
      })
      const { model, effort } = config.defaults[assistant]
      assert.deepEqual(phases.watch, {
        assistant,
        model: {
          model: { value: model, source: "audit-round defaults" },
          effort: { value: effort, source: "audit-round defaults" },
        },
      })
      assert.deepEqual(phases.judge, {
        assistant,
        model: {
          model: { value: "cheap-judge", source: "audit-round settings" },
          effort: { value: "low", source: "audit-round settings" },
        },
      })
      assert.equal(
        phases.vet.assistant,
        auditor === "claude" ? "codex" : "claude",
      )
      assert.deepEqual(phases.rebut, phases.audit)
    }
  }
})

test("assistant names and bare letter tags both read the defaults across chained auditors", () => {
  const config = structuredClone(settings)
  config.auditors = [
    { assistant: "claude", model: "claude-auditor", effort: "high" },
    { assistant: "codex", model: "codex-auditor", effort: "medium" },
  ]
  for (const value of ["claude", "codex", "a", "o"]) {
    const seat = parseAuditor(value, "--first")
    assert.ok(seat)
    assert.equal(
      seat.assistant,
      value === "claude" || value === "a" ? "claude" : "codex",
    )
    for (const assistant of ["claude", "codex"] as const) {
      const phases = roundPhases(assistant, seat.override, config)
      const configured = roundPhases(assistant, noOverride, config)
      const { model, effort } = config.defaults[assistant]
      const source = value.length > 1 ? "--first" : "audit-round defaults"
      assert.deepEqual(phases.audit.model, {
        model: { value: model, source },
        effort: { value: effort, source },
      })
      assert.deepEqual(phases.rebut, phases.audit)
      for (const phase of ["vet", "fix", "watch", "judge"] as const)
        assert.deepEqual(phases[phase], configured[phase])
    }
  }
})

test("alternating auditors and vetters keep their own configured models", () => {
  const config = structuredClone(settings)
  config.auditors = [
    { assistant: "claude", model: "claude-auditor", effort: "high" },
    { assistant: "codex", model: "codex-auditor", effort: "medium" },
  ]
  config.phases.vet.claude = { model: "claude-vetter", effort: "low" }
  config.phases.vet.codex = { model: "codex-vetter", effort: "xhigh" }
  for (const auditor of config.auditors) {
    const assistant = auditor.assistant
    const vetter = assistant === "claude" ? "codex" : "claude"
    const seat = listedSeat(auditor)
    const phases = roundPhases(assistant, seat.override, config)
    assert.equal(phases.audit.model.model?.value, `${assistant}-auditor`)
    assert.equal(phases.vet.model.model?.value, `${vetter}-vetter`)
    assert.equal(
      phases.vet.model.effort?.value,
      config.phases.vet[vetter].effort,
    )
    assert.deepEqual(phases.rebut, phases.audit)
  }
})

test("settings reject null fields, unsupported effort, misspelt fields and independent rebuttal settings", () => {
  for (const patch of [
    { effort: "extra-high" },
    { model: " " },
    { model: null },
    { effort: null },
    { assitant: "codex" },
  ]) {
    const config = structuredClone(settings)
    Object.assign(config.phases.watch, patch)
    assert.equal(settingsSchema.safeParse(config).success, false)
  }
  // The defaults name a selection outright, so neither field may defer again.
  for (const patch of [{ model: "default" }, { effort: "default" }]) {
    const config = structuredClone(settings)
    Object.assign(config.defaults.claude, patch)
    assert.equal(settingsSchema.safeParse(config).success, false)
  }
  assert.equal(
    settingsSchema.safeParse({
      ...settings,
      phases: { ...settings.phases, rebut: settings.phases.vet },
    }).success,
    false,
  )
  assert.equal(
    settingsSchema.safeParse({ ...settings, coders: [] }).success,
    false,
  )
  assert.equal(
    settingsSchema.safeParse({
      ...settings,
      coders: [
        { assistant: "codex", model: "model with spaces", effort: "high" },
      ],
    }).success,
    false,
  )
  for (const maximumAutomaticRounds of [0, -1, 1.5])
    assert.equal(
      settingsSchema.safeParse({ ...settings, maximumAutomaticRounds }).success,
      false,
    )
})
