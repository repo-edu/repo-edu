import { cp, rm } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export async function copyGrammarAssets(outputDirectory: string) {
  const sourceAssets = resolve(packageRoot, "src/assets")
  const targetAssets = resolve(packageRoot, outputDirectory, "assets")
  await rm(targetAssets, { force: true, recursive: true })
  await cp(sourceAssets, targetAssets, { force: true, recursive: true })
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href

if (isMain) {
  await copyGrammarAssets(process.argv[2] ?? "dist")
}
