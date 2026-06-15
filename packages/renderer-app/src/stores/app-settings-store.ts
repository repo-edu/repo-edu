import {
  defaultAppPreferences,
  type ExaminationModelsByProvider,
  type LlmProviderKind,
  normalizeAnalysisFolderPath,
  normalizeRecentAnalysisFolders,
  normalizeRecentSubmissionFolders,
  normalizeSubmissionFolderPath,
  type PersistedAnalysisConcurrency,
  type PersistedAnalysisSidebarSettings,
  type PersistedAppPreferences,
  pruneSubmissionStateForRecents,
  type SubmissionFolderRecent,
  type SubmissionSurfaceState,
  type SyntaxThemeId,
  submissionSurfaceStateKey,
} from "@repo-edu/domain/settings"
import type {
  AnalysisInputs,
  CourseBacking,
  CourseSummary,
  DateFormatPreference,
  ThemePreference,
  TimeFormatPreference,
} from "@repo-edu/domain/types"
import { create } from "zustand"

type AppSettingsState = {
  settings: PersistedAppPreferences
}

type AppSettingsActions = {
  hydrate: (settings: PersistedAppPreferences) => void

  setLastUsedCourseBacking: (backing: CourseBacking) => void
  setFolderViewAnalysisInputs: (patch: Partial<AnalysisInputs>) => void
  pushRecentFolder: (path: string) => void
  removeRecentFolder: (path: string) => void
  clearRecentFolders: () => void
  pushRecentSubmissionFolder: (recent: SubmissionFolderRecent) => void
  removeRecentSubmissionFolder: (recent: SubmissionFolderRecent) => void
  setSubmissionSurfaceState: (
    recent: SubmissionFolderRecent,
    state: SubmissionSurfaceState,
  ) => void
  clearSubmissionSurfaceState: (recent: SubmissionFolderRecent) => void
  pruneSubmissionFoldersForCourses: (
    courses: readonly Pick<CourseSummary, "id" | "backing">[],
  ) => boolean
  setTheme: (theme: ThemePreference) => void
  setDateFormat: (dateFormat: DateFormatPreference) => void
  setTimeFormat: (timeFormat: TimeFormatPreference) => void
  setSyntaxTheme: (syntaxTheme: SyntaxThemeId) => void
  setDefaultExtensions: (extensions: string[]) => void

  setExaminationModelForProvider: (
    provider: LlmProviderKind,
    code: string,
  ) => void

  setRosterColumnVisibility: (visibility: Record<string, boolean>) => void
  setRosterColumnSizing: (sizing: Record<string, number>) => void
  setGroupsSidebarSize: (size: number) => void
  setAnalysisSidebarSize: (size: number) => void
  setAnalysisDetailListSize: (size: number) => void
  setExaminationSubmissionSidebarSize: (size: number) => void
  setAnalysisSidebar: (sidebar: PersistedAnalysisSidebarSettings | null) => void

  setAnalysisConcurrency: (concurrency: PersistedAnalysisConcurrency) => void

  reset: () => void
}

const initialState: AppSettingsState = {
  settings: defaultAppPreferences,
}

function submissionRecentsEqual(
  left: readonly SubmissionFolderRecent[],
  right: readonly SubmissionFolderRecent[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (recent, index) =>
        recent.path === right[index]?.path &&
        recent.courseId === right[index]?.courseId,
    )
  )
}

function submissionSurfaceStatesEqual(
  left: Record<string, SubmissionSurfaceState>,
  right: Record<string, SubmissionSurfaceState>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => {
    const leftState = left[key]
    const rightState = right[key]
    if (leftState === undefined || rightState === undefined) return false
    return includedFilesEqual(leftState.includedFiles, rightState.includedFiles)
  })
}

