import type { GroupSet } from "@repo-edu/backend-interface/types"
import { describe, expect, it } from "vitest"
import { unwrapGroupSetConnection } from "./groupSetConnection"

describe("unwrapGroupSetConnection", () => {
  it("handles direct tagged union shape", () => {
    const connection = {
      kind: "system" as const,
      system_type: "staff" as const,
    }

    expect(unwrapGroupSetConnection(connection)).toEqual(connection)
  })

  it("handles value-wrapped shape", () => {
    const connection = {
      value: {
        kind: "system",
        system_type: "individual_students",
      },
    } as const

    expect(
      unwrapGroupSetConnection(connection as unknown as GroupSet["connection"]),
    ).toEqual(connection.value)
  })

  it("handles entries shape", () => {
    const connection = {
      entries: {
        kind: "system",
        system_type: "staff",
      },
    } as const

    expect(
      unwrapGroupSetConnection(connection as unknown as GroupSet["connection"]),
    ).toEqual(connection.entries)
  })

  it("handles value.entries shape", () => {
    const connection = {
      value: {
        entries: {
          kind: "system",
          system_type: "individual_students",
        },
      },
    } as const

    expect(
      unwrapGroupSetConnection(connection as unknown as GroupSet["connection"]),
    ).toEqual(connection.value.entries)
  })
})
