import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildTeamName } from "../team-name.js"

describe("buildTeamName", () => {
  it("keeps the complete provider team path within 255 characters", () => {
    const organization = "course-org"
    const courseId = "c".repeat(21)
    const name = buildTeamName({
      organization,
      courseId,
      groupId: "g_0001",
      groupName: "a".repeat(201),
    })

    assert.equal(`${organization}/${name}`.length, 255)
    assert.equal(name, `team-${"a".repeat(189)}-${"63".repeat(21)}-g_0001`)
  })
})
