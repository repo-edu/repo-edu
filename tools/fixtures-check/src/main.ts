import {
  buildFixtureMatrix,
  validateFixtureMatrix,
} from "@repo-edu/test-fixtures"

try {
  validateFixtureMatrix(buildFixtureMatrix())
  console.log("[fixture] check passed")
} catch (error) {
  console.error(error)
  process.exit(1)
}
