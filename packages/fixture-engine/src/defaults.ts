import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  COMMENTS_FREE_TIER,
  DEFAULT_AI_CODERS,
  DEFAULT_CODER_INTERACTION,
  DEFAULT_COMMENTS,
  DEFAULT_COMPLEXITY,
  DEFAULT_MC,
  DEFAULT_ME,
  DEFAULT_MP,
  DEFAULT_REVIEWS,
  DEFAULT_ROUNDS,
  DEFAULT_STUDENTS,
  DEFAULT_STYLE,
  FIXTURES_DIR,
  MAX_CODER_INTERACTION,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_STUDENTS,
  MIN_CODER_INTERACTION,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_REVIEWS,
  MIN_STUDENTS,
  SETTINGS_BASENAME,
  STYLES,
  type Style,
  SWEEP_BASENAME,
} from "./constants"
import { fail } from "./log"

export function FIXTURE_SETTINGS_FILE(): string {
  return resolve(FIXTURES_DIR(), SETTINGS_BASENAME)
}
export function FIXTURE_SWEEP_FILE(): string {
  return resolve(FIXTURES_DIR(), SWEEP_BASENAME)
}

export interface Settings {
  mp: string
  mc: string
  me: string
  aiCoders: boolean
  coderInteraction: number
  complexity: number
  students: number
  rounds: number
  comments: number
  reviews: number
  style: Style
}

export const HARDCODED_SETTINGS: Settings = {
  mp: DEFAULT_MP,
  mc: DEFAULT_MC,
  me: DEFAULT_ME,
  aiCoders: DEFAULT_AI_CODERS,
  coderInteraction: DEFAULT_CODER_INTERACTION,
  complexity: DEFAULT_COMPLEXITY,
  students: DEFAULT_STUDENTS,
  rounds: DEFAULT_ROUNDS,
  comments: DEFAULT_COMMENTS,
  reviews: DEFAULT_REVIEWS,
  style: DEFAULT_STYLE,
}

interface Spec {
  min: number
  max: number
}

const NUMERIC_SPECS: Record<
  keyof Omit<Settings, "mp" | "mc" | "me" | "aiCoders" | "style">,
  Spec
> = {
  coderInteraction: { min: MIN_CODER_INTERACTION, max: MAX_CODER_INTERACTION },
  complexity: { min: MIN_COMPLEXITY, max: MAX_COMPLEXITY },
  students: { min: MIN_STUDENTS, max: MAX_STUDENTS },
  rounds: { min: 1, max: Number.MAX_SAFE_INTEGER },
  comments: { min: MIN_COMMENTS, max: MAX_COMMENTS },
  reviews: { min: MIN_REVIEWS, max: Number.MAX_SAFE_INTEGER },
}

const KNOWN_KEYS = new Set<keyof Settings>([
  "mp",
  "mc",
  "me",
  "aiCoders",
  "style",
  ...(Object.keys(NUMERIC_SPECS) as (keyof Settings)[]),
])

function stripJsoncComments(text: string): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      out += c
      i++
      while (i < text.length) {
        const ch = text[i]
        out += ch
        if (ch === "\\" && i + 1 < text.length) {
          out += text[i + 1]
          i += 2
          continue
        }
        i++
        if (ch === '"') break
      }
      continue
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

function parseJsonc(text: string): unknown {
  const stripped = stripJsoncComments(text).replace(/,(\s*[\]}])/g, "$1")
  return JSON.parse(stripped)
}

function validateValue<K extends keyof Settings>(
  ref: string,
  key: K,
  v: unknown,
): Settings[K] {
  if (key === "mp" || key === "mc" || key === "me") {
    if (typeof v !== "string" || v.length === 0) {
      fail(
        `${ref}: "${key}" must be a non-empty model-code string, got ${JSON.stringify(v)}`,
      )
    }
    return v as Settings[K]
  }
  if (key === "aiCoders") {
    if (typeof v !== "boolean") {
      fail(`${ref}: "aiCoders" must be a boolean, got ${JSON.stringify(v)}`)
    }
    return v as Settings[K]
  }
  if (key === "style") {
    if (typeof v !== "string" || !STYLES.includes(v as Style)) {
      fail(
        `${ref}: "style" must be one of ${STYLES.join(", ")}, got ${JSON.stringify(v)}`,
      )
    }
    return v as Settings[K]
  }
  const spec = NUMERIC_SPECS[key as keyof typeof NUMERIC_SPECS]
  if (
    typeof v !== "number" ||
    !Number.isInteger(v) ||
    v < spec.min ||
    v > spec.max
  ) {
    fail(
      `${ref}: "${key}" must be an integer ${spec.min}-${spec.max}, got ${JSON.stringify(v)}`,
    )
  }
  return v as Settings[K]
}

function readJsoncObject(path: string): Record<string, unknown> {
  let raw: unknown
  try {
    raw = parseJsonc(readFileSync(path, "utf8"))
  } catch (err) {
    fail(
      `${path}: invalid JSONC (${err instanceof Error ? err.message : String(err)})`,
    )
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(`${path}: must be a JSON object`)
  }
  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key as keyof Settings)) {
      fail(
        `${path}: unknown key "${key}"; expected one of ${[...KNOWN_KEYS].join(", ")}`,
      )
    }
  }
  return obj
}

