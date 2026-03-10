import assert from "node:assert/strict"
import { fixtureMatrix } from "../packages/test-fixtures/src/fixtures.generated.ts"
import { validateFixtureMatrix } from "../packages/test-fixtures/src/fixtures-validate.ts"
import { buildFixtureMatrix } from "../packages/test-fixtures/src/generator-lib.ts"

function main() {
  validateFixtureMatrix(fixtureMatrix)

  const expectedMatrix = buildFixtureMatrix()

  try {
    assert.deepEqual(fixtureMatrix, expectedMatrix)
  } catch {
    throw new Error(
      "[fixture] generated fixture module is stale. Run: pnpm fixture:generate",
    )
  }

  console.log("[fixture] check passed")
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exit(1)
}
