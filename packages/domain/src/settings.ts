import { z } from "zod"
import {
  activeTabSchema,
  normalizeAnalysisFolderPath,
  normalizeSubmissionFolderRecent,
  persistedActiveSurfaceSchema,
  type SubmissionFolderRecent,
  submissionFolderRecentSchema,
  submissionRecentKey,
} from "./active-surface.js"
import type { AnalysisBlameConfig } from "./analysis/config-types.js"
import { DEFAULT_EXTENSIONS, extensionsSchema } from "./analysis/schemas.js"
import { type AnalysisInputs, analysisInputsSchema } from "./analysis-inputs.js"
import {
  type LlmProviderKind,
  persistedGitConnectionSchema,
  persistedLlmConnectionSchema,
  persistedLmsConnectionSchema,
} from "./connection.js"
import type { CourseBacking } from "./types.js"

export const persistedAppSettingsKind = "repo-edu.app-settings.v2" as const
export const persistedAppCredentialsKind =
  "repo-edu.app-credentials.v1" as const
export const persistedAppPreferencesKind =
  "repo-edu.app-preferences.v1" as const

export const examinationModelsByProviderSchema = z
  .object({
    claude: z.string().optional(),
    codex: z.string().optional(),
  })
  .strict() satisfies z.ZodType<Partial<Record<LlmProviderKind, string>>>

export const syntaxThemeIds = [
  "plus",
  "github",
  "github-dimmed",
  "everforest",
  "nord",
  "min",
] as const
export type SyntaxThemeId = (typeof syntaxThemeIds)[number]

export const appAppearanceSchema = z
  .object({
    theme: z.enum(["system", "light", "dark"]),
    windowChrome: z.enum(["system", "hiddenInset"]),
    dateFormat: z.enum(["MDY", "DMY"]),
    timeFormat: z.enum(["12h", "24h"]),
    syntaxTheme: z.enum(syntaxThemeIds).default("plus"),
  })
  .strict()

export const persistedBlameConfigSchema = z
  .object({
    copyMove: z.number().int().min(0).max(4).optional(),
  })
  .strict()

export const persistedAnalysisSidebarSettingsSchema = z
  .object({
    searchDepth: z.number().int().min(1).max(9),
    sectionState: z.record(z.string(), z.boolean()),
    repoViewMode: z.enum(["list", "tree"]).default("tree"),
    fileViewMode: z.enum(["list", "tree"]).default("list"),
    fileSortMode: z
      .enum(["lines-desc", "lines-asc", "alpha"])
      .default("lines-desc"),
    blameConfig: persistedBlameConfigSchema,
  })
  .strict()

export const persistedAnalysisConcurrencySchema = z
  .object({
    repoParallelism: z.number().int().min(1).max(8).default(3),
    filesPerRepo: z.number().int().min(1).max(16).default(4),
  })
  .strict()
  .default({ repoParallelism: 3, filesPerRepo: 4 })

/** One policy for both recent folder lists: keep at most this many entries. */
const RECENT_FOLDER_LIMIT = 8

export function normalizeRecentAnalysisFolders(
  paths: readonly string[],
): string[] {
  const recent: string[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    const normalized = normalizeAnalysisFolderPath(path)
    if (normalized === null || seen.has(normalized)) {
      continue
    }
    recent.push(normalized)
    seen.add(normalized)
    if (recent.length >= RECENT_FOLDER_LIMIT) {
      break
    }
  }
  return recent
}

export const submissionSurfaceStateSchema = z
  .object({
    includedFiles: z.array(z.string()).nullable(),
  })
  .strict()

export function normalizeRecentSubmissionFolders(
  recents: readonly SubmissionFolderRecent[],
): SubmissionFolderRecent[] {
  const recent: SubmissionFolderRecent[] = []
  const seen = new Set<string>()
  for (const candidate of recents) {
    const normalized = normalizeSubmissionFolderRecent(candidate)
    if (normalized === null) continue
    const key = submissionRecentKey(normalized)
    if (key === null || seen.has(key)) continue
    recent.push(normalized)
    seen.add(key)
    if (recent.length >= RECENT_FOLDER_LIMIT) break
  }
  return recent
}

function pruneSubmissionSurfaceStates(
  states: Record<string, SubmissionSurfaceState>,
  recents: readonly SubmissionFolderRecent[],
): Record<string, SubmissionSurfaceState> {
  const recentKeys = new Set(
    recents
      .map((recent) => submissionRecentKey(recent))
      .filter((key): key is string => key !== null),
  )
  const next: Record<string, SubmissionSurfaceState> = {}
  for (const [key, state] of Object.entries(states)) {
    if (recentKeys.has(key)) {
      next[key] = state
    }
  }
  return next
}

