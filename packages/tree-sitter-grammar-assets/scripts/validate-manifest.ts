import { createHash } from "node:crypto"
import { access, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { TOKENIZER_GRAMMAR_ASSETS } from "../src/index.js"

async function assertFileExists(path: string) {
  await access(path)
}

async function validateManifest() {
  for (const [id, entry] of Object.entries(TOKENIZER_GRAMMAR_ASSETS)) {
    if (entry.language !== id) {
      throw new Error(`Manifest key ${id} does not match language field.`)
    }
    if (entry.spdxLicense.length === 0) {
      throw new Error(`${id} is missing SPDX license metadata.`)
    }
    if (entry.acquisition.packageName.length === 0) {
      throw new Error(`${id} is missing acquisition package metadata.`)
    }
    if (entry.acquisition.packageVersion.length === 0) {
      throw new Error(`${id} is missing acquisition version metadata.`)
    }
    if (entry.assetBytes <= 0) {
      throw new Error(`${id} has invalid asset size metadata.`)
    }

    const assetPath = fileURLToPath(entry.assetUrl)
    const bytes = await readFile(assetPath)
    const actualHash = createHash("sha256").update(bytes).digest("hex")
    if (actualHash !== entry.assetSha256) {
      throw new Error(`${id} asset hash mismatch: ${actualHash}`)
    }
    if (bytes.byteLength !== entry.assetBytes) {
      throw new Error(`${id} asset size mismatch: ${bytes.byteLength}`)
    }

    if (entry.noticeFile !== null) {
      await assertFileExists(fileURLToPath(entry.noticeFile))
    }
  }
}

await validateManifest()
