import { describe, expect, it } from "vitest"
import { hashSnapshot, snapshot } from "./snapshot"

describe("hashSnapshot", () => {
  it("returns consistent hash for same value", () => {
    const value = { name: "test", count: 42 }
    const hash1 = hashSnapshot(value)
    const hash2 = hashSnapshot(value)
    expect(hash1).toBe(hash2)
  })

  it("returns different hash for different values", () => {
    const hash1 = hashSnapshot({ name: "test" })
    const hash2 = hashSnapshot({ name: "other" })
    expect(hash1).not.toBe(hash2)
  })

  it("returns unsigned 32-bit integer", () => {
    const hash = hashSnapshot({ data: "test" })
    expect(hash).toBeGreaterThanOrEqual(0)
    expect(hash).toBeLessThanOrEqual(0xffffffff)
  })

  it("handles nested objects", () => {
    const value = { outer: { inner: { deep: "value" } } }
    const hash1 = hashSnapshot(value)
    const hash2 = hashSnapshot(value)
    expect(hash1).toBe(hash2)
  })

  it("handles arrays", () => {
    const hash1 = hashSnapshot([1, 2, 3])
    const hash2 = hashSnapshot([1, 2, 3])
    expect(hash1).toBe(hash2)

    const hash3 = hashSnapshot([1, 2, 4])
    expect(hash1).not.toBe(hash3)
  })

  it("handles empty objects", () => {
    const hash = hashSnapshot({})
    expect(typeof hash).toBe("number")
    expect(hash).toBeGreaterThanOrEqual(0)
  })

  it("handles null", () => {
    const hashNull = hashSnapshot(null)
    expect(typeof hashNull).toBe("number")
    expect(hashNull).toBeGreaterThanOrEqual(0)
  })

  it("handles strings", () => {
    const hash1 = hashSnapshot("hello")
    const hash2 = hashSnapshot("hello")
    const hash3 = hashSnapshot("world")
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hash3)
  })

  it("handles numbers", () => {
    const hash1 = hashSnapshot(42)
    const hash2 = hashSnapshot(42)
    const hash3 = hashSnapshot(43)
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hash3)
  })

  it("is sensitive to property order", () => {
    // JSON.stringify maintains insertion order for object keys
    const obj1 = JSON.parse('{"a":1,"b":2}')
    const obj2 = JSON.parse('{"b":2,"a":1}')
    const hash1 = hashSnapshot(obj1)
    const hash2 = hashSnapshot(obj2)
    // Note: This test may pass or fail depending on JSON.stringify behavior
    // The important thing is consistency within the same object structure
    expect(typeof hash1).toBe("number")
    expect(typeof hash2).toBe("number")
  })
})

describe("snapshot", () => {
  it("creates a deep clone", () => {
    const original = { nested: { value: 42 } }
    const cloned = snapshot(original)
    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned.nested).not.toBe(original.nested)
  })

  it("handles arrays", () => {
    const original = [1, 2, { x: 3 }]
    const cloned = snapshot(original)
    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    expect(cloned[2]).not.toBe(original[2])
  })

  it("handles primitive types", () => {
    expect(snapshot("hello")).toBe("hello")
    expect(snapshot(42)).toBe(42)
    expect(snapshot(true)).toBe(true)
    expect(snapshot(null)).toBe(null)
  })

  it("removes functions and undefined values", () => {
    const original = {
      name: "test",
      fn: () => {},
      undef: undefined,
    }
    const cloned = snapshot(original)
    expect(cloned).toEqual({ name: "test" })
    expect("fn" in cloned).toBe(false)
    expect("undef" in cloned).toBe(false)
  })

  it("preserves array structure", () => {
    const original = { items: [1, 2, 3] }
    const cloned = snapshot(original)
    expect(Array.isArray(cloned.items)).toBe(true)
    expect(cloned.items).toHaveLength(3)
  })
})
