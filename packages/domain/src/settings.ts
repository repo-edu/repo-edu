import { z } from "zod"
import type { GitProviderKind } from "./types.js"
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

// ---------------------------------------------------------------------------
// App-settings Zod schemas (single source of truth for persistence types)
// ---------------------------------------------------------------------------

const persistedLmsConnectionSchema = z.object({
  name: z.string(),
  provider: z.enum(["canvas", "moodle"]),
  baseUrl: z.string(),
  token: z.string(),
  userAgent: z.string().optional(),
})

const persistedGitConnectionSchema = z.object({
  id: z.string(),
  provider: z.enum(gitProviderKinds),
  baseUrl: z.string(),
  token: z.string(),
})

const appAppearanceSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  windowChrome: z.enum(["system", "hiddenInset"]),
  dateFormat: z.enum(["MDY", "DMY"]),
  timeFormat: z.enum(["12h", "24h"]),
})

const persistedWindowStateSchema = z.object({
  width: z.number(),
  height: z.number(),
})

const persistedAnalysisConfigSchema = z.object({
  since: z.string().optional(),
  until: z.string().optional(),
  subfolder: z.string().optional(),
  extensions: z.array(z.string()).optional(),
  includeFiles: z.array(z.string()).optional(),
  excludeFiles: z.array(z.string()).optional(),
  excludeAuthors: z.array(z.string()).optional(),
  excludeEmails: z.array(z.string()).optional(),
  excludeRevisions: z.array(z.string()).optional(),
  excludeMessages: z.array(z.string()).optional(),
  nFiles: z.number().int().min(0).optional(),
  whitespace: z.boolean().optional(),
  blameSkip: z.boolean().optional(),
})

const persistedBlameConfigSchema = z.object({
  copyMove: z.number().int().min(0).max(4).optional(),
  includeEmptyLines: z.boolean().optional(),
  includeComments: z.boolean().optional(),
  blameExclusions: z.enum(["hide", "show", "remove"]).optional(),
})

const persistedAnalysisSidebarSettingsSchema = z.object({
  searchFolder: z.string().nullable(),
  searchDepth: z.number().int().min(1).max(9),
  sectionState: z.record(z.string(), z.boolean()),
  fileViewMode: z.enum(["list", "tree"]),
  config: persistedAnalysisConfigSchema,
  blameConfig: persistedBlameConfigSchema,
})

export const persistedAppSettingsSchema = z.object({
  kind: z.literal(persistedAppSettingsKind),
  schemaVersion: z.literal(1),
  activeCourseId: z.string().nullable(),
  activeTab: z
    .enum(["roster", "groups-assignments", "analysis"])
    .default("roster"),
  appearance: appAppearanceSchema,
  window: persistedWindowStateSchema.default({ width: 1180, height: 760 }),
  lmsConnections: z.array(persistedLmsConnectionSchema),
  gitConnections: z.array(persistedGitConnectionSchema),
  lastOpenedAt: z.string().nullable(),
  rosterColumnVisibility: z.record(z.string(), z.boolean()).default({}),
  rosterColumnSizing: z.record(z.string(), z.number()).default({}),
  groupsSidebarSize: z.number().nullable().default(null),
  analysisSidebarSize: z.number().nullable().default(null),
  analysisSidebar: persistedAnalysisSidebarSettingsSchema
    .nullable()
    .default(null),
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
// Default settings
// ---------------------------------------------------------------------------

export const defaultAppSettings: PersistedAppSettings = {
  kind: persistedAppSettingsKind,
  schemaVersion: 1,
  activeCourseId: null,
  activeTab: "roster",
  appearance: {
    theme: "system",
    windowChrome: "system",
    dateFormat: "DMY",
    timeFormat: "24h",
  },
  window: {
    width: 1180,
    height: 760,
  },
  lmsConnections: [],
  gitConnections: [],
  lastOpenedAt: null,
  rosterColumnVisibility: {},
  rosterColumnSizing: {},
  groupsSidebarSize: null,
  analysisSidebarSize: null,
  analysisSidebar: null,
}
