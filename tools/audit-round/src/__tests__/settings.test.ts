import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import defaults from "../../default-settings.json" with { type: "json" }
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
import type { CommitGroup, CommitTarget } from "../target.js"
import {
  listedSeat,
  modelStrength,
  namedModels,
  noOverride,
  parseAuditor,
  roundFixer,
  roundPhases,
  testSettings as settings,
  targetWorkClass,
} from "./configured-runner.js"

test("a missing settings file is generated from the built-in defaults", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "audit-settings-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "settings.json")
  assert.deepEqual(await readSettings(path), defaultSettings)
  // The generated file keeps each list entry's `default` as the built-in copy writes it.
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), defaults)
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
  edited.implementation.coders = [
    { assistant: "claude", model: "opus", effort: "high" },
  ]
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
  config.implementation.coders = [
    { assistant: "codex", model: "assigned-coder", effort: "xhigh" },
  ]
  config.implementation.auditors = [
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
    model: {
      value: "assigned-coder",
      source: "audit-round implementation coders",
    },
    effort: { value: "xhigh", source: "audit-round implementation coders" },
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

test("each class's auditors list names whole selections and replaces the audit pins", () => {
  const config = structuredClone(settings)
  config.implementation.auditors = [
    { assistant: "claude", model: "claude-fable-5-1", effort: "high" },
    { assistant: "claude", model: "claude-opus-5-5", effort: "xhigh" },
  ]
  assert.equal(settingsSchema.safeParse(config).success, true)
  // Full names resolve to themselves, so each entry runs as written.
  const releases = { claude: new Map(), codex: new Map() }
  for (const auditor of config.implementation.auditors) {
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
    // The panel is the class's vetter list, so a Claude audit has a Claude vet.
    assert.deepEqual(
      phases.vet.map(({ assistant }) => assistant),
      ["claude"],
    )
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

  for (const workClass of ["planning", "implementation"] as const)
    for (const auditors of [[], [{ assistant: "codex", model: "gpt-5.6-sol" }]])
      assert.equal(
        settingsSchema.safeParse({
          ...config,
          [workClass]: { ...config[workClass], auditors },
        }).success,
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

test("list entries that say default read the assistant's defaults when the file loads", () => {
  const config = settingsSchema.parse({
    ...settings,
    defaults: {
      claude: { model: "claude-default", effort: "xhigh" },
      codex: { model: "codex-default", effort: "medium" },
    },
    planning: {
      auditors: [{ assistant: "claude", model: "default", effort: "default" }],
      fixer: { assistant: "claude", model: "default", effort: "low" },
      vetters: [{ assistant: "claude", model: "default", effort: "default" }],
    },
    implementation: {
      auditors: [
        { assistant: "claude", model: "default", effort: "default" },
        { assistant: "codex", model: "listed-auditor", effort: "default" },
      ],
      coders: [{ assistant: "codex", model: "default", effort: "high" }],
      vetters: [{ assistant: "codex", model: "default", effort: "low" }],
    },
  })
  assert.deepEqual(config.planning.vetters, [
    { assistant: "claude", model: "claude-default", effort: "xhigh" },
  ])
  assert.deepEqual(config.implementation.vetters, [
    { assistant: "codex", model: "codex-default", effort: "low" },
  ])
  assert.deepEqual(config.implementation.auditors, [
    { assistant: "claude", model: "claude-default", effort: "xhigh" },
    { assistant: "codex", model: "listed-auditor", effort: "medium" },
  ])
  assert.deepEqual(config.implementation.coders, [
    { assistant: "codex", model: "codex-default", effort: "high" },
  ])
  // A ready marker records the resolved selection, never the word default.
  assert.equal(
    coderRecord(nextCoder(config.implementation.coders, null)),
    "Coder: codex codex-default high",
  )
  assert.deepEqual(roundPhases("codex", noOverride, config).fix.model, {
    model: {
      value: "codex-default",
      source: "audit-round implementation coders",
    },
    effort: { value: "high", source: "audit-round implementation coders" },
  })
})

test("the coder and assigned phases follow their configured assistants independently of the auditor", () => {
  for (const auditor of ["claude", "codex"] as const) {
    for (const assistant of ["claude", "codex"] as const) {
      const config = structuredClone(settings)
      config.implementation.coders = [
        { assistant, model: "custom-fixer", effort: "high" },
      ]
      config.phases.watch = { assistant, model: "default", effort: "default" }
      const phases = roundPhases(auditor, noOverride, config)
      assert.deepEqual(phases.fix, {
        assistant,
        model: {
          model: {
            value: "custom-fixer",
            source: "audit-round implementation coders",
          },
          effort: {
            value: "high",
            source: "audit-round implementation coders",
          },
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
      assert.deepEqual(phases.vet, roundPhases(auditor, noOverride).vet)
      assert.deepEqual(phases.rebut, phases.audit)
    }
  }
})

test("planning work fixes on the planning fixer and code work on a coder", () => {
  const config = structuredClone(settings)
  config.planning.fixer = {
    assistant: "claude",
    model: "planner",
    effort: "medium",
  }
  config.implementation.coders = [
    { assistant: "codex", model: "first-coder", effort: "high" },
    { assistant: "claude", model: "second-coder", effort: "low" },
  ]
  const assigned = config.implementation.coders[1]
  const planning = {
    fixer: config.planning.fixer,
    fixerSource: "audit-round planning fixer",
  }
  const firstCoder = {
    fixer: config.implementation.coders[0],
    fixerSource: "audit-round implementation coders",
  }
  // A planning round after ready keeps the planning fixer, not the plan's coder.
  for (const ready of [null, assigned])
    assert.deepEqual(
      roundFixer({ roundKind: "planning", plan: "example.md" }, ready, config),
      planning,
    )
  const implementation = {
    roundKind: "implementation",
    plan: "example.md",
    scope: "1",
  } as const
  assert.deepEqual(roundFixer(implementation, assigned, config), {
    fixer: assigned,
    fixerSource: "ready assignment",
  })
  assert.deepEqual(roundFixer(implementation, null, config), firstCoder)
  const group = (repository: CommitGroup["repository"]): CommitGroup => ({
    repository,
    references: ["HEAD"],
    startingHead: "a".repeat(40),
    commits: ["a".repeat(40)],
    shortReferences: ["aaaaaa"],
  })
  const commit = (
    ...groups: [CommitGroup, ...CommitGroup[]]
  ): CommitTarget => ({
    roundKind: "implementation",
    groups,
    originalGroups: groups,
  })
  assert.equal(
    targetWorkClass({ roundKind: "planning", plan: "example.md" }),
    "planning",
  )
  assert.equal(targetWorkClass(implementation), "implementation")
  assert.equal(targetWorkClass(commit(group("plan"))), "planning")
  assert.equal(targetWorkClass(commit(group("repo-edu"))), "implementation")
  assert.equal(
    targetWorkClass(commit(group("repo-edu"), group("plan"))),
    "implementation",
  )
  assert.deepEqual(roundFixer(commit(group("plan")), null, config), planning)
  assert.deepEqual(
    roundFixer(commit(group("repo-edu")), null, config),
    firstCoder,
  )
  assert.deepEqual(
    roundFixer(commit(group("repo-edu"), group("plan")), null, config),
    firstCoder,
  )
})

test("the planning fixer resolves its defaults and the old shape is refused", async (t) => {
  const config = settingsSchema.parse({
    ...settings,
    defaults: {
      claude: { model: "claude-default", effort: "xhigh" },
      codex: { model: "codex-default", effort: "medium" },
    },
    planning: {
      ...settings.planning,
      fixer: { assistant: "claude", model: "default", effort: "low" },
    },
  })
  assert.deepEqual(config.planning.fixer, {
    assistant: "claude",
    model: "claude-default",
    effort: "low",
  })
  assert.ok(namedModels("claude", config).has("claude-default"))
  const named = structuredClone(config)
  named.planning.fixer.model = "planning-only"
  const planningAuditor = named.planning.auditors.find(
    ({ assistant }) => assistant === "claude",
  )
  const implementationAuditor = named.implementation.auditors.find(
    ({ assistant }) => assistant === "claude",
  )
  assert.ok(planningAuditor)
  assert.ok(implementationAuditor)
  planningAuditor.model = "planning-auditor"
  implementationAuditor.model = "implementation-auditor"
  named.implementation.coders[0].model = "implementation-coder"
  assert.ok(namedModels("claude", named).has("planning-only"))
  assert.ok(namedModels("claude", named).has("planning-auditor"))
  assert.ok(namedModels("claude", named).has("implementation-auditor"))
  assert.ok(namedModels("codex", named).has("implementation-coder"))
  // A file in the old top-level list shape stops with the validation error.
  const root = await mkdtemp(join(tmpdir(), "audit-settings-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "settings.json")
  const { planning: _, implementation: __, ...common } = settings
  const contents = JSON.stringify({
    ...common,
    auditors: settings.planning.auditors,
    coders: settings.implementation.coders,
    phases: {
      ...settings.phases,
      planningFix: settings.planning.fixer,
    },
  })
  await writeFile(path, contents)
  await assert.rejects(readSettings(path), /Invalid audit-round settings/)
  assert.equal(await readFile(path, "utf8"), contents)
})

test("assistant names and bare letter tags both read the defaults across chained auditors", () => {
  const config = structuredClone(settings)
  config.implementation.auditors = [
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
      for (const phase of ["vet", "fix", "watch"] as const)
        assert.deepEqual(phases[phase], configured[phase])
    }
  }
})

test("every audit report of a class gets that class's whole panel, whoever audits", () => {
  const config = settingsSchema.parse({
    ...settings,
    planning: {
      ...settings.planning,
      vetters: [
        { assistant: "claude", model: "planning-vetter", effort: "high" },
      ],
    },
    implementation: {
      ...settings.implementation,
      auditors: [
        { assistant: "claude", model: "claude-auditor", effort: "high" },
        { assistant: "codex", model: "codex-auditor", effort: "medium" },
      ],
      // A vet of each assistant, one on the Claude auditor's own selection.
      vetters: [
        { assistant: "claude", model: "claude-auditor", effort: "high" },
        { assistant: "codex", model: "codex-vetter", effort: "xhigh" },
      ],
    },
  })
  const source = "audit-round implementation vetters"
  const panel = config.implementation.vetters.map(
    ({ assistant, model, effort }) => ({
      assistant,
      model: {
        model: { value: model, source },
        effort: { value: effort, source },
      },
    }),
  )
  for (const auditor of config.implementation.auditors) {
    const seat = listedSeat(auditor)
    const phases = roundPhases(auditor.assistant, seat.override, config)
    assert.equal(phases.audit.model.model.value, auditor.model)
    assert.deepEqual(phases.vet, panel)
    assert.deepEqual(phases.rebut, phases.audit)
    // A planning round on the same auditor reads the planning list instead.
    const planning = roundPhases(
      auditor.assistant,
      seat.override,
      config,
      roundFixer({ roundKind: "planning", plan: "example.md" }, null, config),
      "planning",
    )
    assert.deepEqual(planning.vet, [
      {
        assistant: "claude",
        model: {
          model: {
            value: "planning-vetter",
            source: "audit-round planning vetters",
          },
          effort: { value: "high", source: "audit-round planning vetters" },
        },
      },
    ])
  }
  assert.ok(namedModels("codex", config).has("codex-vetter"))
  assert.ok(namedModels("claude", config).has("planning-vetter"))
})

test("a vetter list needs one entry and refuses two entries with one tag", () => {
  for (const workClass of ["planning", "implementation"] as const) {
    const config = (vetters: readonly unknown[]) => ({
      ...settings,
      [workClass]: { ...settings[workClass], vetters },
    })
    assert.equal(settingsSchema.safeParse(config([])).success, false)
    // Two unlisted models at high both spell `auh`, so their reports would share a name.
    const repeated = settingsSchema.safeParse(
      config([
        { assistant: "claude", model: "sonnet", effort: "high" },
        { assistant: "claude", model: "haiku", effort: "high" },
      ]),
    )
    assert.equal(repeated.success, false)
    assert.match(
      repeated.error?.message ?? "",
      new RegExp(`Two ${workClass} vetters share the tag auh`),
    )
    // Another effort gives the second vet its own tag.
    assert.equal(
      settingsSchema.safeParse(
        config([
          { assistant: "claude", model: "sonnet", effort: "high" },
          { assistant: "claude", model: "haiku", effort: "xhigh" },
        ]),
      ).success,
      true,
    )
  }
  // The old per-assistant vet selection is refused like any other invalid field.
  assert.equal(
    settingsSchema.safeParse({
      ...settings,
      phases: {
        ...settings.phases,
        vet: {
          claude: { model: "default", effort: "default" },
          codex: { model: "default", effort: "default" },
        },
      },
    }).success,
    false,
  )
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
      phases: { ...settings.phases, rebut: settings.phases.close },
    }).success,
    false,
  )
  assert.equal(
    settingsSchema.safeParse({
      ...settings,
      implementation: { ...settings.implementation, coders: [] },
    }).success,
    false,
  )
  assert.equal(
    settingsSchema.safeParse({
      ...settings,
      implementation: {
        ...settings.implementation,
        coders: [
          { assistant: "codex", model: "model with spaces", effort: "high" },
        ],
      },
    }).success,
    false,
  )
  for (const maximumAutomaticRounds of [0, -1, 1.5])
    assert.equal(
      settingsSchema.safeParse({ ...settings, maximumAutomaticRounds }).success,
      false,
    )
})