const persistedAppCredentialsFields = {
  lmsConnections: z.array(persistedLmsConnectionSchema),
  gitConnections: z.array(persistedGitConnectionSchema),
  activeGitConnectionId: z.string().nullable().default(null),
  llmConnections: z.array(persistedLlmConnectionSchema),
  activeLlmConnectionId: z.string().nullable().default(null),
} as const

const persistedAppPreferencesFields = {
  activeSurface: persistedActiveSurfaceSchema.default({ kind: "home" }),
  activeTab: activeTabSchema.default("roster"),
  lastUsedCourseBacking: z
    .enum(["lms", "repobee"])
    .optional() satisfies z.ZodType<CourseBacking | undefined>,
  recentAnalysisFolders: z
    .array(z.string())
    .default([])
    .transform((paths) => normalizeRecentAnalysisFolders(paths)),
  recentSubmissionFolders: z
    .array(submissionFolderRecentSchema)
    .default([])
    .transform((recents) => normalizeRecentSubmissionFolders(recents)),
  submissionSurfaceStates: z
    .record(z.string(), submissionSurfaceStateSchema)
    .default({}),
  folderViewAnalysisInputs: analysisInputsSchema.default({}),
  appearance: appAppearanceSchema,
  examinationModelsByProvider: examinationModelsByProviderSchema,
  lastOpenedAt: z.string().nullable(),
  rosterColumnVisibility: z.record(z.string(), z.boolean()).default({}),
  rosterColumnSizing: z.record(z.string(), z.number()).default({}),
  groupsSidebarSize: z.number().nullable().default(null),
  analysisSidebarSize: z.number().nullable().default(null),
  analysisDetailListSize: z.number().nullable().default(null),
  examinationSubmissionSidebarSize: z.number().nullable().default(null),
  analysisSidebar: persistedAnalysisSidebarSettingsSchema
    .nullable()
    .default(null),
  defaultExtensions: extensionsSchema().default([...DEFAULT_EXTENSIONS]),
  analysisConcurrency: persistedAnalysisConcurrencySchema,
} as const

function prunePersistedPreferences<
  T extends {
    recentSubmissionFolders: SubmissionFolderRecent[]
    submissionSurfaceStates: Record<string, SubmissionSurfaceState>
  },
>(preferences: T): T {
  return {
    ...preferences,
    submissionSurfaceStates: pruneSubmissionSurfaceStates(
      preferences.submissionSurfaceStates,
      preferences.recentSubmissionFolders,
    ),
  }
}

export const persistedAppCredentialsSchema = z
  .object({
    kind: z.literal(persistedAppCredentialsKind),
    ...persistedAppCredentialsFields,
  })
  .strict()

export const persistedAppPreferencesSchema = z
  .object({
    kind: z.literal(persistedAppPreferencesKind),
    ...persistedAppPreferencesFields,
  })
  .strict()
  .transform((preferences) => prunePersistedPreferences(preferences))

export const persistedAppSettingsSchema = z
  .object({
    kind: z.literal(persistedAppSettingsKind),
    ...persistedAppPreferencesFields,
    ...persistedAppCredentialsFields,
  })
  .strict()
  .transform((settings) => prunePersistedPreferences(settings))

export type ExaminationModelsByProvider = z.infer<
  typeof examinationModelsByProviderSchema
>
export type AppAppearance = z.infer<typeof appAppearanceSchema>
export type ThemePreference = AppAppearance["theme"]
export type WindowChromeMode = AppAppearance["windowChrome"]
export type DateFormatPreference = AppAppearance["dateFormat"]
export type TimeFormatPreference = AppAppearance["timeFormat"]
export type PersistedAnalysisSidebarSettings = z.infer<
  typeof persistedAnalysisSidebarSettingsSchema
>
export type PersistedAnalysisConcurrency = z.infer<
  typeof persistedAnalysisConcurrencySchema
>
export type SubmissionSurfaceState = z.infer<
  typeof submissionSurfaceStateSchema
>
export type PersistedAppCredentials = z.infer<
  typeof persistedAppCredentialsSchema
>
export type PersistedAppPreferences = z.infer<
  typeof persistedAppPreferencesSchema
