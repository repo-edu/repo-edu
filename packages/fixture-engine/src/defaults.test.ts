import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, test } from "node:test"
import { setFixtureRuntimeRoots } from "./constants.js"
import {
  EVALUATE_PHASE_KEYS,
  HARDCODED_SETTINGS,
  loadSweepFile,
  materializeSettings,
  PLAN_PHASE_KEYS,
  REPO_PHASE_KEYS,
  type Settings,
  writeSweep,
} from "./defaults.js"
import { FixtureError } from "./log.js"

let workDir: string
function stageSweep(name: string, body: object | string): string {
  const path = resolve(workDir, name)
  const text = typeof body === "string" ? body : JSON.stringify(body)
  writeFileSync(path, text)
  return path
}

beforeEach(() => {
  workDir = mkdtempSync(resolve(tmpdir(), "fixture-defaults-"))
  // `loadSweepFile` and `writeSweep` consult the lazy `SETTINGS()` singleton,
  // which requires runtime roots. Point fixturesDir at the per-test workDir
  // so the absent settings file falls back to `HARDCODED_SETTINGS`.
  setFixtureRuntimeRoots({ workspaceRoot: workDir, fixturesDir: workDir })
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe("loadSweepFile — phase classification", () => {
  test("style is plan-phase", () => {
    const path = stageSweep("p.jsonc", { style: ["incremental", "big-bang"] })
    const sweep = loadSweepFile(path)
    assert.equal(sweep.phase, "plan")
    assert.equal(sweep.sweptKey, "style")
    assert.deepEqual(sweep.sweptValues, ["incremental", "big-bang"])
  })

  test("mc is repo-phase", () => {
    const path = stageSweep("r.jsonc", {
      mc: ["22", "33"],
      rounds: 3,
      reviews: 0,
    })
    const sweep = loadSweepFile(path)
    assert.equal(sweep.phase, "repo")
    assert.equal(sweep.sweptKey, "mc")
  })

  test("every plan-phase key classifies as plan", () => {
    for (const key of PLAN_PHASE_KEYS) {
      const value =
        key === "mp"
          ? ["33", "32"]
          : key === "aiCoders"
            ? [true, false]
            : key === "style"
              ? ["incremental", "big-bang"]
              : [1, 2]
      const path = stageSweep(`${key}.jsonc`, { [key]: value })
      assert.equal(loadSweepFile(path).phase, "plan", `${key} should be plan`)
    }
  })

  test("every repo-phase key classifies as repo", () => {
    for (const key of REPO_PHASE_KEYS) {
      const value = key === "mc" ? ["22", "33"] : [1, 2]
      const path = stageSweep(`${key}.jsonc`, {
        [key]: value,
        rounds: 3,
        reviews: 0,
      })
      assert.equal(loadSweepFile(path).phase, "repo", `${key} should be repo`)
    }
  })

  test("phase key sets are disjoint and exhaustive", () => {
    const all: (keyof Settings)[] = Object.keys(
      HARDCODED_SETTINGS,
    ) as (keyof Settings)[]
    for (const key of all) {
      const memberships = [
        PLAN_PHASE_KEYS.has(key),
        REPO_PHASE_KEYS.has(key),
        EVALUATE_PHASE_KEYS.has(key),
      ].filter(Boolean).length
      assert.equal(memberships, 1, `${key} must be in exactly one phase`)
    }
  })

  test("evaluate-phase key cannot be swept", () => {
    const path = stageSweep("p.jsonc", { me: ["33", "35"] })
    assert.throws(
      () => loadSweepFile(path),
      /cannot sweep on "me" — evaluate-phase keys/,
    )
  })
})

describe("loadSweepFile — base settings & overrides", () => {
  test("scalar siblings override defaults in baseSettings", () => {
    const path = stageSweep("p.jsonc", {
      style: ["incremental", "big-bang"],
      students: 5,
      rounds: 7,
      reviews: 2,
    })
    const sweep = loadSweepFile(path)
    assert.equal(sweep.baseSettings.students, 5)
    assert.equal(sweep.baseSettings.rounds, 7)
    assert.equal(sweep.baseSettings.reviews, 2)
  })

  test("missing scalars fall back to SETTINGS defaults", () => {
    const path = stageSweep("p.jsonc", { style: ["incremental"] })
    const sweep = loadSweepFile(path)
    assert.equal(typeof sweep.baseSettings.rounds, "number")
    assert.equal(typeof sweep.baseSettings.students, "number")
  })
})

describe("loadSweepFile — failures", () => {
  test("missing file", () => {
    assert.throws(
      () => loadSweepFile(resolve(workDir, "absent.jsonc")),
      /sweep file not found/,
    )
  })

  test("no array key", () => {
    const path = stageSweep("p.jsonc", { style: "incremental" })
    assert.throws(
      () => loadSweepFile(path),
      /must have exactly one list-valued key; found none/,
    )
  })

  test("multiple array keys", () => {
    const path = stageSweep("p.jsonc", {
      style: ["incremental"],
      mc: ["22", "33"],
    })
    assert.throws(() => loadSweepFile(path), /found 2 \(style, mc\)/)
  })

  test("empty array", () => {
    const path = stageSweep("p.jsonc", { style: [] })
    assert.throws(() => loadSweepFile(path), /must be non-empty/)
  })

  test("invalid swept value", () => {
    const path = stageSweep("p.jsonc", { style: ["incremental", "bogus"] })
    assert.throws(() => loadSweepFile(path), /"style" must be one of/)
  })

  test("unknown top-level key", () => {
    const path = stageSweep("p.jsonc", { style: ["incremental"], wat: 1 })
    assert.throws(() => loadSweepFile(path), /unknown key "wat"/)
  })

  test("repo-phase: reviews > rounds rejected at base", () => {
    const path = stageSweep("p.jsonc", {
      mc: ["22", "33"],
      rounds: 2,
      reviews: 5,
    })
    assert.throws(() => loadSweepFile(path), /reviews \(5\) must be ≤ rounds/)
  })

  test("plan-phase: reviews > rounds at base is deferred (not raised here)", () => {
    const path = stageSweep("p.jsonc", {
      style: ["incremental"],
      rounds: 2,
      reviews: 5,
    })
    assert.doesNotThrow(() => loadSweepFile(path))
  })

  test("FixtureError is the thrown type", () => {
    const path = stageSweep("p.jsonc", { style: [] })
    assert.throws(() => loadSweepFile(path), FixtureError)
  })

  test("invalid JSONC", () => {
    const path = stageSweep("p.jsonc", "{ this is not json")
    assert.throws(() => loadSweepFile(path), /invalid JSONC/)
  })

  test("non-object root", () => {
    const path = stageSweep("p.jsonc", "[1, 2, 3]")
    assert.throws(() => loadSweepFile(path), /must be a JSON object/)
  })
})

describe("writeSweep — scaffolded default", () => {
  test("writes a parseable plan-phase sweep file", () => {
    writeSweep(workDir)
    const sweep = loadSweepFile(resolve(workDir, ".fixture-sweep.jsonc"))
    assert.equal(sweep.phase, "plan")
    assert.equal(sweep.sweptKey, "style")
    assert.deepEqual(sweep.sweptValues, ["incremental", "vertical-slice"])
  })
})

describe("materializeSettings", () => {
  test("substitutes the swept value", () => {
    const next = materializeSettings(HARDCODED_SETTINGS, "rounds", 9, "ref")
    assert.equal(next.rounds, 9)
    assert.equal(next.style, HARDCODED_SETTINGS.style)
  })

  test("rejects reviews > rounds in materialized output", () => {
    const base: Settings = { ...HARDCODED_SETTINGS, rounds: 5, reviews: 0 }
    assert.throws(
      () => materializeSettings(base, "reviews", 9, "ref"),
      /reviews \(9\) must be ≤ rounds \(5\)/,
    )
  })

  test("does not mutate the input", () => {
    const base: Settings = { ...HARDCODED_SETTINGS }
    const before = { ...base }
    materializeSettings(base, "rounds", 7, "ref")
    assert.deepEqual(base, before)
  })
})
