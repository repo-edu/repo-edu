import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, test } from "node:test"
import { applyCodexPatch, parseCodexPatchReply } from "./llm-client"

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "fixture-codex-patch-"))
}

describe("parseCodexPatchReply", () => {
  test("parses fenced JSON replies", () => {
    const patch = parseCodexPatchReply(`\`\`\`json
{
  "summary": "Updated the codec.",
  "files": [{ "path": "codec.py", "contents": "value = 1\\n" }],
  "deletes": ["old.py"],
  "commit": "Add codec encoder"
}
\`\`\``)

    assert.equal(patch.summary, "Updated the codec.")
    assert.deepEqual(patch.files, [
      { path: "codec.py", contents: "value = 1\n" },
    ])
    assert.deepEqual(patch.deletes, ["old.py"])
    assert.equal(patch.commit, "Add codec encoder")
  })

  test("accepts null commit for no-op rounds", () => {
    const patch = parseCodexPatchReply(
      '{"summary":"No focused issue found.","files":[],"deletes":[],"commit":null}',
    )

    assert.equal(patch.commit, null)
  })
})

describe("applyCodexPatch", () => {
  test("writes full file contents and deletes requested paths", () => {
    const dir = tempRepo()
    try {
      writeFileSync(join(dir, "old.py"), "old")
      applyCodexPatch(dir, {
        summary: "Updated files.",
        files: [{ path: "src/codec.py", contents: "value = 1\n" }],
        deletes: ["old.py"],
        commit: "Add codec module",
      })

      assert.equal(
        readFileSync(join(dir, "src", "codec.py"), "utf8"),
        "value = 1\n",
      )
      assert.throws(() => readFileSync(join(dir, "old.py"), "utf8"))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("rejects paths outside the repository", () => {
    const dir = tempRepo()
    try {
      assert.throws(
        () =>
          applyCodexPatch(dir, {
            summary: "Bad patch.",
            files: [{ path: "../escape.py", contents: "" }],
            deletes: [],
            commit: "Write outside repo",
          }),
        /outside the repository/,
      )
      assert.throws(
        () =>
          applyCodexPatch(dir, {
            summary: "Bad patch.",
            files: [{ path: "..\\escape.py", contents: "" }],
            deletes: [],
            commit: "Write outside repo",
          }),
        /outside the repository/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("rejects patches that write and delete the same path", () => {
    const dir = tempRepo()
    try {
      assert.throws(
        () =>
          applyCodexPatch(dir, {
            summary: "Conflicting patch.",
            files: [{ path: "same.py", contents: "" }],
            deletes: ["same.py"],
            commit: "Conflict",
          }),
        /both writes and deletes/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
