import { z } from "zod"
import type { AnalysisBlameConfig } from "./analysis/config-types.js"
import { DEFAULT_EXTENSIONS, extensionsSchema } from "./analysis/schemas.js"
import type { CourseAnalysisInputs, GitProviderKind } from "./types.js"
import { gitProviderKinds, persistedAppSettingsKind } from "./types.js"

export const gitProviderDefaultBaseUrls: Record<GitProviderKind, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
  gitea: "",
}

const gitProviderDisplayLabels: Record<GitProviderKind, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
}

export function gitConnectionDisplayLabel(
  connection: Pick<PersistedGitConnection, "provider" | "baseUrl">,
): string {
  const label = gitProviderDisplayLabels[connection.provider]
  const defaultUrl = gitProviderDefaultBaseUrls[connection.provider]
  if (connection.baseUrl === defaultUrl || connection.baseUrl === "") {
    return label
  }
  const shortUrl = connection.baseUrl.replace(/^https?:\/\//, "")
  return `${label} · ${shortUrl}`
}

/**
 * Provider-specific terminology for the repository-namespace concept. GitHub
 * and Gitea call this an "Organization"; GitLab calls it a "Group".
 */
export function gitNamespaceTerminology(
  provider: GitProviderKind | null | undefined,
): { readonly label: string; readonly sampleSlug: string } {
  if (provider === "gitlab") {
    return { label: "GitLab Group", sampleSlug: "course-group" }
  }
  return { label: "Organization", sampleSlug: "course-org" }
}

/**
 * Accepts either a bare namespace path (e.g. `course-org`, `parent/sub`) or a
 * provider URL (e.g. `https://github.com/course-org`) and returns the path the
 * API expects. Leading/trailing slashes are stripped.
 */
export function normalizeGitNamespaceInput(input: string): string {
  const trimmed = input.trim()
  const withoutScheme = trimmed.replace(/^https?:\/\/[^/]+\/?/, "")
  return withoutScheme.replace(/^\/+/, "").replace(/\/+$/, "")
}

// ---------------------------------------------------------------------------
// App-settings Zod schemas (single source of truth for persistence types)
// ---------------------------------------------------------------------------

const persistedConnectionFields = {
  baseUrl: z.string(),
  token: z.string(),
  userAgent: z.string().optional(),
} as const

const persistedLmsConnectionSchema = z.object({
  name: z.string(),
  provider: z.enum(["canvas", "moodle"]),
  ...persistedConnectionFields,
})

const persistedGitConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(gitProviderKinds),
  ...persistedConnectionFields,
})

export const syntaxThemeIds = [
  "plus",
  "github",
  "github-dimmed",
  "everforest",
  "nord",
  "min",
] as const
export type SyntaxThemeId = (typeof syntaxThemeIds)[number]

const appAppearanceSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  windowChrome: z.enum(["system", "hiddenInset"]),
  dateFormat: z.enum(["MDY", "DMY"]),
  timeFormat: z.enum(["12h", "24h"]),
  syntaxTheme: z.enum(syntaxThemeIds).default("plus"),
})

const persistedWindowStateSchema = z.object({
  width: z.number(),
  height: z.number(),
})

const persistedBlameConfigSchema = z.object({
  copyMove: z.number().int().min(0).max(4).optional(),
})

const persistedAnalysisSidebarSettingsSchema = z.object({
  searchDepth: z.number().int().min(1).max(9),
  sectionState: z.record(z.string(), z.boolean()),
  fileViewMode: z.enum(["list", "tree"]).default("list"),
  fileSortMode: z
    .enum(["lines-desc", "lines-asc", "alpha"])
    .default("lines-desc"),
  blameConfig: persistedBlameConfigSchema,
})

