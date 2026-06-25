import { basename } from "node:path"
import { fileURLToPath } from "node:url"
import { TOKENIZER_GRAMMAR_ASSETS } from "@repo-edu/tree-sitter-grammar-assets"
import { readRequiredTextFile } from "./shared.js"
import type { NoticeEntry } from "./types.js"

export async function resolveTokenizerGrammarRuntimeAssets(): Promise<
  NoticeEntry[]
> {
  return Promise.all(
    Object.values(TOKENIZER_GRAMMAR_ASSETS).map(async (entry) => {
      const licenseText = await readRequiredTextFile(
        resolveAssetUrlPath(entry.licenseTextFile),
      )
      const noticeText =
        entry.noticeFile === null
          ? `No separate notice file is recorded for ${entry.upstreamSource}.`
          : await readRequiredTextFile(resolveAssetUrlPath(entry.noticeFile))

      return {
        id: `tokenizer-grammar:${entry.language}:${entry.assetSha256}`,
        kind: "runtime-asset",
        name: `${entry.acquisition.packageName} tokenizer grammar (${entry.language})`,
        version: entry.acquisition.packageVersion,
        licenseExpression: entry.spdxLicense,
        source: `Committed WASM asset ${basename(resolveAssetUrlPath(entry.assetUrl))} from ${entry.upstreamSource}`,
        licenseText,
        noticeText: [
          `SPDX License: ${entry.spdxLicense}`,
          `Upstream source: ${entry.upstreamSource}`,
          `Grammar version: ${entry.grammarVersion}`,
          `Acquisition package: ${entry.acquisition.packageName}@${entry.acquisition.packageVersion}`,
          `Acquisition asset: ${entry.acquisition.assetPath}`,
          "",
          noticeText,
        ].join("\n"),
      } satisfies NoticeEntry
    }),
  )
}

function resolveAssetUrlPath(value: string): string {
  if (value.startsWith("file:")) {
    return fileURLToPath(value)
  }
  return value
}
