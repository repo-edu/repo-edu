import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_EXTENSIONS,
  extensionToLanguage,
  LANGUAGE_CATALOG,
} from "../../analysis/index.js"

const DEFAULT_EXTENSIONS_SNAPSHOT = [
  "ada",
  "adb",
  "ads",
  "bash",
  "c",
  "cc",
  "cif",
  "cjs",
  "clj",
  "cljc",
  "cljs",
  "cpp",
  "cs",
  "cts",
  "cxx",
  "dart",
  "edn",
  "ex",
  "exs",
  "frag",
  "fs",
  "fsi",
  "fsx",
  "glsl",
  "go",
  "h",
  "hh",
  "hpp",
  "hs",
  "htm",
  "html",
  "hxx",
  "ily",
  "java",
  "js",
  "jspx",
  "jsx",
  "kt",
  "kts",
  "lhs",
  "lua",
  "ly",
  "mjs",
  "ml",
  "mli",
  "mts",
  "php",
  "pl",
  "pm",
  "po",
  "pot",
  "py",
  "r",
  "rb",
  "rlib",
  "robot",
  "rs",
  "sc",
  "scala",
  "sh",
  "sql",
  "svelte",
  "swift",
  "tex",
  "toml",
  "tooldef",
  "ts",
  "tsx",
  "vert",
  "vue",
  "xhtml",
  "xml",
  "zsh",
] as const

describe("extensionToLanguage", () => {
  it("maps known extensions", () => {
    assert.equal(extensionToLanguage("ts"), "ts")
    assert.equal(extensionToLanguage("py"), "py")
    assert.equal(extensionToLanguage("java"), "java")
  })

  it("strips leading dot", () => {
    assert.equal(extensionToLanguage(".ts"), "ts")
  })

  it("is case-insensitive", () => {
    assert.equal(extensionToLanguage("TS"), "ts")
    assert.equal(extensionToLanguage(".PY"), "py")
  })

  it("returns undefined for unsupported extensions", () => {
    assert.equal(extensionToLanguage("xyz"), undefined)
    assert.equal(extensionToLanguage("md"), undefined)
  })
})

describe("language catalogue cleanup", () => {
  it("does not carry comment grammar metadata", () => {
    for (const entry of Object.values(LANGUAGE_CATALOG)) {
      assert.equal("comment" in entry, false)
    }
  })

  it("keeps default extensions stable", () => {
    assert.deepEqual(DEFAULT_EXTENSIONS, DEFAULT_EXTENSIONS_SNAPSHOT)
  })
})
