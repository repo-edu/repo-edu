import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  allCatalogSpecs,
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

describe("parseShortCode — effort gating", () => {
  test("tier-only aliases are rejected", () => {
    assert.throws(() => parseShortCode("2", "mp"), ModelCodeError)
    assert.throws(() => parseShortCode("3", "mp"), ModelCodeError)
  })

  test("unsupported Claude efforts are rejected as unknown codes", () => {
    assert.throws(() => parseShortCode("24", "mp"), ModelCodeError)
    assert.throws(() => parseShortCode("25", "mp"), ModelCodeError)
    assert.throws(() => parseShortCode("36", "mp"), ModelCodeError)
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

describe("modelCode", () => {
  test("returns canonical catalog codes", () => {
    assert.equal(modelCode(parseShortCode("22", "mp")), "22")
    assert.equal(modelCode(parseShortCode("1", "mp")), "1")
    assert.equal(modelCode(parseShortCode("c542", "mp")), "c542")
  })
})

describe("coder phase gating (mc)", () => {
  test("Claude and Codex codes are accepted in mc", () => {
    assert.doesNotThrow(() => parseShortCode("22", "mc"))
    assert.doesNotThrow(() => parseShortCode("35", "mc"))
    assert.doesNotThrow(() => parseShortCode("c542", "mc"))
    assert.doesNotThrow(() => parseShortCode("c552", "mc"))
  })

  test("Codex codes accepted in mp", () => {
    assert.doesNotThrow(() => parseShortCode("c542", "mp"))
    assert.doesNotThrow(() => parseShortCode("c54m", "mp"))
  })
})

describe("parseShortCode — Codex tier resolution", () => {
  test("c54m → gpt-5.4-mini, no effort", () => {
    const spec = parseShortCode("c54m", "mp")
    assert.equal(spec.provider, "codex")
    assert.equal(spec.family, "gpt-5.4-mini")
    assert.equal(spec.modelId, "gpt-5.4-mini")
    assert.equal(spec.effort, "none")
  })

  test("c541..c544 cover gpt-5.4 low..xhigh", () => {
    assert.equal(parseShortCode("c541", "mp").effort, "low")
    assert.equal(parseShortCode("c542", "mp").effort, "medium")
    assert.equal(parseShortCode("c543", "mp").effort, "high")
    assert.equal(parseShortCode("c544", "mp").effort, "xhigh")
    for (const code of ["c541", "c542", "c543", "c544"]) {
      assert.equal(parseShortCode(code, "mp").modelId, "gpt-5.4")
    }
  })

  test("c551..c554 cover gpt-5.5 low..xhigh", () => {
    assert.equal(parseShortCode("c551", "mp").effort, "low")
    assert.equal(parseShortCode("c552", "mp").effort, "medium")
    assert.equal(parseShortCode("c553", "mp").effort, "high")
    assert.equal(parseShortCode("c554", "mp").effort, "xhigh")
    for (const code of ["c551", "c552", "c553", "c554"]) {
      assert.equal(parseShortCode(code, "mp").modelId, "gpt-5.5")
    }
  })

  test("Codex tier-only aliases and max efforts are rejected", () => {
    assert.throws(() => parseShortCode("c54", "mp"), ModelCodeError)
    assert.throws(() => parseShortCode("c55", "mp"), ModelCodeError)
    assert.throws(() => parseShortCode("c545", "mp"), ModelCodeError)
    assert.throws(() => parseShortCode("c555", "mp"), ModelCodeError)
  })

  test("c54m with effort suffix is rejected (mini has no effort dim)", () => {
    assert.throws(() => parseShortCode("c54m2", "mp"), ModelCodeError)
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
})
