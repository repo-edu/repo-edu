import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { validateFixtureMatrix } from "../packages/test-fixtures/src/fixtures-validate.ts"
import {
  buildFixtureMatrix,
  renderFixtureModule,
} from "../packages/test-fixtures/src/generator-lib.ts"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, "..")
const fixtureModulePath = resolve(
  repoRoot,
  "packages/test-fixtures/src/fixtures.generated.ts",
)

async function main() {
  const matrix = buildFixtureMatrix()
  validateFixtureMatrix(matrix)
  const source = renderFixtureModule(matrix)

  await mkdir(dirname(fixtureModulePath), { recursive: true })
  await writeFile(fixtureModulePath, source, "utf8")

  console.log(`[fixture] generated ${fixtureModulePath}`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
