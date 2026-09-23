import assert from "node:assert/strict"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { installationRoot } from "../context.js"
import { codexArguments } from "../requests.js"
import { defaultSettings, readSettings, settingsSchema } from "../settings.js"
import {
  modelStrength,
  noOverride,
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
  edited.defaultAuditor = "claude"
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

test("phase settings inherit CLI values and apply partial auditor overrides", () => {
  const config = structuredClone(settings)
  config.strengthModels.codex.top = "custom-top-model"
  config.phases.audit.codex = { model: "configured-auditor", effort: "medium" }
  config.phases.watch = { assistant: "codex", model: null, effort: "low" }
  const phases = roundPhases("codex", { strength: "top", effort: null }, config)
  assert.deepEqual(phases.audit.model, {
    model: { value: "custom-top-model", source: "--auditor" },
    effort: { value: "medium", source: "settings.json" },
  })
  assert.deepEqual(phases.rebut, phases.audit)
  assert.deepEqual(phases.watch.model, {
    model: null,
    effort: { value: "low", source: "settings.json" },
  })
  assert.deepEqual(codexArguments(null, phases.watch.model), [
    "exec",
    "--approve-for-me",
    "-c",
    "model_reasoning_effort=low",
    "--json",
  ])
  assert.equal(modelStrength("codex", "custom-top-model", config), "top")
  assert.equal(modelStrength("codex", "gpt-6-astra", config), null)
  const effortOnly = roundPhases(
    "codex",
    { strength: null, effort: "high" },
    config,
  )
  assert.deepEqual(effortOnly.audit.model, {
    model: { value: "configured-auditor", source: "settings.json" },
    effort: { value: "high", source: "--auditor" },
  })
})

test("watch follows the configured assistant independently of the auditor", () => {
  for (const assistant of ["claude", "codex"] as const) {
    const config = structuredClone(settings)
    config.phases.watch = { assistant, model: null, effort: null }
    const phases = roundPhases("claude", noOverride, config)
    assert.deepEqual(phases.watch, {
      assistant,
      model: { model: null, effort: null },
    })
    assert.equal(phases.vet.assistant, "codex")
    assert.equal(phases.fix.assistant, "codex")
    assert.deepEqual(phases.rebut, phases.audit)
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

test("settings reject unsupported effort, misspelt fields and independent rebuttal settings", () => {
  for (const patch of [
    { effort: "extra-high" },
    { model: " " },
    { assitant: "codex" },
  ]) {
    const config = structuredClone(settings)
    Object.assign(config.phases.watch, patch)
    assert.equal(settingsSchema.safeParse(config).success, false)
  }
  assert.equal(
    settingsSchema.safeParse({
      ...settings,
      phases: { ...settings.phases, rebut: settings.phases.audit },
    }).success,
    false,
  )
})

test("every configurable document assistant has an installed launcher", async () => {
  for (const phase of ["brief", "rule", "rule-edit", "watch", "watch-edit"]) {
    await access(join(installationRoot, ".agents/skills", phase, "SKILL.md"))
    await access(join(installationRoot, ".claude/commands", `${phase}.md`))
  }
})
