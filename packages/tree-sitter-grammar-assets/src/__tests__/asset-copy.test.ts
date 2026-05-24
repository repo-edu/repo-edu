import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { copyGrammarAssets } from "../../scripts/copy-assets.js"
import { TOKENIZER_GRAMMAR_ASSETS } from "../index.js"

describe("grammar asset copy", () => {
  it("copies every manifest asset and required notice file", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "repo-edu-grammars-"))

    try {
      await copyGrammarAssets(outputRoot)

      for (const entry of Object.values(TOKENIZER_GRAMMAR_ASSETS)) {
        const copiedAssetPath = join(
          outputRoot,
          "assets/grammars",
          basename(fileURLToPath(entry.assetUrl)),
        )
        const copiedAsset = await readFile(copiedAssetPath)
        assert.equal(copiedAsset.byteLength, entry.assetBytes)

        if (entry.noticeFile !== null) {
          const copiedNoticePath = join(
            outputRoot,
            "assets/notices",
            basename(fileURLToPath(entry.noticeFile)),
          )
          const copiedNotice = await readFile(copiedNoticePath, "utf8")
          assert.equal(copiedNotice.length > 0, true)
        }
      }
    } finally {
      await rm(outputRoot, { force: true, recursive: true })
    }
  })
})
