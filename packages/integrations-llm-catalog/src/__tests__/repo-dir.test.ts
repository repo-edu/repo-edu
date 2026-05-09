import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parseRepoDirCode } from "../index.js"

describe("parseRepoDirCode", () => {
  test("sonnet medium parses", () => {
    const r = parseRepoDirCode("m22-o1")
    assert.ok(r)
    assert.equal(r?.spec.family, "sonnet")
    assert.equal(r?.spec.effort, "medium")
  })

  test("opus max parses", () => {
    const r = parseRepoDirCode("m35-o2")
    assert.ok(r)
    assert.equal(r?.spec.family, "opus")
    assert.equal(r?.spec.effort, "max")
  })

  test("haiku parses (single-digit code)", () => {
    const r = parseRepoDirCode("m1-o0")
    assert.ok(r)
    assert.equal(r?.spec.family, "haiku")
  })

  test("Codex code parses", () => {
    const r = parseRepoDirCode("mc542-o1")
    assert.ok(r)
    assert.equal(r?.spec.provider, "codex")
    assert.equal(r?.spec.family, "gpt-5.4")
    assert.equal(r?.spec.effort, "medium")
  })

  test("Codex mini parses", () => {
    const r = parseRepoDirCode("mc54m-o2")
    assert.ok(r)
    assert.equal(r?.spec.family, "gpt-5.4-mini")
  })

  test("coder + reviewer parses both specs", () => {
    const r = parseRepoDirCode("m22-r31-o2")
    assert.ok(r)
    assert.equal(r?.spec.family, "sonnet")
    assert.equal(r?.reviewerSpec?.family, "opus")
    assert.equal(r?.reviewerSpec?.effort, "low")
  })

  test("mixed Codex coder and Claude reviewer parses both specs", () => {
    const r = parseRepoDirCode("mc542-r31-o2")
    assert.ok(r)
    assert.equal(r?.spec.provider, "codex")
    assert.equal(r?.reviewerSpec?.provider, "claude")
    assert.equal(r?.reviewerSpec?.family, "opus")
  })

  test("mixed Claude coder and Codex reviewer parses both specs", () => {
    const r = parseRepoDirCode("m22-rc552-o2")
    assert.ok(r)
    assert.equal(r?.spec.provider, "claude")
    assert.equal(r?.reviewerSpec?.provider, "codex")
    assert.equal(r?.reviewerSpec?.family, "gpt-5.5")
  })

  test("without reviewer code, reviewer field stays undefined", () => {
    const r = parseRepoDirCode("m22-o1")
    assert.ok(r)
    assert.equal(r?.reviewerSpec, undefined)
  })

  test("obsolete versioned shape is rejected", () => {
    assert.equal(parseRepoDirCode("m22-46-o1"), null)
    assert.equal(parseRepoDirCode("m35-47-o2"), null)
    assert.equal(parseRepoDirCode("mc542-54-o1"), null)
    assert.equal(parseRepoDirCode("m22-46-r31-46-o2"), null)
    assert.equal(parseRepoDirCode("mc542-54-rc551-55-o2"), null)
  })

  test("non-matching dir name returns null", () => {
    assert.equal(parseRepoDirCode("not-a-repo-dir"), null)
    assert.equal(parseRepoDirCode("c2-flash-card"), null)
  })

  test("unknown code returns null even when shape matches", () => {
    assert.equal(parseRepoDirCode("m99-o1"), null)
  })
})
