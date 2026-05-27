import { mkdir, readdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import {
  type CourseStore,
  classifyPersistenceWriteErrorCode,
  createCourseSaveConflictError,
  createPersistenceWriteError,
  isCourseSaveConflictError,
  isPersistenceWriteError,
} from "@repo-edu/application"
import { validatePersistedCourse } from "@repo-edu/domain/schemas"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  cleanupAtomicTempFiles,
  createWriteQueue,
  writeTextFileAtomic,
} from "@repo-edu/host-node"

function resolveCoursesDirectory(storageRoot: string): string {
  return join(storageRoot, "courses")
}

async function ensureCoursesDirectory(coursesDirectory: string): Promise<void> {
  await mkdir(coursesDirectory, { recursive: true })
}

function sanitizeCourseFileBaseName(displayName: string): string {
  const normalized = displayName.trim().replace(/\s+/g, " ")
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional range for filename sanitization
  const withoutIllegal = normalized.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
  const withoutTrailingDots = withoutIllegal.replace(/[. ]+$/g, "")
  return withoutTrailingDots.length > 0 ? withoutTrailingDots : "course"
}

function resolveCoursePathFromDisplayName(
  coursesDirectory: string,
  displayName: string,
  duplicateIndex = 0,
): string {
  const baseName = sanitizeCourseFileBaseName(displayName)
  const fileName =
    duplicateIndex === 0
      ? `${baseName}.json`
      : `${baseName} (${duplicateIndex + 1}).json`
  return join(coursesDirectory, fileName)
}

type CourseFileInspection =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "course"; course: PersistedCourse }

async function inspectCourseFile(
  coursePath: string,
): Promise<CourseFileInspection> {
  let raw: string
  try {
    raw = await readFile(coursePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing" }
    }
    throw error
  }

  try {
    const parsed = JSON.parse(raw) as PersistedCourse
    const validation = validatePersistedCourse(parsed)
    if (!validation.ok) {
      return { kind: "invalid" }
    }
    return { kind: "course", course: validation.value }
  } catch {
    return { kind: "invalid" }
  }
}

async function findCoursePathById(
  storageRoot: string,
  courseId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const directory = resolveCoursesDirectory(storageRoot)
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    },
  )

  for (const entry of entries) {
    throwIfAborted(signal)
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }

    const path = join(directory, entry.name)
    const inspected = await inspectCourseFile(path)
    if (inspected.kind === "course" && inspected.course.id === courseId) {
      return path
    }
  }

  return null
}

async function resolveCoursePathForWrite(
  coursesDirectory: string,
  courseId: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<string> {
  for (let duplicateIndex = 0; ; duplicateIndex += 1) {
    throwIfAborted(signal)
    const candidatePath = resolveCoursePathFromDisplayName(
      coursesDirectory,
      displayName,
      duplicateIndex,
    )

    const inspected = await inspectCourseFile(candidatePath)
    if (inspected.kind === "missing") {
      return candidatePath
    }
    if (inspected.kind === "course" && inspected.course.id === courseId) {
      return candidatePath
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

async function readPersistedCourse(
  coursePath: string,
  options: { saveRead?: boolean } = {},
): Promise<PersistedCourse> {
  const raw = await readFile(coursePath, "utf8")

  try {
    const parsed = JSON.parse(raw) as PersistedCourse
    const validation = validatePersistedCourse(parsed)
    if (!validation.ok) {
      throw new Error(
        `Invalid persisted course at ${coursePath}: ${validation.issues
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; ")}`,
      )
    }

    return validation.value
  } catch (error) {
    if (options.saveRead) {
      throw createPersistenceWriteError(
        "decode",
        `Could not decode existing course record at ${coursePath}.`,
        error,
      )
    }

    throw error
  }
}

function toPersistenceWriteError(error: unknown, message: string): Error {
  if (isCourseSaveConflictError(error) || isPersistenceWriteError(error)) {
    return error
  }

  return createPersistenceWriteError(
    classifyPersistenceWriteErrorCode((error as NodeJS.ErrnoException).code),
    message,
    error,
  )
}

export function createDesktopCourseStore(storageRoot: string): CourseStore {
  const enqueueWrite = createWriteQueue()

  return {
    async listCourses(signal?: AbortSignal) {
      throwIfAborted(signal)
      const directory = resolveCoursesDirectory(storageRoot)
      await ensureCoursesDirectory(directory)
      await cleanupAtomicTempFiles(directory)
      throwIfAborted(signal)

      const entries = await readdir(directory, { withFileTypes: true })
      const courses: PersistedCourse[] = []

      for (const entry of entries) {
        throwIfAborted(signal)
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue
        }

        courses.push(await readPersistedCourse(join(directory, entry.name)))
      }

      return courses
    },
    async loadCourse(courseId: string, signal?: AbortSignal) {
      throwIfAborted(signal)

      const coursePath = await findCoursePathById(storageRoot, courseId, signal)
      if (coursePath === null) {
        return null
      }

      return await readPersistedCourse(coursePath)
    },
    async saveCourse(course: PersistedCourse, signal?: AbortSignal) {
      return await enqueueWrite(async () => {
        try {
          throwIfAborted(signal)
          const existingPath = await findCoursePathById(
            storageRoot,
            course.id,
            signal,
          )
          if (existingPath !== null) {
            const existingCourse = await readPersistedCourse(existingPath, {
              saveRead: true,
            })
            if (existingCourse.revision !== course.revision) {
              throw createCourseSaveConflictError({
                reason: "revision-invariant",
                courseId: course.id,
                expectedRevision: course.revision,
                storedRevision: existingCourse.revision,
              })
            }
          } else if (course.revision !== 0) {
            throw createCourseSaveConflictError({
              reason: "course-missing",
              courseId: course.id,
              expectedRevision: course.revision,
              storedRevision: null,
            })
          }

          const savedCourse: PersistedCourse = {
            ...course,
            revision: course.revision + 1,
            updatedAt: new Date().toISOString(),
          }
          const coursesDirectory = resolveCoursesDirectory(storageRoot)
          await ensureCoursesDirectory(coursesDirectory)
          throwIfAborted(signal)
          const coursePath = await resolveCoursePathForWrite(
            coursesDirectory,
            savedCourse.id,
            savedCourse.displayName,
            signal,
          )
          await writeTextFileAtomic(
            coursePath,
            JSON.stringify(savedCourse, null, 2),
            signal,
          )
          if (existingPath !== null && existingPath !== coursePath) {
            await rm(existingPath, { force: true })
          }
          return {
            revision: savedCourse.revision,
            updatedAt: savedCourse.updatedAt,
          }
        } catch (error) {
          throw toPersistenceWriteError(
            error,
            `Could not write course '${course.id}'.`,
          )
        }
      })
    },
    async deleteCourse(courseId: string, signal?: AbortSignal) {
      await enqueueWrite(async () => {
        throwIfAborted(signal)
        const coursePath = await findCoursePathById(
          storageRoot,
          courseId,
          signal,
        )
        if (coursePath !== null) {
          await rm(coursePath, { force: true })
        }
      })
    },
  }
}
