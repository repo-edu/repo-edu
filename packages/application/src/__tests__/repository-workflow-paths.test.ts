import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeTargetDirectory } from "../repository-workflows/paths.js"

describe("normalizeTargetDirectory", () => {
  it("rejects empty input", () => {
    assert.equal(normalizeTargetDirectory(undefined, {}), null)
    assert.equal(normalizeTargetDirectory("   ", {}), null)
  })

  it("expands a leading tilde with HOME", () => {
    assert.equal(
      normalizeTargetDirectory("~/x2021", { HOME: "/Users/teacher" }),
      "/Users/teacher/x2021",
    )
    assert.equal(
      normalizeTargetDirectory("~", { HOME: "/Users/teacher" }),
      "/Users/teacher",
    )
  })

  it("expands a leading tilde with USERPROFILE on windows", () => {
    assert.equal(
      normalizeTargetDirectory("~\\repos", {
        USERPROFILE: "C:\\Users\\teacher",
      }),
      "C:\\Users\\teacher\\repos",
    )
  })

  it("keeps non-leading-tilde names untouched", () => {
    assert.equal(
      normalizeTargetDirectory("~other/x2021", { HOME: "/Users/teacher" }),
      null,
    )
  })

  it("rejects relative paths", () => {
    assert.equal(normalizeTargetDirectory("repos", {}), null)
    assert.equal(normalizeTargetDirectory("./repos", {}), null)
    assert.equal(normalizeTargetDirectory("../repos", {}), null)
  })

  it("accepts absolute paths", () => {
    assert.equal(normalizeTargetDirectory("/work/repos", {}), "/work/repos")
    assert.equal(
      normalizeTargetDirectory("C:\\Users\\teacher\\repos", {}),
      "C:\\Users\\teacher\\repos",
    )
  })
})
