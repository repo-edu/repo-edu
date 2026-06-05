import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { resolveUnpackedCodexBinaryPath } from "../codex-binary.js"

function makeResources(): string {
  return mkdtempSync(join(tmpdir(), "codex-binary-test-"))
}

function unpackedOpenAiDir(resources: string): string {
  const dir = join(resources, "app.asar.unpacked", "node_modules", "@openai")
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeExecutable(path: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, "binary")
}

describe("resolveUnpackedCodexBinaryPath", () => {
  it("resolves the unpacked native binary for the host platform", () => {
    const resources = makeResources()
    const openai = unpackedOpenAiDir(resources)
    // Distractor JS-only package without a vendor payload is skipped.
    mkdirSync(join(openai, "codex-sdk", "dist"), { recursive: true })
    const binary = join(
      openai,
      "codex-darwin-arm64",
      "vendor",
      "aarch64-apple-darwin",
      "codex",
      "codex",
    )
    writeExecutable(binary)

    assert.equal(resolveUnpackedCodexBinaryPath(resources, "darwin"), binary)
  })

  it("looks for codex.exe on win32", () => {
    const resources = makeResources()
    const openai = unpackedOpenAiDir(resources)
    const binary = join(
      openai,
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "codex",
      "codex.exe",
    )
    writeExecutable(binary)

    assert.equal(resolveUnpackedCodexBinaryPath(resources, "win32"), binary)
  })

  it("returns undefined when no unpacked payload is present (development)", () => {
    const resources = makeResources()
    assert.equal(resolveUnpackedCodexBinaryPath(resources, "darwin"), undefined)
  })

  it("returns undefined when the platform package has no codex binary", () => {
    const resources = makeResources()
    const openai = unpackedOpenAiDir(resources)
    mkdirSync(
      join(openai, "codex-darwin-arm64", "vendor", "aarch64-apple-darwin"),
      { recursive: true },
    )
    assert.equal(resolveUnpackedCodexBinaryPath(resources, "darwin"), undefined)
  })
})
