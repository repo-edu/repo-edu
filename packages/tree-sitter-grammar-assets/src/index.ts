import type { TokenizerSupportedLanguage } from "@repo-edu/domain/analysis"

export const packageId = "@repo-edu/tree-sitter-grammar-assets"
export const workspaceDependencies = ["@repo-edu/domain"] as const

export const TREE_SITTER_RUNTIME_VERSION = "0.26.9"

export type GrammarAssetAcquisition = {
  readonly packageName: string
  readonly packageVersion: string
  readonly assetPath: string
}

export type GrammarAssetManifestEntry = {
  readonly language: TokenizerSupportedLanguage
  readonly assetUrl: string
  readonly assetBytes: number
  readonly assetSha256: string
  readonly upstreamSource: string
  readonly grammarVersion: string
  readonly treeSitterCliVersion: string
  readonly grammarAbiVersion: number
  readonly runtimeVersion: typeof TREE_SITTER_RUNTIME_VERSION
  readonly spdxLicense: string
  readonly acquisition: GrammarAssetAcquisition
  readonly noticeFile: string | null
}

export const TOKENIZER_GRAMMAR_ASSETS = {
  c: {
    language: "c",
    assetUrl: new URL("./assets/grammars/tree-sitter-c.wasm", import.meta.url)
      .href,
    assetBytes: 625_918,
    assetSha256:
      "c852c2a85ebf2beb636aa3b0ef7f7e70458684d74f6741b20dcb296885bed9f9",
    upstreamSource: "tree-sitter/tree-sitter-c",
    grammarVersion: "0.24.1",
    treeSitterCliVersion: "prebuilt",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "tree-sitter-c",
      packageVersion: "0.24.1",
      assetPath: "tree-sitter-c.wasm",
    },
    noticeFile: null,
  },
  cpp: {
    language: "cpp",
    assetUrl: new URL("./assets/grammars/tree-sitter-cpp.wasm", import.meta.url)
      .href,
    assetBytes: 5_394_393,
    assetSha256:
      "77a65bd42f43c2dcd69af40c12a6c32d6ed81d360c025e9feb28911f8339fd69",
    upstreamSource: "tree-sitter/tree-sitter-cpp",
    grammarVersion: "0.23.x",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-cpp.wasm",
    },
    noticeFile: null,
  },
  cs: {
    language: "cs",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-c-sharp.wasm",
      import.meta.url,
    ).href,
    assetBytes: 5_103_332,
    assetSha256:
      "d12d85996c25957b4c1b71e26db2d7cc8a294997b60642e9c2a3b031b2c66dd3",
    upstreamSource: "tree-sitter/tree-sitter-c-sharp",
    grammarVersion: "0.23.1",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-c-sharp.wasm",
    },
    noticeFile: null,
  },
  go: {
    language: "go",
    assetUrl: new URL("./assets/grammars/tree-sitter-go.wasm", import.meta.url)
      .href,
    assetBytes: 217_182,
    assetSha256:
      "9504573f352b20be7f2f1911754d710622aedc15afff16d5ed8fb5645681aee7",
    upstreamSource: "tree-sitter/tree-sitter-go",
    grammarVersion: "0.25.0",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-go.wasm",
    },
    noticeFile: null,
  },
  haskell: {
    language: "haskell",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-haskell.wasm",
      import.meta.url,
    ).href,
    assetBytes: 3_805_902,
    assetSha256:
      "37a6b07b1a838d02ffb4f4c2a06863637a8efe48432d60a275f50f1d08f1092c",
    upstreamSource: "tree-sitter/tree-sitter-haskell",
    grammarVersion: "0.23.1",
    treeSitterCliVersion: "prebuilt",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "tree-sitter-haskell",
      packageVersion: "0.23.1",
      assetPath: "tree-sitter-haskell.wasm",
    },
    noticeFile: null,
  },
  java: {
    language: "java",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-java.wasm",
      import.meta.url,
    ).href,
    assetBytes: 414_641,
    assetSha256:
      "4fdeac4ca6ca089f06c6f7e562abcac1733cd465728cc7031ebb73c2019122c4",
    upstreamSource: "tree-sitter/tree-sitter-java",
    grammarVersion: "0.23.5",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-java.wasm",
    },
    noticeFile: null,
  },
  js: {
    language: "js",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-javascript.wasm",
      import.meta.url,
    ).href,
    assetBytes: 411_770,
    assetSha256:
      "5fb488d0cabb4775a594bab85682de5ad6ce83c0d6ac997a9f82dd084d571240",
    upstreamSource: "tree-sitter/tree-sitter-javascript",
    grammarVersion: "0.25.0",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-javascript.wasm",
    },
    noticeFile: null,
  },
  jsx: {
    language: "jsx",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-javascript.wasm",
      import.meta.url,
    ).href,
    assetBytes: 411_770,
    assetSha256:
      "5fb488d0cabb4775a594bab85682de5ad6ce83c0d6ac997a9f82dd084d571240",
    upstreamSource: "tree-sitter/tree-sitter-javascript",
    grammarVersion: "0.25.0",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-javascript.wasm",
    },
    noticeFile: null,
  },
  kotlin: {
    language: "kotlin",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-kotlin.wasm",
      import.meta.url,
    ).href,
    assetBytes: 3_441_042,
    assetSha256:
      "7009d69453bc8735e438b2818a633efb21c88f99782769abba60dffedfab73f7",
    upstreamSource: "fwcd/tree-sitter-kotlin",
    grammarVersion: "1.1.0",
    treeSitterCliVersion: "prebuilt",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@tree-sitter-grammars/tree-sitter-kotlin",
      packageVersion: "1.1.0",
      assetPath: "tree-sitter-kotlin.wasm",
    },
    noticeFile: null,
  },
  matlab: {
    language: "matlab",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-matlab.wasm",
      import.meta.url,
    ).href,
    assetBytes: 426_521,
    assetSha256:
      "38925658bee8a9179c9253aa611a0d4570e1b3130aa81348b059cf2809c6eb73",
    upstreamSource: "acristoffers/tree-sitter-matlab",
    grammarVersion: "1.3.0",
    treeSitterCliVersion: "0.26.7",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@lumis-sh/wasm-matlab",
      packageVersion: "0.26.0",
      assetPath: "tree-sitter-matlab.wasm",
    },
    noticeFile: null,
  },
  php: {
    language: "php",
    assetUrl: new URL("./assets/grammars/tree-sitter-php.wasm", import.meta.url)
      .href,
    assetBytes: 1_058_041,
    assetSha256:
      "d4df6a6ff08c87c3ec4f9cbb785fe09998a0cb570e03f57d7b19b3acfb146aa7",
    upstreamSource: "tree-sitter/tree-sitter-php",
    grammarVersion: "0.24.2",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-php.wasm",
    },
    noticeFile: null,
  },
  py: {
    language: "py",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-python.wasm",
      import.meta.url,
    ).href,
    assetBytes: 457_883,
    assetSha256:
      "16108b50df4ee9a30168794252ab55e7c93bfc5765d7fa0aa3e335752c515f47",
    upstreamSource: "tree-sitter/tree-sitter-python",
    grammarVersion: "0.25.0",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-python.wasm",
    },
    noticeFile: null,
  },
  r: {
    language: "r",
    assetUrl: new URL("./assets/grammars/tree-sitter-r.wasm", import.meta.url)
      .href,
    assetBytes: 481_163,
    assetSha256:
      "2a8f5acd1c53d91e0ec5c01a6830d8ac7f5a7f96f0ac4b3768c016c8e9d07711",
    upstreamSource: "r-lib/tree-sitter-r",
    grammarVersion: "1.2.0",
    treeSitterCliVersion: "prebuilt",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@davisvaughan/tree-sitter-r",
      packageVersion: "1.2.0",
      assetPath: "tree-sitter-r.wasm",
    },
    noticeFile: null,
  },
  rb: {
    language: "rb",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-ruby.wasm",
      import.meta.url,
    ).href,
    assetBytes: 2_106_352,
    assetSha256:
      "09a96427d7c72f0613ed470cd9812223fc4a91d6a9c025c0235cc6bd59ff96f4",
    upstreamSource: "tree-sitter/tree-sitter-ruby",
    grammarVersion: "0.23.1",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-ruby.wasm",
    },
    noticeFile: null,
  },
  robot: {
    language: "robot",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-robot.wasm",
      import.meta.url,
    ).href,
    assetBytes: 97_357,
    assetSha256:
      "73d8991d884de09a8056ff50233d73087d0e4008a43e766b1d6064fb31ab34b0",
    upstreamSource: "Hubro/tree-sitter-robot",
    grammarVersion: "1.1.2",
    treeSitterCliVersion: "prebuilt",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "ISC",
    acquisition: {
      packageName: "tree-sitter-robot",
      packageVersion: "1.1.2",
      assetPath: "tree-sitter-robot.wasm",
    },
    noticeFile: null,
  },
  rs: {
    language: "rs",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-rust.wasm",
      import.meta.url,
    ).href,
    assetBytes: 1_113_644,
    assetSha256:
      "0dac14947cb04d94466e3df659f80a4e264c216a60b3eda175eae4cf12ed7a8d",
    upstreamSource: "tree-sitter/tree-sitter-rust",
    grammarVersion: "0.24.0",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-rust.wasm",
    },
    noticeFile: null,
  },
  shell: {
    language: "shell",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-bash.wasm",
      import.meta.url,
    ).href,
    assetBytes: 1_380_769,
    assetSha256:
      "a14e9ed880b2c3f16cd00c796c38d237a3e9b028bdec5b4315c76976e67b01ca",
    upstreamSource: "tree-sitter/tree-sitter-bash",
    grammarVersion: "0.23.3",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 15,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-bash.wasm",
    },
    noticeFile: null,
  },
  sql: {
    language: "sql",
    assetUrl: new URL("./assets/grammars/tree-sitter-sql.wasm", import.meta.url)
      .href,
    assetBytes: 78_602,
    assetSha256:
      "5d5dfa5e4b027aa9f53300c0de13994db43190dd40d164c1f157fa28a00f15f7",
    upstreamSource: "m-novikov/tree-sitter-sql",
    grammarVersion: "0.1.0",
    treeSitterCliVersion: "0.26.9",
    grammarAbiVersion: 13,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "tree-sitter-sql",
      packageVersion: "0.1.0",
      assetPath: "source build",
    },
    noticeFile: null,
  },
  toml: {
    language: "toml",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-toml.wasm",
      import.meta.url,
    ).href,
    assetBytes: 24_040,
    assetSha256:
      "1ac6a83826c35a68857f8325e00c78f6bcbef4eb6db3931a6cf3041f76e5e09f",
    upstreamSource: "tree-sitter-grammars/tree-sitter-toml",
    grammarVersion: "0.7.0",
    treeSitterCliVersion: "prebuilt",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@tree-sitter-grammars/tree-sitter-toml",
      packageVersion: "0.7.0",
      assetPath: "tree-sitter-toml.wasm",
    },
    noticeFile: null,
  },
  ts: {
    language: "ts",
    assetUrl: new URL(
      "./assets/grammars/tree-sitter-typescript.wasm",
      import.meta.url,
    ).href,
    assetBytes: 1_413_849,
    assetSha256:
      "778025db5a8be0e70f8ccc3671e486dfeddd048c25d9e8a70c26de2e1bf6f97d",
    upstreamSource: "tree-sitter/tree-sitter-typescript",
    grammarVersion: "0.23.2",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-typescript.wasm",
    },
    noticeFile: null,
  },
  tsx: {
    language: "tsx",
    assetUrl: new URL("./assets/grammars/tree-sitter-tsx.wasm", import.meta.url)
      .href,
    assetBytes: 1_445_638,
    assetSha256:
      "79e5da75ea62855a0cd67177685f0164eac87d5f630b3cbe1e0a099751ad30f8",
    upstreamSource: "tree-sitter/tree-sitter-typescript",
    grammarVersion: "0.23.2",
    treeSitterCliVersion: "0.25.10",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@vscode/tree-sitter-wasm",
      packageVersion: "0.3.1",
      assetPath: "wasm/tree-sitter-tsx.wasm",
    },
    noticeFile: null,
  },
  xml: {
    language: "xml",
    assetUrl: new URL("./assets/grammars/tree-sitter-xml.wasm", import.meta.url)
      .href,
    assetBytes: 50_001,
    assetSha256:
      "80779b09636461d8f439c36348ec47e332b4208f1d2cd4d0689b0f47d30a9964",
    upstreamSource: "tree-sitter-grammars/tree-sitter-xml",
    grammarVersion: "0.7.0",
    treeSitterCliVersion: "0.26.9",
    grammarAbiVersion: 14,
    runtimeVersion: TREE_SITTER_RUNTIME_VERSION,
    spdxLicense: "MIT",
    acquisition: {
      packageName: "@tree-sitter-grammars/tree-sitter-xml",
      packageVersion: "0.7.0",
      assetPath: "xml source build",
    },
    noticeFile: null,
  },
} as const satisfies Record<
  TokenizerSupportedLanguage,
  GrammarAssetManifestEntry
>

export const TOKENIZER_GRAMMAR_ASSET_IDS = Object.keys(
  TOKENIZER_GRAMMAR_ASSETS,
) as TokenizerSupportedLanguage[]

export function getTokenizerGrammarAsset(
  language: TokenizerSupportedLanguage,
): GrammarAssetManifestEntry {
  return TOKENIZER_GRAMMAR_ASSETS[language]
}