>
export type PersistedAppSettings = z.infer<typeof persistedAppSettingsSchema>
export type AppSettingsSections = {
  credentials: PersistedAppCredentials
  preferences: PersistedAppPreferences
}

export function pruneSubmissionStateForRecents(
  settings: Pick<
    PersistedAppPreferences,
    "recentSubmissionFolders" | "submissionSurfaceStates"
  >,
): Pick<
  PersistedAppPreferences,
  "recentSubmissionFolders" | "submissionSurfaceStates"
> {
  const recentSubmissionFolders = normalizeRecentSubmissionFolders(
    settings.recentSubmissionFolders,
  )
  return {
    recentSubmissionFolders,
    submissionSurfaceStates: pruneSubmissionSurfaceStates(
      settings.submissionSurfaceStates,
      recentSubmissionFolders,
    ),
  }
}

type AssertEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type AssertSubset<_T extends Partial<_U>, _U> = true
type AssertDisjoint<A, B> = [A & B] extends [never] ? true : false

type _BlameDriftGuard = AssertSubset<
  z.infer<typeof persistedBlameConfigSchema>,
  AnalysisBlameConfig
>
const _scopeDisjointGuard: AssertDisjoint<
  keyof AnalysisInputs,
  keyof PersistedAnalysisSidebarSettings
> = true
const _sectionDisjointGuard: AssertDisjoint<
  keyof typeof persistedAppCredentialsFields,
  keyof typeof persistedAppPreferencesFields
> = true
// The satisfies clause on the schema cannot catch provider-set growth: a
// Partial record accepts a schema that misses a newly added provider key.
const _examinationProviderGuard: AssertEqual<
  keyof ExaminationModelsByProvider,
  LlmProviderKind
> = true
const _settingsFieldGuard: AssertEqual<
  keyof PersistedAppSettings,
  | "kind"
  | keyof typeof persistedAppCredentialsFields
  | keyof typeof persistedAppPreferencesFields
> = true
void _scopeDisjointGuard
void _sectionDisjointGuard
void _examinationProviderGuard
void _settingsFieldGuard

export const defaultAppCredentials: PersistedAppCredentials = {
  kind: persistedAppCredentialsKind,
  lmsConnections: [],
  gitConnections: [],
  activeGitConnectionId: null,
  llmConnections: [],
  activeLlmConnectionId: null,
}

export const defaultAppPreferences: PersistedAppPreferences = {
  kind: persistedAppPreferencesKind,
  activeSurface: { kind: "home" },
  activeTab: "roster",
  recentAnalysisFolders: [],
  recentSubmissionFolders: [],
  submissionSurfaceStates: {},
  folderViewAnalysisInputs: {},
  appearance: {
    theme: "system",
    windowChrome: "system",
    dateFormat: "DMY",
    timeFormat: "24h",
    syntaxTheme: "plus",
  },
  examinationModelsByProvider: {},
  lastOpenedAt: null,
  rosterColumnVisibility: {},
  rosterColumnSizing: {},
  groupsSidebarSize: null,
  analysisSidebarSize: null,
  analysisDetailListSize: null,
  examinationSubmissionSidebarSize: null,
  analysisSidebar: null,
  defaultExtensions: [...DEFAULT_EXTENSIONS],
  analysisConcurrency: {
    repoParallelism: 3,
    filesPerRepo: 4,
  },
}

export function composeAppSettings(
  credentials: PersistedAppCredentials,
  preferences: PersistedAppPreferences,
): PersistedAppSettings {
  const { kind: _credentialsKind, ...credentialFields } = credentials
  const { kind: _preferencesKind, ...preferenceFields } = preferences
  void _credentialsKind
  void _preferencesKind
  return {
    kind: persistedAppSettingsKind,
    ...preferenceFields,
    ...credentialFields,
  }
}

export function splitAppSettings(
  settings: PersistedAppSettings,
): AppSettingsSections {
  const {
    lmsConnections,
    gitConnections,
    activeGitConnectionId,
    llmConnections,
    activeLlmConnectionId,
    kind: _kind,
    ...preferences
  } = settings
  return {
    credentials: {
      kind: persistedAppCredentialsKind,
      lmsConnections,
      gitConnections,
      activeGitConnectionId,
      llmConnections,
      activeLlmConnectionId,
    },
    preferences: {
      kind: persistedAppPreferencesKind,
      ...preferences,
    },
  }
}

export const defaultAppSettings: PersistedAppSettings = composeAppSettings(
  defaultAppCredentials,
  defaultAppPreferences,
)
