import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { serveAreaOverviewOnce } from "../overview-delivery.js"

describe("overview serve-once delivery", () => {
  it("serves the in-memory HTML to the launched URL", async () => {
    let launchedUrl = ""
    let responseStatus = 0
    let responseText = ""

    const served = await serveAreaOverviewOnce("<html>ok</html>", {
      timeoutMs: 2_000,
      launch: async (url) => {
        launchedUrl = url
        const response = await fetch(url)
        responseStatus = response.status
        responseText = await response.text()
      },
    })

    assert.equal(served.url, launchedUrl)
    assert.equal(responseStatus, 200)
    assert.equal(responseText, "<html>ok</html>")
  })
})
