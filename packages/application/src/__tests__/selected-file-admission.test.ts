import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { admitSelectedRelativeFilePath } from "../selected-file-admission.js"

describe("selected-file admission", () => {
  it("normalizes admitted nested paths", () => {
    assert.deepEqual(admitSelectedRelativeFilePath("src\\main.ts"), {
      ok: true,
      path: "src/main.ts",
    })
    assert.deepEqual(admitSelectedRelativeFilePath("..solution.ts"), {
      ok: true,
      path: "..solution.ts",
    })
  })

  it("rejects absolute and traversing paths without workflow details", () => {
    for (const value of [
      "",
      "/tmp/main.ts",
      "C:\\repo\\main.ts",
      "\\\\server\\share\\main.ts",
      "../main.ts",
      "src/./main.ts",
      "src//main.ts",
    ]) {
      assert.deepEqual(admitSelectedRelativeFilePath(value), { ok: false })
    }
  })
})
