import assert from "node:assert/strict"
import { posix, win32 } from "node:path"
import { describe, it } from "node:test"
import { normalizeTargetDirectory } from "../repository-workflows/paths.js"

describe("normalizeTargetDirectory", () => {
  it("rejects empty input", () => {
    assert.equal(
      normalizeTargetDirectory(undefined, "/home/teacher", posix),
      null,
    )
    assert.equal(normalizeTargetDirectory("   ", "/home/teacher", posix), null)
  })

  it("expands a leading tilde with the POSIX home directory", () => {
    assert.equal(
      normalizeTargetDirectory("~/x2021", "/Users/teacher", posix),
      "/Users/teacher/x2021",
    )
    assert.equal(
      normalizeTargetDirectory("~", "/Users/teacher", posix),
      "/Users/teacher",
    )
  })

  it("expands a leading tilde with the Windows home directory", () => {
    assert.equal(
      normalizeTargetDirectory("~\\repos", "C:\\Users\\teacher", win32),
      "C:\\Users\\teacher\\repos",
    )
  })

  it("keeps non-leading-tilde names untouched", () => {
    assert.equal(
      normalizeTargetDirectory("~other/x2021", "/Users/teacher", posix),
      null,
    )
  })

  it("rejects relative paths", () => {
    assert.equal(
      normalizeTargetDirectory("repos", "/home/teacher", posix),
      null,
    )
    assert.equal(
      normalizeTargetDirectory("./repos", "/home/teacher", posix),
      null,
    )
    assert.equal(
      normalizeTargetDirectory("../repos", "/home/teacher", posix),
      null,
    )
  })

  it("accepts absolute paths", () => {
    assert.equal(
      normalizeTargetDirectory("/work/repos", "/home/teacher", posix),
      "/work/repos",
    )
    assert.equal(
      normalizeTargetDirectory(
        "C:\\Users\\teacher\\repos",
        "C:\\Users\\teacher",
        win32,
      ),
      "C:\\Users\\teacher\\repos",
    )
  })
})
