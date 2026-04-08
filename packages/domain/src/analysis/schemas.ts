import { z } from "zod"
import type { AnalysisBlameConfig, AnalysisConfig } from "./types.js"
import type { ValidationResult } from "../types.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_EXTENSIONS = [
  "c",
  "cc",
  "cif",
  "cpp",
  "glsl",
  "h",
  "hh",
  "hpp",
  "java",
  "js",
  "py",
  "rb",
  "sql",
  "ts",
] as const

export const DEFAULT_N_FILES = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const strictDateRegex = /^\d{4}-\d{2}-\d{2}$/

function isValidCalendarDate(value: string): boolean {
  if (!strictDateRegex.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

const yyyymmddSchema = z
  .string()
  .check(
    z.refine((v) => isValidCalendarDate(v), "Must be a valid YYYY-MM-DD date"),
  )

function patternArraySchema() {
  return z
    .array(
      z
        .string()
        .transform((p) => p.trim())
        .check(
          z.refine((p) => p.length > 0, "Pattern entry must not be empty"),
        ),
    )
    .transform((patterns) => [...new Set(patterns)])
}

function extensionsSchema() {
  return z.array(z.string()).transform((exts) => {
    const normalized = exts
      .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
      .filter((e) => e.length > 0)
    return [...new Set(normalized)]
  })
}

function subfolderSchema() {
  return z
    .string()
    .check(
      z.refine((v) => {
        const trimmed = v.trim()
        if (trimmed.length === 0) return true
        if (trimmed.startsWith("/")) return false
        if (trimmed.includes("..")) return false
        return true
      }, "Subfolder must be a relative POSIX path without '..' segments"),
    )
    .transform((v) => {
      const trimmed = v.trim().replace(/\\/g, "/")
      return trimmed.replace(/\/+$/, "")
    })
}

// ---------------------------------------------------------------------------
// AnalysisConfig schema
// ---------------------------------------------------------------------------

export const analysisConfigSchema = z
  .object({
    since: yyyymmddSchema.optional(),
    until: yyyymmddSchema.optional(),
    subfolder: subfolderSchema().optional(),
    extensions: extensionsSchema().optional(),
    includeFiles: patternArraySchema()
      .optional()
      .transform((v) => v ?? ["*"]),
    excludeFiles: patternArraySchema().optional(),
    excludeAuthors: patternArraySchema().optional(),
    excludeEmails: patternArraySchema().optional(),
    excludeRevisions: patternArraySchema().optional(),
    excludeMessages: patternArraySchema().optional(),
    nFiles: z.number().int().min(0).optional().default(DEFAULT_N_FILES),
    whitespace: z.boolean().optional().default(false),
    maxConcurrency: z.number().int().min(1).max(16).optional().default(1),
    blameSkip: z.boolean().optional().default(false),
  })
  .check(
    z.refine((data) => {
      if (data.since !== undefined && data.until !== undefined) {
        return data.since <= data.until
      }
      return true
    }, "since must be <= until"),
  )

// ---------------------------------------------------------------------------
// AnalysisBlameConfig schema
// ---------------------------------------------------------------------------

const FORBIDDEN_BLAME_KEYS = [
  "since",
  "until",
  "excludeRevisions",
  "excludeMessages",
] as const

const analysisBlameConfigInnerSchema = z.object({
  subfolder: subfolderSchema().optional(),
  extensions: extensionsSchema().optional(),
  includeFiles: patternArraySchema()
    .optional()
    .transform((v) => v ?? ["*"]),
  excludeFiles: patternArraySchema().optional(),
  excludeAuthors: patternArraySchema().optional(),
  excludeEmails: patternArraySchema().optional(),
  whitespace: z.boolean().optional().default(false),
  maxConcurrency: z.number().int().min(1).max(16).optional().default(1),
  copyMove: z.number().int().min(0).max(4).optional().default(1),
  includeEmptyLines: z.boolean().optional().default(false),
  includeComments: z.boolean().optional().default(false),
  blameExclusions: z
    .enum(["hide", "show", "remove"])
    .optional()
    .default("hide"),
  ignoreRevsFile: z.boolean().optional().default(true),
})

export const analysisBlameConfigSchema = z.pipe(
  z.record(z.string(), z.unknown()).check(
    z.refine((raw) => {
      return FORBIDDEN_BLAME_KEYS.every((key) => !(key in raw))
    }, "AnalysisBlameConfig must not contain date-range or log-only keys (since, until, excludeRevisions, excludeMessages)"),
  ),
  analysisBlameConfigInnerSchema,
)

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateAnalysisConfig(
  input: unknown,
): ValidationResult<AnalysisConfig> {
  const result = analysisConfigSchema.safeParse(input)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  }
}

export function validateAnalysisBlameConfig(
  input: unknown,
): ValidationResult<AnalysisBlameConfig> {
  const result = analysisBlameConfigSchema.safeParse(input)
  if (result.success) {
    return { ok: true, value: result.data }
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  }
}
