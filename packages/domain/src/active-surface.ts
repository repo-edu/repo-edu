import { isAbsolute, normalize } from "pathe"
import { z } from "zod"

export const activeTabSchema = z.enum([
  "roster",
  "groups-assignments",
  "analysis",
])
export type ActiveTab = z.infer<typeof activeTabSchema>

export function normalizeAnalysisFolderPath(path: string): string | null {
  const trimmed = path.trim()
  if (trimmed.length === 0) {
    return null
  }
  const normalized = normalize(trimmed)
  if (normalized === "/") {
    return normalized
  }
  if (/^[a-zA-Z]:\/$/.test(normalized)) {
    return normalized
  }
  return normalized.replace(/\/+$/, "")
}

export function normalizeSubmissionFolderPath(path: string): string | null {
  const trimmed = path.trim()
  if (trimmed.length === 0 || !isAbsolute(trimmed)) {
    return null
  }
  return normalizeAnalysisFolderPath(trimmed)
}

const analysisFolderPathSchema = z.string().transform((path, context) => {
  const normalized = normalizeAnalysisFolderPath(path)
  if (normalized === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Folder path must not be empty.",
    })
    return z.NEVER
  }
  return normalized
})

const submissionFolderPathSchema = z.string().transform((path, context) => {
  const normalized = normalizeSubmissionFolderPath(path)
  if (normalized === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Submission folder path must be absolute and non-empty.",
    })
    return z.NEVER
  }
  return normalized
})

export const submissionFolderRecentSchema = z
  .object({
    path: submissionFolderPathSchema,
    courseId: z.string().min(1).optional(),
  })
  .strict()

export type SubmissionFolderRecent = z.infer<
  typeof submissionFolderRecentSchema
>

export function normalizeSubmissionFolderRecent(
  recent: SubmissionFolderRecent,
): SubmissionFolderRecent | null {
  const path = normalizeSubmissionFolderPath(recent.path)
  if (path === null) return null
  return recent.courseId === undefined
    ? { path }
    : { path, courseId: recent.courseId }
}

export function submissionRecentKey(input: {
  path: string
  courseId?: string
}): string | null {
  const path = normalizeSubmissionFolderPath(input.path)
  if (path === null) return null
  return `${input.courseId ?? ""}\0${path}`
}

/**
 * State keys must stay equal to recent keys: settings prunes saved
 * submission-surface state by matching state-map keys against recent keys.
 */
export function submissionSurfaceStateKey(input: {
  path: string
  courseId?: string
}): string | null {
  return submissionRecentKey(input)
}

export const persistedActiveSurfaceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("course"),
      courseId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("folder"),
      path: analysisFolderPathSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("submission"),
      path: submissionFolderPathSchema,
      courseId: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("home"),
    })
    .strict(),
])

export type PersistedActiveSurface = z.infer<
  typeof persistedActiveSurfaceSchema
>

export function normalizeActiveSurface(
  surface: PersistedActiveSurface,
): PersistedActiveSurface {
  if (surface.kind === "folder") {
    const path = normalizeAnalysisFolderPath(surface.path)
    return path === null ? { kind: "home" } : { kind: "folder", path }
  }
  if (surface.kind === "submission") {
    const path = normalizeSubmissionFolderPath(surface.path)
    if (path === null) return { kind: "home" }
    return surface.courseId === undefined
      ? { kind: "submission", path }
      : { kind: "submission", path, courseId: surface.courseId }
  }
  return surface
}

export function activeSurfaceEquals(
  left: PersistedActiveSurface,
  right: PersistedActiveSurface,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === "course" && right.kind === "course") {
    return left.courseId === right.courseId
  }
  if (left.kind === "folder" && right.kind === "folder") {
    return left.path === right.path
  }
  if (left.kind === "submission" && right.kind === "submission") {
    return left.path === right.path && left.courseId === right.courseId
  }
  return true
}

export function activeSurfaceSubmissionStateKey(
  surface: PersistedActiveSurface,
): string | null {
  if (surface.kind !== "submission") {
    return null
  }
  return submissionSurfaceStateKey(surface)
}

export function activeSurfaceRecentSubmission(
  surface: PersistedActiveSurface,
): SubmissionFolderRecent | null {
  if (surface.kind !== "submission") {
    return null
  }
  return surface.courseId === undefined
    ? { path: surface.path }
    : { path: surface.path, courseId: surface.courseId }
}

export function activeCourseIdFromSurface(
  surface: PersistedActiveSurface,
): string | null {
  if (surface.kind === "course") {
    return surface.courseId
  }
  if (surface.kind === "submission") {
    return surface.courseId ?? null
  }
  return null
}
