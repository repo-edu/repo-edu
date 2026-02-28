import type { SortingState } from "@tanstack/react-table"
import { describe, expect, it } from "vitest"
import {
  getNextProgressiveSorting,
  normalizeProgressiveSorting,
} from "./sorting"

describe("sorting utils", () => {
  it("starts a new progressive sort chain from empty state", () => {
    expect(getNextProgressiveSorting([], "name")).toEqual([
      { id: "name", desc: false },
    ])
  })

  it("moves the previous primary sort to secondary", () => {
    const current: SortingState = [{ id: "name", desc: false }]

    expect(getNextProgressiveSorting(current, "member_type")).toEqual([
      { id: "member_type", desc: false },
      { id: "name", desc: false },
    ])
  })

  it("toggles the primary sort direction while preserving the secondary sort", () => {
    const current: SortingState = [
      { id: "member_type", desc: false },
      { id: "name", desc: true },
    ]

    expect(getNextProgressiveSorting(current, "member_type")).toEqual([
      { id: "member_type", desc: true },
      { id: "name", desc: true },
    ])
  })

  it("keeps only the new primary and the previous primary", () => {
    const current: SortingState = [
      { id: "member_type", desc: false },
      { id: "name", desc: false },
    ]

    expect(getNextProgressiveSorting(current, "email")).toEqual([
      { id: "email", desc: false },
      { id: "member_type", desc: false },
    ])
  })

  it("normalizes duplicate and extra entries down to two unique keys", () => {
    const current: SortingState = [
      { id: "name", desc: false },
      { id: "name", desc: true },
      { id: "email", desc: false },
      { id: "member_type", desc: false },
    ]

    expect(normalizeProgressiveSorting(current)).toEqual([
      { id: "name", desc: false },
      { id: "email", desc: false },
    ])
  })
})
