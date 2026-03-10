import { fixtureMatrix } from "../packages/test-fixtures/src/fixtures.generated.ts"
import { validateFixtureMatrix } from "../packages/test-fixtures/src/fixtures-validate.ts"

validateFixtureMatrix(fixtureMatrix)
console.log("[fixture] validation passed")
