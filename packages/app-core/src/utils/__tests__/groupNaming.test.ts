import type { RosterMember } from "@repo-edu/backend-interface/types"
import { describe, expect, it } from "vitest"
import { generateGroupName } from "../groupNaming"

function makeMember(name: string): RosterMember {
  return {
    id: `m-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    student_number: null,
    git_username: null,
    git_username_status: "unknown",
    status: "active",
    lms_user_id: null,
    enrollment_type: "student",
    source: "local",
  }
}

describe("generateGroupName", () => {
  it("returns empty string for 0 members", () => {
    expect(generateGroupName([])).toBe("")
  })

  it("returns firstname_lastname for 1 member", () => {
    expect(generateGroupName([makeMember("Emma Chen")])).toBe("emma_chen")
  })

  it("uses first and last word for single-word names", () => {
    expect(generateGroupName([makeMember("Madonna")])).toBe("madonna_madonna")
  })

  it("handles multi-word names (first + last word)", () => {
    expect(generateGroupName([makeMember("Mary Jane Watson")])).toBe(
      "mary_watson",
    )
  })

  it("returns sorted last names joined by dash for 2 members", () => {
    const result = generateGroupName([
      makeMember("Liam Patel"),
      makeMember("Emma Chen"),
    ])
    expect(result).toBe("chen-patel")
  })

  it("returns sorted last names joined by dash for 5 members", () => {
    const result = generateGroupName([
      makeMember("Olivia Johnson"),
      makeMember("Emma Chen"),
      makeMember("Liam Patel"),
      makeMember("Noah Kim"),
      makeMember("Sofia Rodriguez"),
    ])
    expect(result).toBe("chen-johnson-kim-patel-rodriguez")
  })

  it("returns 5 last names + remainder for 6+ members", () => {
    const result = generateGroupName([
      makeMember("Olivia Johnson"),
      makeMember("Emma Chen"),
      makeMember("Liam Patel"),
      makeMember("Noah Kim"),
      makeMember("Sofia Rodriguez"),
      makeMember("Ethan Williams"),
    ])
    expect(result).toBe("chen-johnson-kim-patel-rodriguez-+1")
  })

  it("handles 8 members with correct remainder", () => {
    const result = generateGroupName([
      makeMember("Olivia Johnson"),
      makeMember("Emma Chen"),
      makeMember("Liam Patel"),
      makeMember("Noah Kim"),
      makeMember("Sofia Rodriguez"),
      makeMember("Ethan Williams"),
      makeMember("Ava Martinez"),
      makeMember("Mason Brown"),
    ])
    expect(result).toBe("brown-chen-johnson-kim-martinez-+3")
  })
})
