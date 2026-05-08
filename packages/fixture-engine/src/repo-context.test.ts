import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { pythonApiSummary, pythonRepoContext } from "./repo-context"

describe("pythonApiSummary", () => {
  test("captures top-level def, async def, and class signatures", () => {
    const result = pythonApiSummary(
      [
        "from __future__ import annotations",
        "",
        "def encode_bytes(data: bytes, code_lengths: Mapping[int, int]) -> bytes:",
        "    return b''",
        "",
        "async def fetch(url: str) -> bytes:",
        "    return b''",
        "",
        "class BitPacker:",
        "    def write(self, bits: int) -> None:",
        "        pass",
        "",
        '__all__ = ["encode_bytes", "BitPacker"]',
      ].join("\n"),
    )

    assert.match(result, /def encode_bytes\(data: bytes/)
    assert.match(result, /async def fetch\(url: str\)/)
    assert.match(result, /class BitPacker:/)
    assert.match(result, /__all__ = \["encode_bytes", "BitPacker"\]/)
    assert.doesNotMatch(result, /def write\(self/)
  })

  test("joins a multi-line def signature into one entry", () => {
    const result = pythonApiSummary(
      [
        "def write_header(",
        "    code_lengths: Mapping[int, int],",
        "    symbol_count: int,",
        ") -> bytes:",
        "    return b''",
      ].join("\n"),
    )

    assert.equal(
      result,
      [
        "def write_header(",
        "    code_lengths: Mapping[int, int],",
        "    symbol_count: int,",
        ") -> bytes:",
      ].join("\n"),
    )
  })
})

describe("pythonRepoContext", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fixture-repo-context-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("includes full text for small Python modules and excludes the target file", () => {
    writeFileSync(
      join(dir, "codec.py"),
      "def encode_bytes(data: bytes) -> bytes:\n    return b''\n",
    )
    writeFileSync(
      join(dir, "frequency.py"),
      "def count(data: bytes) -> dict[int, int]:\n    return {}\n",
    )
    writeFileSync(join(dir, ".gitignore"), "ignored\n")

    const ctx = pythonRepoContext(dir, "frequency.py")

    assert.match(ctx, /### `codec\.py` \(full\)/)
    assert.match(ctx, /def encode_bytes\(data: bytes\) -> bytes:/)
    assert.doesNotMatch(ctx, /### `frequency\.py`/)
    assert.doesNotMatch(ctx, /\.gitignore/)
  })

  test("falls back to API summary for files above the size budget", () => {
    const big = `${"# pad\n".repeat(2000)}def public_api(x: int) -> int:\n    return x\n`
    writeFileSync(join(dir, "big.py"), big)

    const ctx = pythonRepoContext(dir, "")

    assert.match(ctx, /### `big\.py` \(summary, \d+ bytes\)/)
    assert.match(ctx, /def public_api\(x: int\) -> int:/)
    assert.doesNotMatch(ctx, /# pad/)
  })

  test("walks subdirectories so sibling tests show up", () => {
    mkdirSync(join(dir, "tests"))
    writeFileSync(
      join(dir, "codec.py"),
      "def encode_bytes() -> bytes:\n    return b''\n",
    )
    writeFileSync(
      join(dir, "tests", "test_codec.py"),
      "def test_round_trip() -> None:\n    pass\n",
    )

    const ctx = pythonRepoContext(dir, "")

    assert.match(ctx, /### `codec\.py`/)
    assert.match(ctx, /### `tests\/test_codec\.py`/)
  })

  test("returns a placeholder when the repo has no Python files", () => {
    writeFileSync(join(dir, "README.md"), "hi\n")

    assert.equal(pythonRepoContext(dir, ""), "(no other Python files yet)")
  })

  test("returns a placeholder when the repo directory does not exist yet", () => {
    assert.equal(
      pythonRepoContext(join(dir, "nope"), ""),
      "(no other Python files yet)",
    )
  })
})