export const persistedAppSettingsSchema = z.object({
  kind: z.literal(persistedAppSettingsKind),
  activeCourseId: z.string().nullable(),
  activeTab: z
    .enum(["roster", "groups-assignments", "analysis", "examination"])
    .default("roster"),
  appearance: appAppearanceSchema,
  window: persistedWindowStateSchema.default({ width: 1180, height: 760 }),
  lmsConnections: z.array(persistedLmsConnectionSchema),
  gitConnections: z.array(persistedGitConnectionSchema),
  activeGitConnectionId: z.string().nullable().default(null),
  lastOpenedAt: z.string().nullable(),
  rosterColumnVisibility: z.record(z.string(), z.boolean()).default({}),
  rosterColumnSizing: z.record(z.string(), z.number()).default({}),
  groupsSidebarSize: z.number().nullable().default(null),
  analysisSidebarSize: z.number().nullable().default(null),
  analysisDetailListSize: z.number().nullable().default(null),
  analysisSidebar: persistedAnalysisSidebarSettingsSchema
    .nullable()
    .default(null),
  defaultExtensions: extensionsSchema().default([...DEFAULT_EXTENSIONS]),
})

// ---------------------------------------------------------------------------
// Inferred persistence types
// ---------------------------------------------------------------------------

export type PersistedLmsConnection = z.infer<
  typeof persistedLmsConnectionSchema
>
export type PersistedGitConnection = z.infer<
  typeof persistedGitConnectionSchema
>
export type AppAppearance = z.infer<typeof appAppearanceSchema>
export type PersistedWindowState = z.infer<typeof persistedWindowStateSchema>
export type PersistedAnalysisSidebarSettings = z.infer<
  typeof persistedAnalysisSidebarSettingsSchema
>
export type PersistedAppSettings = z.infer<typeof persistedAppSettingsSchema>

// ---------------------------------------------------------------------------
// Active-Git-connection resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the Git connection used for repo operations. Git credentials are a
 * profile-level resource (one teacher → one provider, usually): when exactly
 * one connection is configured it is used transparently; when multiple are
 * configured the user picks an `activeGitConnectionId`. Returns `null` when no
 * connection is configured or the saved active id is stale.
 */
export function resolveActiveGitConnection(
  settings: Pick<
    PersistedAppSettings,
    "gitConnections" | "activeGitConnectionId"
  >,
): PersistedGitConnection | null {
  const { gitConnections, activeGitConnectionId } = settings
  if (gitConnections.length === 0) {
    return null
  }
  if (activeGitConnectionId !== null) {
    const match = gitConnections.find(
      (connection) => connection.id === activeGitConnectionId,
    )
    if (match !== undefined) {
      return match
    }
  }
  return gitConnections[0] ?? null
}

// Drift guards: persisted blame schema must stay a subset of its runtime
// counterpart. A compile error here means a field was added to the persisted
// schema without a matching field in AnalysisBlameConfig. Additionally, course
// analysis-input keys and sidebar UI-state keys must be disjoint so any new
// field lands in exactly one bucket.
type AssertSubset<_T extends Partial<_U>, _U> = true
type AssertDisjoint<A, B> = [A & B] extends [never] ? true : false
type _BlameDriftGuard = AssertSubset<
  z.infer<typeof persistedBlameConfigSchema>,
  AnalysisBlameConfig
>
const _scopeDisjointGuard: AssertDisjoint<
  keyof CourseAnalysisInputs,
  keyof PersistedAnalysisSidebarSettings
> = true
void _scopeDisjointGuard

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

export const defaultAppSettings: PersistedAppSettings = {
  kind: persistedAppSettingsKind,
  activeCourseId: null,
  activeTab: "roster",
  appearance: {
    theme: "system",
    windowChrome: "system",
    dateFormat: "DMY",
    timeFormat: "24h",
    syntaxTheme: "plus",
  },
  window: {
    width: 1180,
    height: 760,
  },
  lmsConnections: [],
  gitConnections: [],
  activeGitConnectionId: null,
  lastOpenedAt: null,
  rosterColumnVisibility: {},
  rosterColumnSizing: {},
  groupsSidebarSize: null,
  analysisSidebarSize: null,
  analysisDetailListSize: null,
  analysisSidebar: null,
  defaultExtensions: [...DEFAULT_EXTENSIONS],
}
