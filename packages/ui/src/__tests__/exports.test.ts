import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { cn, packageId } from "../index.js"

describe("ui package exports", () => {
  it("exports the correct packageId", () => {
    assert.equal(packageId, "@repo-edu/ui")
  })

  it("cn merges class names correctly", () => {
    assert.equal(cn("a", "b"), "a b")
  })

  it("cn deduplicates tailwind classes", () => {
    const result = cn("p-4", "p-2")
    assert.equal(result, "p-2")
  })

  it("cn handles conditional classes", () => {
    const result = cn("base", false && "hidden", "extra")
    assert.equal(result, "base extra")
  })

  it("cn handles undefined and null inputs", () => {
    const result = cn("base", undefined, null, "end")
    assert.equal(result, "base end")
  })

  it("cn returns empty string for no inputs", () => {
    assert.equal(cn(), "")
  })
})
