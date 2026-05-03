import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parseRepoDirCode } from "../index.js"

describe("parseRepoDirCode — widened regex", () => {
  test("legacy shape (no version tag) parses", () => {
    const r = parseRepoDirCode("m22-o1")
    assert.ok(r)
    assert.equal(r?.spec.family, "sonnet")
    assert.equal(r?.spec.effort, "medium")
    assert.equal(r?.versionTag, undefined)
  })

  test("new shape (with version tag) parses and exposes the tag", () => {
    const r = parseRepoDirCode("m22-46-o1")
    assert.ok(r)
    assert.equal(r?.spec.family, "sonnet")
    assert.equal(r?.versionTag, "46")
  })

  test("opus max with version tag parses", () => {
    const r = parseRepoDirCode("m35-47-o2")
    assert.ok(r)
    assert.equal(r?.spec.family, "opus")
    assert.equal(r?.spec.effort, "max")
    assert.equal(r?.versionTag, "47")
  })

  test("haiku parses (single-digit code)", () => {
    const r = parseRepoDirCode("m1-45-o0")
    assert.ok(r)
    assert.equal(r?.spec.family, "haiku")
    assert.equal(r?.versionTag, "45")
  })

  test("Codex codes parse with version tag", () => {
    const r = parseRepoDirCode("mc22-54-o1")
    assert.ok(r)
    assert.equal(r?.spec.provider, "codex")
    assert.equal(r?.spec.family, "gpt-5.4")
    assert.equal(r?.spec.effort, "medium")
    assert.equal(r?.versionTag, "54")
  })

  test("Codex mini parses with alphanumeric version tag", () => {
    const r = parseRepoDirCode("mc1-54m-o2")
    assert.ok(r)
    assert.equal(r?.spec.family, "gpt-5.4-mini")
    assert.equal(r?.versionTag, "54m")
  })

  test("non-matching dir name returns null", () => {
    assert.equal(parseRepoDirCode("not-a-repo-dir"), null)
    assert.equal(parseRepoDirCode("c2-flash-card"), null)
  })

  test("unknown code returns null even when shape matches", () => {
    assert.equal(parseRepoDirCode("m99-o1"), null)
  })
})
