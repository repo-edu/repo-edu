import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import {
  QUOTA_EXHAUSTED_BASENAME,
  RATE_LIMITED_BASENAME,
  STATE_BASENAME,
} from "./constants.js"
import { findRepoDirs } from "./evaluate.js"

let root: string

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "fixture-evaluate-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeRepo(rel: string, files: Record<string, string>): string {
  const dir = resolve(root, rel)
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(resolve(dir, name), content)
  }
  return dir
}

describe("findRepoDirs", () => {
  test("finds dirs containing _state.json", () => {
    const repo = makeRepo("p1/m22-46-o1", {
      [STATE_BASENAME]: '{"rounds":[]}',
    })
    assert.deepEqual(findRepoDirs(root), [repo])
  })

  test("finds dirs containing only _rate-limited.json", () => {
    const repo = makeRepo("p1/m22-46-o1", {
      [RATE_LIMITED_BASENAME]: '{"kind":"rate_limit"}',
    })
    assert.deepEqual(findRepoDirs(root), [repo])
  })

  test("finds dirs containing only _quota-exhausted.json", () => {
    const repo = makeRepo("p1/m22-46-o1", {
      [QUOTA_EXHAUSTED_BASENAME]: '{"kind":"quota_exhausted"}',
    })
    assert.deepEqual(findRepoDirs(root), [repo])
  })

  test("treats marker-only dirs as leaves and does not descend further", () => {
    const repo = makeRepo("p1/m22-46-o1", {
      [RATE_LIMITED_BASENAME]: "{}",
    })
    // sub-dir below the marker should not be discovered
    makeRepo("p1/m22-46-o1/nested", { [STATE_BASENAME]: "{}" })
    assert.deepEqual(findRepoDirs(root), [repo])
  })

  test("walks past dirs with no markers and no state.json", () => {
    const completed = makeRepo("p1/m22-46-o1", {
      [STATE_BASENAME]: '{"rounds":[]}',
    })
    const incomplete = makeRepo("p2/m22-46-o2", {
      [QUOTA_EXHAUSTED_BASENAME]: "{}",
    })
    assert.deepEqual(findRepoDirs(root).sort(), [completed, incomplete].sort())
  })
})
