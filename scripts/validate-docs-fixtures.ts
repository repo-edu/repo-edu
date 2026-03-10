import { docsFixtureMatrix } from "../apps/docs/src/fixtures/docs-fixtures.generated.ts"
import { validateFixtureMatrix } from "./docs-fixtures-validate.ts"

validateFixtureMatrix(docsFixtureMatrix)
console.log("[fixture:docs] validation passed")