function parseSettingsFile(path: string): Partial<Settings> {
  if (!existsSync(path)) return {}
  const obj = readJsoncObject(path)
  const out: Partial<Settings> = {}
  for (const key of KNOWN_KEYS) {
    const v = obj[key]
    if (v === undefined) continue
    ;(out as Record<string, unknown>)[key] = validateValue(path, key, v)
  }
  return out
}

export const PLAN_PHASE_KEYS = new Set<keyof Settings>([
  "mp",
  "complexity",
  "aiCoders",
  "coderInteraction",
  "style",
  "students",
  "rounds",
  "reviews",
])

export const REPO_PHASE_KEYS = new Set<keyof Settings>(["mc", "comments"])

export const EVALUATE_PHASE_KEYS = new Set<keyof Settings>(["me"])

export type SweepPhase = "plan" | "repo"

export interface SweepFile {
  sweptKey: keyof Settings
  sweptValues: Settings[keyof Settings][]
  phase: SweepPhase
  baseSettings: Settings
}

export function loadSweepFile(path: string): SweepFile {
  if (!existsSync(path)) fail(`sweep file not found: ${path}`)
  const obj = readJsoncObject(path)
  const arrayKeys = (Object.keys(obj) as (keyof Settings)[]).filter((k) =>
    Array.isArray(obj[k]),
  )
  if (arrayKeys.length === 0) {
    fail(
      `${path}: sweep file must have exactly one list-valued key; found none`,
    )
  }
  if (arrayKeys.length > 1) {
    fail(
      `${path}: sweep file must have exactly one list-valued key; found ${arrayKeys.length} (${arrayKeys.join(", ")})`,
    )
  }
  const sweptKey = arrayKeys[0]
  const rawList = obj[sweptKey] as unknown[]
  if (rawList.length === 0) {
    fail(`${path}: list for "${sweptKey}" must be non-empty`)
  }
  if (EVALUATE_PHASE_KEYS.has(sweptKey)) {
    fail(
      `${path}: cannot sweep on "${sweptKey}" — evaluate-phase keys are not part of plan/repo runs`,
    )
  }
  const sweptValues = rawList.map((v, i) =>
    validateValue(`${path}[${sweptKey}][${i}]`, sweptKey, v),
  )
  const overrides: Partial<Settings> = {}
  for (const key of KNOWN_KEYS) {
    if (key === sweptKey) continue
    const v = obj[key]
    if (v === undefined) continue
    if (Array.isArray(v)) continue // unreachable, guarded above
    ;(overrides as Record<string, unknown>)[key] = validateValue(path, key, v)
  }
  const baseSettings: Settings = { ...SETTINGS(), ...overrides }
  const phase: SweepPhase = PLAN_PHASE_KEYS.has(sweptKey) ? "plan" : "repo"
  if (phase === "plan") {
    // reviews ≤ rounds will be checked per materialized variant
  } else if (baseSettings.reviews > baseSettings.rounds) {
    fail(
      `${path}: reviews (${baseSettings.reviews}) must be ≤ rounds (${baseSettings.rounds})`,
    )
  }
  return { sweptKey, sweptValues, phase, baseSettings }
}

export function materializeSettings<K extends keyof Settings>(
  base: Settings,
  key: K,
  value: Settings[K],
  ref: string,
): Settings {
  const next: Settings = { ...base, [key]: value }
  if (next.reviews > next.rounds) {
    fail(`${ref}: reviews (${next.reviews}) must be ≤ rounds (${next.rounds})`)
  }
  return next
}

// Lazy so importing this module does not trigger a runtime-roots read.
// Tests that exercise pure helpers (parsers, materializers) can import the
// module without configuring fixture roots; CLI entry points call
// `setFixtureRuntimeRoots` before consulting `SETTINGS`.
let cachedSettings: Settings | null = null
export function SETTINGS(): Settings {
  if (cachedSettings === null) {
    cachedSettings = {
      ...HARDCODED_SETTINGS,
      ...parseSettingsFile(FIXTURE_SETTINGS_FILE()),
    }
  }
  return cachedSettings
}

export const SETTINGS_COMMENT_COL = 28

type SettingItem =
  | {
      kind: "row"
      key: keyof Settings
      value: (s: Settings) => string
      comment: string
      cont?: string[]
    }
  | { kind: "header"; text: string }

