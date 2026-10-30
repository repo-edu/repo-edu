import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { codexArguments } from "../requests.js"
import { defaultSettings, readSettings, settingsSchema } from "../settings.js"
import {
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

test("phase fields read the assistant's defaults and apply partial auditor overrides", () => {
  const config = structuredClone(settings)
  config.strengthModels.codex.top = "custom-top-model"
  config.defaults.codex = { model: "codex-default", effort: "xhigh" }
  config.phases.audit.codex = { model: "configured-auditor", effort: "medium" }
  config.phases.watch = { assistant: "codex", model: "default", effort: "low" }
  const phases = roundPhases(
    "codex",
    { option: "--auditor", strength: "top", effort: null },
    config,
  )
  assert.deepEqual(phases.audit.model, {
    model: { value: "custom-top-model", source: "--auditor" },
    effort: { value: "medium", source: "audit-round settings" },
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
    model: { value: "codex-default", source: "audit-round defaults" },
    effort: { value: "xhigh", source: "audit-round defaults" },
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
    model: { value: "configured-auditor", source: "audit-round settings" },
    effort: { value: "high", source: "--first" },
  })
})

test("audit settings accept one setting or an exact pair", () => {
  const config = structuredClone(settings)
  config.phases.audit.codex = [
    { model: "first-auditor", effort: "medium" },
    { model: "second-auditor", effort: "xhigh" },
  ]
  assert.equal(settingsSchema.safeParse(config).success, true)
  const first = roundPhases("codex", noOverride, config, 0)
  assert.deepEqual(first.audit.model, {
    model: { value: "first-auditor", source: "audit-round settings" },
    effort: { value: "medium", source: "audit-round settings" },
  })
  assert.deepEqual(first.rebut, first.audit)
  const second = roundPhases("codex", noOverride, config, 1)
  assert.deepEqual(second.audit.model, {
    model: { value: "second-auditor", source: "audit-round settings" },
    effort: { value: "xhigh", source: "audit-round settings" },
  })
  assert.deepEqual(second.rebut, second.audit)

  for (const audit of [
    [],
    [{ model: "only", effort: "high" }],
    [
      { model: "one", effort: "high" },
      { model: "two", effort: "high" },
      { model: "three", effort: "high" },
    ],
  ])
    assert.equal(
      settingsSchema.safeParse({
        ...settings,
        phases: {
          ...settings.phases,
          audit: { ...settings.phases.audit, codex: audit },
        },
      }).success,
      false,
    )
})

test("assigned phases follow their configured assistants independently of the auditor", () => {
  for (const auditor of ["claude", "codex"] as const) {
    for (const assistant of ["claude", "codex"] as const) {
      const config = structuredClone(settings)
      config.phases.fix = { assistant, model: "custom-fixer", effort: "high" }
      config.phases.watch = { assistant, model: "default", effort: "default" }
      config.phases.judge = { assistant, model: "cheap-judge", effort: "low" }
      const phases = roundPhases(auditor, noOverride, config)
      assert.deepEqual(phases.fix, {
        assistant,
        model: {
          model: { value: "custom-fixer", source: "audit-round settings" },
          effort: { value: "high", source: "audit-round settings" },
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

test("assistant names select the defaults while letter tags keep audit pins across chained auditors", () => {
  const config = structuredClone(settings)
  config.phases.audit.claude = { model: "claude-auditor", effort: "high" }
  config.phases.audit.codex = { model: "codex-auditor", effort: "medium" }
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
      assert.deepEqual(
        phases.audit.model,
        value.length > 1
          ? {
              model: { value: model, source: "--first" },
              effort: { value: effort, source: "--first" },
            }
          : configured.audit.model,
      )
      assert.deepEqual(phases.rebut, phases.audit)
      for (const phase of ["vet", "fix", "brief", "watch", "judge"] as const)
        assert.deepEqual(phases[phase], configured[phase])
    }
  }
})

test("alternating auditors and vetters keep their own configured models", () => {
  const config = structuredClone(settings)
  config.phases.audit.claude = { model: "claude-auditor", effort: "high" }
  config.phases.audit.codex = { model: "codex-auditor", effort: "medium" }
  config.phases.vet.claude = { model: "claude-vetter", effort: "low" }
  config.phases.vet.codex = { model: "codex-vetter", effort: "xhigh" }
  for (const assistant of ["claude", "codex"] as const) {
    const vetter = assistant === "claude" ? "codex" : "claude"
    const phases = roundPhases(assistant, noOverride, config)
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
      phases: { ...settings.phases, rebut: settings.phases.audit },
    }).success,
    false,
  )
  for (const maximumAutomaticRounds of [0, -1, 1.5])
    assert.equal(
      settingsSchema.safeParse({ ...settings, maximumAutomaticRounds }).success,
      false,
    )
})
