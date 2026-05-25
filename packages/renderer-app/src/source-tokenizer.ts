import type {
  LoadedTokenizerLanguage,
  TokenizerSupportedLanguage,
} from "@repo-edu/domain/analysis"
import {
  getTokenizerGrammarAsset,
  packageId as grammarAssetsPackageId,
} from "@repo-edu/tree-sitter-grammar-assets"
import {
  LANGUAGE_VERSION,
  Language,
  MIN_COMPATIBLE_VERSION,
  Parser,
} from "web-tree-sitter"
import engineWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url"

export const workspaceDependencies = [grammarAssetsPackageId] as const

let tokenizerRuntimeInit: Promise<void> | null = null
const tokenizerLanguageCache = new Map<
  TokenizerSupportedLanguage,
  Promise<LoadedTokenizerLanguage>
>()

function ensureTokenizerRuntime(): Promise<void> {
  if (tokenizerRuntimeInit === null) {
    const init = Parser.init({
      locateFile: () => engineWasmUrl,
    })
    init.catch(() => {
      if (tokenizerRuntimeInit === init) tokenizerRuntimeInit = null
    })
    tokenizerRuntimeInit = init
  }
  return tokenizerRuntimeInit
}

function assertCompatibleGrammar(
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

async function loadLanguage(
  id: TokenizerSupportedLanguage,
): Promise<LoadedTokenizerLanguage> {
  await ensureTokenizerRuntime()

  const asset = getTokenizerGrammarAsset(id)
  const language = await Language.load(asset.assetUrl)
  assertCompatibleGrammar(language, id)

  const parser = new Parser()
  parser.setLanguage(language)
  return { language: id, parser }
}

export async function loadRendererTokenizerLanguage(
  id: TokenizerSupportedLanguage,
): Promise<LoadedTokenizerLanguage> {
  let promise = tokenizerLanguageCache.get(id)
  if (!promise) {
    promise = loadLanguage(id)
    tokenizerLanguageCache.set(id, promise)
    promise.catch(() => {
      if (tokenizerLanguageCache.get(id) === promise) {
        tokenizerLanguageCache.delete(id)
      }
    })
  }
  return await promise
}
