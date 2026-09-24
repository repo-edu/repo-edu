import assert from "node:assert/strict"
import { it } from "node:test"
import {
  checkRendererStartDocumentSource,
  renderSessionStartTable,
} from "../renderer-start-document.js"

it("accepts the generated start table surrounded by unrelated prose", () => {
  assert.deepEqual(
    checkRendererStartDocumentSource(
      `Before\n${renderSessionStartTable()}\nAfter`,
    ),
    [],
  )
})

it("rejects a stale table and missing section markers", () => {
  for (const document of [
    renderSessionStartTable().replace(
      "Analyse selected repository",
      "Select repository",
    ),
    "# No generated section",
    renderSessionStartTable().replace(
      "<!-- session-start-inventory:end -->",
      "",
    ),
  ]) {
    const violations = checkRendererStartDocumentSource(document)
    assert.equal(violations.length, 1)
    assert.match(violations[0]?.message ?? "", /pnpm generate:session-starts/)
  }
})
