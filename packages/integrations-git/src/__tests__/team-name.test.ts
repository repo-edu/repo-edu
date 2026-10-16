import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildTeamName } from "../team-name.js"

describe("buildTeamName", () => {
  it("keeps the complete provider team name within 255 characters", () => {
    const courseId = "c".repeat(21)
    const name = buildTeamName({
      courseId,
      groupId: "g_0001",
      groupName: "a".repeat(201),
    })

    assert.equal(name.length, 255)
    assert.equal(name, `team-${"a".repeat(200)}-${"63".repeat(21)}-g_0001`)
  })
})
