import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  allCatalogSpecs,
  archivalModelCode,
  ModelCodeError,
  modelCode,
  parseShortCode,
} from "../index.js"

describe("parseShortCode — Claude tier resolution", () => {
  test("haiku 1 → no-effort spec", () => {
    const spec = parseShortCode("1", "mp")
    assert.equal(spec.provider, "claude")
    assert.equal(spec.family, "haiku")
    assert.equal(spec.modelId, "claude-haiku-4-5")
    assert.equal(spec.effort, "none")
    assert.equal(spec.versionTag, "45")
  })

  test("sonnet codes 21/22/23 cover low/medium/high", () => {
    assert.equal(parseShortCode("21", "mp").effort, "low")
    assert.equal(parseShortCode("22", "mp").effort, "medium")
    assert.equal(parseShortCode("23", "mp").effort, "high")
  })

  test("opus codes 31..35 cover low..max", () => {
    assert.equal(parseShortCode("31", "mp").effort, "low")
    assert.equal(parseShortCode("32", "mp").effort, "medium")
    assert.equal(parseShortCode("33", "mp").effort, "high")
    assert.equal(parseShortCode("34", "mp").effort, "xhigh")
    assert.equal(parseShortCode("35", "mp").effort, "max")
  })
})

describe("parseShortCode — alias collapse", () => {
  test("`2` ≡ `23` resolves to identical spec", () => {
    assert.equal(parseShortCode("2", "mp"), parseShortCode("23", "mp"))
  })

  test("`3` ≡ `33` resolves to identical spec", () => {
    assert.equal(parseShortCode("3", "mp"), parseShortCode("33", "mp"))
  })
})

describe("parseShortCode — effort gating", () => {
  test("sonnet xhigh (`24`) is rejected with tier-2 hint", () => {
    assert.throws(
      () => parseShortCode("24", "mp"),
      (err: unknown) =>
        err instanceof ModelCodeError &&
        /supported codes for tier 2: 2, 21, 22, 23/.test(err.message),
    )
  })

  test("haiku with effort (`12`) is rejected", () => {
    assert.throws(() => parseShortCode("12", "mp"), ModelCodeError)
  })

  test("plain unknown code raises with no tier hint", () => {
    assert.throws(
      () => parseShortCode("zz", "mp"),
      (err: unknown) =>
        err instanceof ModelCodeError &&
        /unknown model code "zz"/.test(err.message),
    )
  })
})

describe("modelCode + archivalModelCode round-trip", () => {
  test("modelCode returns canonical for aliases", () => {
    assert.equal(modelCode(parseShortCode("2", "mp")), "23")
    assert.equal(modelCode(parseShortCode("3", "mp")), "33")
    assert.equal(modelCode(parseShortCode("22", "mp")), "22")
    assert.equal(modelCode(parseShortCode("1", "mp")), "1")
  })

  test("archivalModelCode appends versionTag", () => {
    assert.equal(archivalModelCode(parseShortCode("22", "mp")), "22-46")
    assert.equal(archivalModelCode(parseShortCode("35", "mp")), "35-47")
    assert.equal(archivalModelCode(parseShortCode("1", "mp")), "1-45")
  })
})

describe("coder phase gating (mc)", () => {
  test("Claude codes accepted in mc", () => {
    assert.doesNotThrow(() => parseShortCode("22", "mc"))
    assert.doesNotThrow(() => parseShortCode("35", "mc"))
  })

  test("Codex codes rejected in mc with supported-providers hint", () => {
    assert.throws(
      () => parseShortCode("c22", "mc"),
      (err: unknown) =>
        err instanceof ModelCodeError &&
        /codex models are not supported for the coder phase/.test(
          err.message,
        ) &&
        /claude/.test(err.message),
    )
  })

  test("Codex codes accepted in mp", () => {
    assert.doesNotThrow(() => parseShortCode("c22", "mp"))
    assert.doesNotThrow(() => parseShortCode("c1", "mp"))
  })
})

describe("parseShortCode — Codex tier resolution", () => {
  test("c1 → gpt-5.4-mini, no effort", () => {
    const spec = parseShortCode("c1", "mp")
    assert.equal(spec.provider, "codex")
    assert.equal(spec.family, "gpt-5.4-mini")
    assert.equal(spec.modelId, "gpt-5.4-mini")
    assert.equal(spec.effort, "none")
    assert.equal(spec.versionTag, "54m")
  })

  test("c21..c24 cover gpt-5.4 low..xhigh", () => {
    assert.equal(parseShortCode("c21", "mp").effort, "low")
    assert.equal(parseShortCode("c22", "mp").effort, "medium")
    assert.equal(parseShortCode("c23", "mp").effort, "high")
    assert.equal(parseShortCode("c24", "mp").effort, "xhigh")
    for (const code of ["c21", "c22", "c23", "c24"]) {
      assert.equal(parseShortCode(code, "mp").modelId, "gpt-5.4")
    }
  })

  test("c31..c34 cover gpt-5.5 low..xhigh", () => {
    assert.equal(parseShortCode("c31", "mp").effort, "low")
    assert.equal(parseShortCode("c32", "mp").effort, "medium")
    assert.equal(parseShortCode("c33", "mp").effort, "high")
    assert.equal(parseShortCode("c34", "mp").effort, "xhigh")
    for (const code of ["c31", "c32", "c33", "c34"]) {
      assert.equal(parseShortCode(code, "mp").modelId, "gpt-5.5")
    }
  })

  test("Codex aliases collapse: c2 ≡ c23, c3 ≡ c33", () => {
    assert.equal(parseShortCode("c2", "mp"), parseShortCode("c23", "mp"))
    assert.equal(parseShortCode("c3", "mp"), parseShortCode("c33", "mp"))
  })

  test("Codex max (c25 / c35) is rejected", () => {
    assert.throws(() => parseShortCode("c25", "mp"), ModelCodeError)
    assert.throws(() => parseShortCode("c35", "mp"), ModelCodeError)
  })

  test("c1 with effort suffix is rejected (mini has no effort dim)", () => {
    assert.throws(() => parseShortCode("c12", "mp"), ModelCodeError)
  })

  test("archivalModelCode appends Codex versionTag", () => {
    assert.equal(archivalModelCode(parseShortCode("c22", "mp")), "c22-54")
    assert.equal(archivalModelCode(parseShortCode("c1", "mp")), "c1-54m")
    assert.equal(archivalModelCode(parseShortCode("c34", "mp")), "c34-55")
  })
})

describe("catalog integrity", () => {
  test("every spec has a non-empty modelId", () => {
    for (const spec of allCatalogSpecs()) {
      assert.ok(
        spec.modelId.length > 0,
        `spec for ${spec.family}/${spec.effort} missing modelId`,
      )
    }
  })

  test("(provider, modelId, effort) is unique across specs", () => {
    const seen = new Set<string>()
    for (const spec of allCatalogSpecs()) {
      const key = `${spec.provider}::${spec.modelId}::${spec.effort}`
      assert.ok(!seen.has(key), `duplicate catalog entry for ${key}`)
      seen.add(key)
    }
  })

  test("every spec carries a versionTag matching [a-z0-9]+", () => {
    for (const spec of allCatalogSpecs()) {
      assert.match(spec.versionTag, /^[a-z0-9]+$/)
    }
  })
})
