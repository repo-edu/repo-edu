import assert from "node:assert/strict"
import { docsFixtureMatrix } from "../apps/docs/src/fixtures/docs-fixtures.generated.ts"
import { buildDocsFixtureMatrix } from "./docs-fixtures-lib.ts"
import { validateFixtureMatrix } from "./docs-fixtures-validate.ts"

function main() {
  validateFixtureMatrix(docsFixtureMatrix)

  const expectedMatrix = buildDocsFixtureMatrix()

  try {
    assert.deepEqual(docsFixtureMatrix, expectedMatrix)
  } catch {
    throw new Error(
      "[fixture:docs] generated fixture module is stale. Run: pnpm fixture:docs:generate",
    )
  }

  console.log("[fixture:docs] check passed")
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exit(1)
}
