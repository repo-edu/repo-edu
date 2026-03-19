import { validateFixtureMatrix } from "../packages/test-fixtures/src/fixtures-validate.js"
import { buildFixtureMatrix } from "../packages/test-fixtures/src/generator-lib.js"

try {
  validateFixtureMatrix(buildFixtureMatrix())
  console.log("[fixture] check passed")
} catch (error) {
  console.error(error)
  process.exit(1)
}