function includedFilesEqual(
  left: SubmissionSurfaceState["includedFiles"],
  right: SubmissionSurfaceState["includedFiles"],
): boolean {
  if (left === null || right === null) return left === right
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export const useAppSettingsStore = create<
  AppSettingsState & AppSettingsActions
>((set) => {
  return {
    ...initialState,

    hydrate: (settings) =>
      set({
        settings,
      }),

    setLastUsedCourseBacking: (backing) =>
      set((state) => ({
        settings: {
          ...state.settings,
          lastUsedCourseBacking: backing,
        },
      })),

    setFolderViewAnalysisInputs: (patch) =>
      set((state) => {
        const next = { ...state.settings.folderViewAnalysisInputs }
        for (const [key, value] of Object.entries(patch) as [
          keyof AnalysisInputs,
          unknown,
        ][]) {
          if (value === undefined) {
            delete next[key]
          } else {
            // biome-ignore lint/suspicious/noExplicitAny: keyed AnalysisInputs merge
            ;(next as any)[key] = value
          }
        }
        return {
          settings: {
            ...state.settings,
            folderViewAnalysisInputs: next,
          },
        }
      }),

    pushRecentFolder: (path) =>
      set((state) => ({
        settings: {
          ...state.settings,
          recentAnalysisFolders: normalizeRecentAnalysisFolders([
            path,
            ...state.settings.recentAnalysisFolders,
          ]),
        },
      })),

    removeRecentFolder: (path) =>
      set((state) => {
        const normalized = normalizeAnalysisFolderPath(path)
        if (normalized === null) {
          return state
        }
        return {
          settings: {
            ...state.settings,
            recentAnalysisFolders: state.settings.recentAnalysisFolders.filter(
              (candidate) => candidate !== normalized,
            ),
          },
        }
      }),

    clearRecentFolders: () =>
      set((state) => ({
        settings: {
          ...state.settings,
          recentAnalysisFolders: [],
        },
      })),

    pushRecentSubmissionFolder: (recent) =>
      set((state) => {
        const normalizedPath = normalizeSubmissionFolderPath(recent.path)
        if (normalizedPath === null) return state
        const normalizedRecent =
          recent.courseId === undefined
            ? { path: normalizedPath }
            : { path: normalizedPath, courseId: recent.courseId }
        const recentSubmissionFolders = normalizeRecentSubmissionFolders([
          normalizedRecent,
          ...state.settings.recentSubmissionFolders,
        ])
        const pruned = pruneSubmissionStateForRecents({
          recentSubmissionFolders,
          submissionSurfaceStates: state.settings.submissionSurfaceStates,
        })
        return {
          settings: {
            ...state.settings,
            ...pruned,
          },
        }
      }),

    removeRecentSubmissionFolder: (recent) =>
      set((state) => {
        const key = submissionSurfaceStateKey(recent)
        if (key === null) return state
        const recentSubmissionFolders =
          state.settings.recentSubmissionFolders.filter(
            (candidate) => submissionSurfaceStateKey(candidate) !== key,
          )
        const pruned = pruneSubmissionStateForRecents({
          recentSubmissionFolders,
          submissionSurfaceStates: state.settings.submissionSurfaceStates,
        })
        return {
          settings: {
            ...state.settings,
            ...pruned,
          },
        }
      }),

    setSubmissionSurfaceState: (recent, submissionState) =>
      set((state) => {
        const key = submissionSurfaceStateKey(recent)
        if (key === null) return state
        const pruned = pruneSubmissionStateForRecents({
          recentSubmissionFolders: state.settings.recentSubmissionFolders,
          submissionSurfaceStates: {
            ...state.settings.submissionSurfaceStates,
            [key]: submissionState,
          },
        })
        return {
          settings: {
            ...state.settings,
            ...pruned,
          },
        }
      }),

    clearSubmissionSurfaceState: (recent) =>
      set((state) => {
        const key = submissionSurfaceStateKey(recent)
        if (key === null) return state
        const nextStates = { ...state.settings.submissionSurfaceStates }
        delete nextStates[key]
        return {
          settings: {
            ...state.settings,
            submissionSurfaceStates: nextStates,
          },
        }
      }),

    pruneSubmissionFoldersForCourses: (courses) => {
      let changed = false
      set((state) => {
        const rosterCapableCourseIds = new Set(
          courses
            .filter((course) => course.backing === "lms")
            .map((course) => course.id),
        )
        const recentSubmissionFolders =
          state.settings.recentSubmissionFolders.filter(
            (recent) =>
              recent.courseId === undefined ||
              rosterCapableCourseIds.has(recent.courseId),
          )
        const pruned = pruneSubmissionStateForRecents({
          recentSubmissionFolders,
          submissionSurfaceStates: state.settings.submissionSurfaceStates,
        })
        changed =
          !submissionRecentsEqual(
            recentSubmissionFolders,
            state.settings.recentSubmissionFolders,
          ) ||
          !submissionSurfaceStatesEqual(
            pruned.submissionSurfaceStates,
            state.settings.submissionSurfaceStates,
          )
        if (!changed) return state
        return {
          settings: {
            ...state.settings,
            ...pruned,
          },
        }
      })
      return changed
    },

    setTheme: (theme) =>
      set((state) => ({
        settings: {
          ...state.settings,
          appearance: { ...state.settings.appearance, theme },
        },
      })),

    setDateFormat: (dateFormat) =>
      set((state) => ({
        settings: {
          ...state.settings,
          appearance: { ...state.settings.appearance, dateFormat },
        },
      })),

    setTimeFormat: (timeFormat) =>
      set((state) => ({
        settings: {
          ...state.settings,
          appearance: { ...state.settings.appearance, timeFormat },
        },
      })),

    setSyntaxTheme: (syntaxTheme) =>
      set((state) => ({
        settings: {
          ...state.settings,
          appearance: { ...state.settings.appearance, syntaxTheme },
        },
      })),

    setDefaultExtensions: (extensions) =>
      set((state) => {
        const normalized = [
          ...new Set(
            extensions
              .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
              .filter((e) => e.length > 0),
          ),
        ]
        return {
          settings: { ...state.settings, defaultExtensions: normalized },
        }
      }),

    setExaminationModelForProvider: (provider, code) =>
      set((state) => {
        const next: ExaminationModelsByProvider = {
          ...state.settings.examinationModelsByProvider,
          [provider]: code,
        }
        return {
          settings: {
            ...state.settings,
            examinationModelsByProvider: next,
          },
        }
      }),

    setRosterColumnVisibility: (visibility) =>
      set((state) => ({
        settings: { ...state.settings, rosterColumnVisibility: visibility },
      })),

    setRosterColumnSizing: (sizing) =>
      set((state) => ({
        settings: { ...state.settings, rosterColumnSizing: sizing },
      })),

    setGroupsSidebarSize: (size) =>
      set((state) => ({
        settings: { ...state.settings, groupsSidebarSize: size },
      })),

    setAnalysisSidebarSize: (size) =>
      set((state) => ({
        settings: { ...state.settings, analysisSidebarSize: size },
      })),

    setAnalysisDetailListSize: (size) =>
      set((state) => ({
        settings: { ...state.settings, analysisDetailListSize: size },
      })),

    setExaminationSubmissionSidebarSize: (size) =>
      set((state) => ({
        settings: {
          ...state.settings,
          examinationSubmissionSidebarSize: size,
        },
      })),

    setAnalysisSidebar: (sidebar) =>
      set((state) => ({
        settings: { ...state.settings, analysisSidebar: sidebar },
      })),

    setAnalysisConcurrency: (concurrency) =>
      set((state) => ({
        settings: { ...state.settings, analysisConcurrency: concurrency },
      })),

    reset: () => set(initialState),
  }
})

export const selectTheme = (state: AppSettingsState) =>
  state.settings.appearance.theme
export const selectExaminationModelsByProvider = (state: AppSettingsState) =>
  state.settings.examinationModelsByProvider
export const selectRosterColumnVisibility = (state: AppSettingsState) =>
  state.settings.rosterColumnVisibility
export const selectRosterColumnSizing = (state: AppSettingsState) =>
  state.settings.rosterColumnSizing
export const selectAppSettingsSnapshot = (state: AppSettingsState) =>
  state.settings
