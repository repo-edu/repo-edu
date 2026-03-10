import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildDocsFixtureMatrix,
  renderDocsFixtureModule,
} from "./docs-fixtures-lib.ts"
import { validateFixtureMatrix } from "./docs-fixtures-validate.ts"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, "..")
const fixtureModulePath = resolve(
  repoRoot,
  "apps/docs/src/fixtures/docs-fixtures.generated.ts",
)

async function main() {
  const matrix = buildDocsFixtureMatrix()
  validateFixtureMatrix(matrix)
  const source = renderDocsFixtureModule(matrix)

  await mkdir(dirname(fixtureModulePath), { recursive: true })
  await writeFile(fixtureModulePath, source, "utf8")

  console.log(`[fixture:docs] generated ${fixtureModulePath}`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
