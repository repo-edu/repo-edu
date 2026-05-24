import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { getTokenizerGrammarAsset } from "@repo-edu/tree-sitter-grammar-assets"
import {
  LANGUAGE_VERSION,
  Language,
  MIN_COMPATIBLE_VERSION,
  Parser,
} from "web-tree-sitter"
import type {
  LoadedTokenizerLanguage,
  TokenizerSupportedLanguage,
} from "../../analysis/index.js"

const require = createRequire(import.meta.url)
let runtimeInit: Promise<void> | null = null
const cache = new Map<
  TokenizerSupportedLanguage,
  Promise<LoadedTokenizerLanguage>
>()

function ensureRuntime(): Promise<void> {
  runtimeInit ??= Parser.init({
    locateFile: () => require.resolve("web-tree-sitter/web-tree-sitter.wasm"),
  })
  return runtimeInit
}

function assertCompatible(language: Language, id: TokenizerSupportedLanguage) {
  if (
    language.abiVersion < MIN_COMPATIBLE_VERSION ||
    language.abiVersion > LANGUAGE_VERSION
  ) {
    throw new Error(
      `Tokenizer grammar ${id} ABI ${language.abiVersion} is outside supported range ${MIN_COMPATIBLE_VERSION}-${LANGUAGE_VERSION}.`,
    )
  }
}

async function load(id: TokenizerSupportedLanguage) {
  await ensureRuntime()

  const asset = getTokenizerGrammarAsset(id)
  const bytes = await readFile(fileURLToPath(asset.assetUrl))
  const language = await Language.load(bytes)
  assertCompatible(language, id)

  const parser = new Parser()
  parser.setLanguage(language)
  return { language: id, parser }
}

export function loadGrammarForTests(
  id: TokenizerSupportedLanguage,
): Promise<LoadedTokenizerLanguage> {
  let promise = cache.get(id)
  if (!promise) {
    promise = load(id)
    cache.set(id, promise)
  }
  return promise
}
