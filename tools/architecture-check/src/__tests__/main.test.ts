import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { pathToFileURL } from "node:url"

import { isMainModule } from "../main.js"

describe("main module guard", () => {
  it("compares argv paths through file URL conversion", () => {
    const entryPath = "/tmp/repo edu/tools/architecture-check/src/main.ts"

    assert.equal(isMainModule(pathToFileURL(entryPath).href, entryPath), true)
    assert.equal(isMainModule(`file://${entryPath}`, entryPath), false)
    assert.equal(isMainModule(pathToFileURL(entryPath).href, undefined), false)
  })
})
