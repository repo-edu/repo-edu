import assert from "node:assert/strict"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import type { FixtureModelSpec } from "@repo-edu/integrations-llm-catalog"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import {
  QUOTA_EXHAUSTED_BASENAME,
  RATE_LIMITED_BASENAME,
  STATE_BASENAME,
} from "./constants.js"
import {
  hasCapMarker,
  isCapErrorKind,
  markerBasename,
  readCapMarker,
  writeCapMarkerForRepo,
} from "./markers.js"

const SPEC: FixtureModelSpec = {
  provider: "claude",
  family: "sonnet",
  modelId: "claude-sonnet-test",
  effort: "low",
  displayName: "Claude Sonnet (test)",
  versionTag: "tst",
  priceUsdPerMTok: undefined,
}

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(resolve(tmpdir(), "fixture-markers-"))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe("isCapErrorKind", () => {
  test("rate_limit and quota_exhausted are caps", () => {
    assert.equal(isCapErrorKind("rate_limit"), true)
    assert.equal(isCapErrorKind("quota_exhausted"), true)
  })
  test("auth, network, other are not caps", () => {
    assert.equal(isCapErrorKind("auth"), false)
    assert.equal(isCapErrorKind("network"), false)
    assert.equal(isCapErrorKind("other"), false)
  })
})

describe("markerBasename", () => {
  test("matches the basename constants", () => {
    assert.equal(markerBasename("rate_limit"), RATE_LIMITED_BASENAME)
    assert.equal(markerBasename("quota_exhausted"), QUOTA_EXHAUSTED_BASENAME)
  })
})

describe("writeCapMarkerForRepo", () => {
  test("writes _rate-limited.json with provider/authMode/spec/round when state.json is absent", () => {
    const err = new LlmError("rate_limit", "limit reached", {
      context: { provider: "claude", authMode: "subscription" },
    })
    const marker = writeCapMarkerForRepo(workDir, err, SPEC)
    assert.ok(marker)
    assert.equal(marker?.kind, "rate_limit")
    assert.equal(marker?.provider, "claude")
    assert.equal(marker?.authMode, "subscription")
    assert.equal(marker?.round, 1)
    assert.equal(marker?.coderTurn, 1)
    assert.deepEqual(marker?.spec, SPEC)
    assert.match(marker?.message ?? "", /limit reached/)
    assert.match(marker?.timestamp ?? "", /T.*Z/)

    const path = resolve(workDir, RATE_LIMITED_BASENAME)
    assert.ok(existsSync(path))
    const fromDisk = JSON.parse(readFileSync(path, "utf8"))
    assert.equal(fromDisk.kind, "rate_limit")
  })

  test("writes _quota-exhausted.json for quota_exhausted errors", () => {
    const err = new LlmError("quota_exhausted", "weekly limit", {
      context: { provider: "claude", authMode: "api" },
    })
    const marker = writeCapMarkerForRepo(workDir, err, SPEC)
    assert.equal(marker?.kind, "quota_exhausted")
    assert.ok(existsSync(resolve(workDir, QUOTA_EXHAUSTED_BASENAME)))
    assert.equal(existsSync(resolve(workDir, RATE_LIMITED_BASENAME)), false)
  })

  test("derives round from completed rounds in state.json", () => {
    const state = { commit_index: 2, rounds: [{}, {}], stopped: false }
    writeFileSync(
      resolve(workDir, STATE_BASENAME),
      `${JSON.stringify(state)}\n`,
    )
    const err = new LlmError("rate_limit", "limit", {
      context: { provider: "claude", authMode: "api" },
    })
    const marker = writeCapMarkerForRepo(workDir, err, SPEC)
    assert.equal(marker?.round, 3)
    assert.equal(marker?.coderTurn, 3)
  })

  test("falls back to spec provider when error context lacks one", () => {
    const err = new LlmError("rate_limit", "limit")
    const marker = writeCapMarkerForRepo(workDir, err, SPEC)
    assert.equal(marker?.provider, SPEC.provider)
    assert.equal(marker?.authMode, null)
  })

  test("returns null for non-cap kinds and writes no file", () => {
    const err = new LlmError("auth", "bad token")
    const marker = writeCapMarkerForRepo(workDir, err, SPEC)
    assert.equal(marker, null)
    assert.equal(existsSync(resolve(workDir, RATE_LIMITED_BASENAME)), false)
    assert.equal(existsSync(resolve(workDir, QUOTA_EXHAUSTED_BASENAME)), false)
  })
})

describe("readCapMarker / hasCapMarker", () => {
  test("hasCapMarker returns true when either marker is present", () => {
    assert.equal(hasCapMarker(workDir), false)
    writeFileSync(resolve(workDir, RATE_LIMITED_BASENAME), "{}")
    assert.equal(hasCapMarker(workDir), true)
  })

  test("readCapMarker prefers rate_limit over quota_exhausted when both exist", () => {
    const err = new LlmError("rate_limit", "limit", {
      context: { provider: "claude", authMode: "api" },
    })
    writeCapMarkerForRepo(workDir, err, SPEC)
    writeFileSync(
      resolve(workDir, QUOTA_EXHAUSTED_BASENAME),
      JSON.stringify({ kind: "quota_exhausted" }),
    )
    const marker = readCapMarker(workDir)
    assert.equal(marker?.kind, "rate_limit")
  })

  test("readCapMarker returns null when neither marker is present", () => {
    assert.equal(readCapMarker(workDir), null)
  })
})
