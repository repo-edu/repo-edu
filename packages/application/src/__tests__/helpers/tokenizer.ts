import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import type { TokenizerSupportedLanguage } from "@repo-edu/domain/analysis"
import type { TokenizerPort } from "@repo-edu/host-runtime-contract"
import { getTokenizerGrammarAsset } from "@repo-edu/tree-sitter-grammar-assets"
import {
  LANGUAGE_VERSION,
  Language,
  MIN_COMPATIBLE_VERSION,
  Parser,
} from "web-tree-sitter"

const require = createRequire(import.meta.url)
let tokenizerRuntimeInit: Promise<void> | null = null
const tokenizerLanguageCache = new Map<
  TokenizerSupportedLanguage,
  Promise<Language>
>()

function ensureTokenizerRuntime(): Promise<void> {
  if (tokenizerRuntimeInit === null) {
    const init = Parser.init({
      locateFile: () => require.resolve("web-tree-sitter/web-tree-sitter.wasm"),
    })
    init.catch(() => {
      if (tokenizerRuntimeInit === init) tokenizerRuntimeInit = null
    })
    tokenizerRuntimeInit = init
  }
  return tokenizerRuntimeInit
}

function assertCompatibleTokenizerGrammar(
  language: Language,
  id: TokenizerSupportedLanguage,
) {
  if (
    language.abiVersion < MIN_COMPATIBLE_VERSION ||
    language.abiVersion > LANGUAGE_VERSION
  ) {
    throw new Error(
      `Tokenizer grammar ${id} ABI ${language.abiVersion} is outside supported range ${MIN_COMPATIBLE_VERSION}-${LANGUAGE_VERSION}.`,
    )
  }
}

async function loadTokenizerGrammar(
  id: TokenizerSupportedLanguage,
): Promise<Language> {
  await ensureTokenizerRuntime()
  const asset = getTokenizerGrammarAsset(id)
  const language = await Language.load(fileURLToPath(asset.assetUrl))
  assertCompatibleTokenizerGrammar(language, id)
  return language
}

function getTokenizerGrammar(
  id: TokenizerSupportedLanguage,
): Promise<Language> {
  let promise = tokenizerLanguageCache.get(id)
  if (!promise) {
    promise = loadTokenizerGrammar(id)
    tokenizerLanguageCache.set(id, promise)
    promise.catch(() => {
      if (tokenizerLanguageCache.get(id) === promise) {
        tokenizerLanguageCache.delete(id)
      }
    })
  }
  return promise
}

export function createTokenizerPortForTests(): TokenizerPort {
  return {
    async loadTokenizerLanguage(id) {
      const language = await getTokenizerGrammar(id)
      const parser = new Parser()
      parser.setLanguage(language)
      return { language: id, parser }
    },
  }
}