const SETTING_ITEMS: SettingItem[] = [
  {
    kind: "row",
    key: "mp",
    value: (s) => `"${s.mp}"`,
    comment: "project and planner model CODE",
  },
  {
    kind: "row",
    key: "mc",
    value: (s) => `"${s.mc}"`,
    comment: "coder model CODE",
  },
  {
    kind: "row",
    key: "me",
    value: (s) => `"${s.me}"`,
    comment: "evaluator model CODE",
  },
  { kind: "header", text: "fixture project" },
  {
    kind: "row",
    key: "complexity",
    value: (s) => String(s.complexity),
    comment: `integer ${MIN_COMPLEXITY}-${MAX_COMPLEXITY}, project tier`,
  },
  { kind: "header", text: "fixture plan" },
  {
    kind: "row",
    key: "aiCoders",
    value: (s) => String(s.aiCoders),
    comment: "AI-coders mode vs student framing",
  },
  {
    kind: "row",
    key: "coderInteraction",
    value: (s) => String(s.coderInteraction),
    comment: `integer ${MIN_CODER_INTERACTION}-${MAX_CODER_INTERACTION}, cross-module author mixing`,
  },
  {
    kind: "row",
    key: "style",
    value: (s) => `"${s.style}"`,
    comment: `one of: ${STYLES.slice(0, 3).join(" | ")} |`,
    cont: [
      `        ${STYLES.slice(3, 6).join(" | ")} |`,
      `        ${STYLES.slice(6, 8).join(" | ")} |`,
      `        ${STYLES.slice(8).join(" | ")}`,
    ],
  },
  {
    kind: "row",
    key: "students",
    value: (s) => String(s.students),
    comment: `integer ${MIN_STUDENTS}-${MAX_STUDENTS}, team size`,
  },
  {
    kind: "row",
    key: "rounds",
    value: (s) => String(s.rounds),
    comment: "integer ≥1, build-commit count",
  },
  {
    kind: "row",
    key: "reviews",
    value: (s) => String(s.reviews),
    comment: `integer ${MIN_REVIEWS}..rounds, review-commit count`,
  },
  { kind: "header", text: "fixture repo" },
  {
    kind: "row",
    key: "comments",
    value: (s) => String(s.comments),
    comment: `integer ${MIN_COMMENTS}-${MAX_COMMENTS}, ${COMMENTS_FREE_TIER}=leave to coder`,
  },
]

function row(prefix: string, comment: string): string {
  const pad = Math.max(1, SETTINGS_COMMENT_COL - prefix.length)
  return `${prefix}${" ".repeat(pad)}// ${comment}`
}

function continuation(comment: string): string {
  return `${" ".repeat(SETTINGS_COMMENT_COL)}// ${comment}`
}

export function settingsRowsForHelp(s: Settings): string[] {
  const lastRowIdx = SETTING_ITEMS.reduce(
    (acc, item, i) => (item.kind === "row" ? i : acc),
    -1,
  )
  const lines: string[] = []
  for (let i = 0; i < SETTING_ITEMS.length; i++) {
    const item = SETTING_ITEMS[i]
    if (item.kind === "header") {
      lines.push("")
      lines.push(`    // ${item.text}`)
      continue
    }
    const isLast = i === lastRowIdx
    const prefix = `    "${item.key}": ${item.value(s)}${isLast ? "" : ","}`
    lines.push(row(prefix, item.comment))
    if (item.cont) for (const c of item.cont) lines.push(continuation(c))
  }
  return lines
}

export const SETTINGS_PREAMBLE = [
  "Holds the resolved values from the most recent run; supplies CLI",
  "defaults for the next run (CLI flags override file values). A frozen",
  "copy is also written into each plan folder. All keys optional;",
  "unknown keys or out-of-range values fail fast.",
]

export function settingsToJsonc(s: Settings): string {
  const lines = SETTINGS_PREAMBLE.map((l) => `// ${l}`)
  lines.push("", "{", ...settingsRowsForHelp(s), "}", "")
  return lines.join("\n")
}

export function writeSettings(dir: string, settings: Settings): void {
  writeFileSync(resolve(dir, SETTINGS_BASENAME), settingsToJsonc(settings))
}

export const SWEEP_PREAMBLE = [
  "Sweep file — overrides .fixture-settings.jsonc for `fixture sweep`.",
  "Exactly one key must hold an array (the swept axis). Every other",
  "key must be a scalar (or absent, in which case it falls back to",
  ".fixture-settings.jsonc).",
  "",
  "Plan-phase keys (mp, complexity, aiCoders, coderInteraction, style,",
  "students, rounds, reviews): --from=<project>; iterates plan+repo",
  "per value (N plan dirs, one repo each).",
  "Repo-phase keys (mc, comments): --from=<project>",
  "plans once and iterates repos, or --from=<plan> reuses an existing",
  "plan and skips planning.",
  "Evaluate-phase keys (me) cannot be swept.",
]

const DEFAULT_SWEEP_BODY = [
  "{",
  `    "style": ["incremental", "vertical-slice"]`,
  "}",
  "",
]

export function writeSweep(dir: string): void {
  const lines = SWEEP_PREAMBLE.map((l) => (l.length === 0 ? "//" : `// ${l}`))
  lines.push("", ...DEFAULT_SWEEP_BODY)
  writeFileSync(resolve(dir, SWEEP_BASENAME), lines.join("\n"))
}

export function readSettings(dir: string): Settings {
  return {
    ...HARDCODED_SETTINGS,
    ...parseSettingsFile(resolve(dir, SETTINGS_BASENAME)),
  }
}
