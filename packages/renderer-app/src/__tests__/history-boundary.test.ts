import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PersistedActiveSurface } from "@repo-edu/domain/settings"
import type { ActiveTab } from "../types/index.js"
import { isDocumentEditingSurface } from "../utils/history-boundary.js"

describe("history boundary", () => {
  it("enables global undo only on course document-editing surfaces", () => {
    const courseSurface: PersistedActiveSurface = {
      kind: "course",
      courseId: "course-1",
    }

    assert.equal(isDocumentEditingSurface(courseSurface, "roster"), true)
    assert.equal(
      isDocumentEditingSurface(courseSurface, "groups-assignments"),
      true,
    )
    assert.equal(isDocumentEditingSurface(courseSurface, "analysis"), false)
  })

  it("keeps home, folder and submission surfaces outside global undo", () => {
    const examples: [PersistedActiveSurface, ActiveTab][] = [
      [{ kind: "home" }, "roster"],
      [{ kind: "folder", path: "/repos/course" }, "analysis"],
      [{ kind: "submission", path: "/submissions/ada" }, "analysis"],
    ]

    for (const [surface, tab] of examples) {
      assert.equal(isDocumentEditingSurface(surface, tab), false)
    }
  })
})
