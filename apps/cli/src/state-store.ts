import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { AppSettingsStore, CourseStore } from "@repo-edu/application"
import {
  validatePersistedAppSettings,
  validatePersistedCourse,
} from "@repo-edu/domain/schemas"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  cleanupAtomicTempFiles,
  createWriteQueue,
  writeTextFileAtomic,
} from "@repo-edu/host-node"

const cliDataDirEnv = "REPO_EDU_CLI_DATA_DIR"

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

function resolveCoursesDirectory(storageRoot: string): string {
  return join(storageRoot, "courses")
}

function resolveSettingsPath(storageRoot: string): string {
  return join(storageRoot, "settings", "app-settings.json")
}

function resolveCoursePath(storageRoot: string, courseId: string): string {
  return join(
    resolveCoursesDirectory(storageRoot),
    `${encodeURIComponent(courseId)}.json`,
  )
}

async function readValidatedCourse(
  coursePath: string,
): Promise<PersistedCourse> {
  const raw = await readFile(coursePath, "utf8")
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
}

export function resolveCliStorageRoot(): string {
  return process.env[cliDataDirEnv] ?? join(homedir(), ".repo-edu")
}

export function createCliCourseStore(
  storageRoot: string = resolveCliStorageRoot(),
): CourseStore {
  const enqueueWrite = createWriteQueue()

  return {
    async listCourses(signal?: AbortSignal) {
      throwIfAborted(signal)
      await cleanupAtomicTempFiles(resolveCoursesDirectory(storageRoot))
      const directory = resolveCoursesDirectory(storageRoot)
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return []
          }

          throw error
        },
      )

      const courses: PersistedCourse[] = []
      for (const entry of entries) {
        throwIfAborted(signal)
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue
        }

        courses.push(await readValidatedCourse(join(directory, entry.name)))
      }

      return courses
    },

    async loadCourse(courseId: string, signal?: AbortSignal) {
      throwIfAborted(signal)

      const coursePath = resolveCoursePath(storageRoot, courseId)
      try {
        return await readValidatedCourse(coursePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null
        }

        throw error
      }
    },

    async saveCourse(course: PersistedCourse, signal?: AbortSignal) {
      return await enqueueWrite(async () => {
        throwIfAborted(signal)

        const validation = validatePersistedCourse(course)
        if (!validation.ok) {
          throw new Error(
            `Invalid persisted course: ${validation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          )
        }

        const coursesDirectory = resolveCoursesDirectory(storageRoot)
        await mkdir(coursesDirectory, { recursive: true })
        throwIfAborted(signal)

        const coursePath = resolveCoursePath(storageRoot, validation.value.id)
        const existing = await readValidatedCourse(coursePath).catch(
          (error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              return null
            }
            throw error
          },
        )
        if (
          existing !== null &&
          existing.revision !== validation.value.revision
        ) {
          throw new Error(
            `Course revision invariant violated for '${validation.value.id}' (expected ${validation.value.revision}, stored ${existing.revision}).`,
          )
        }
        if (existing === null && validation.value.revision !== 0) {
          throw new Error(
            `Course revision invariant violated for '${validation.value.id}' (expected ${validation.value.revision}, stored missing course).`,
          )
        }

        const savedCourse: PersistedCourse = {
          ...validation.value,
          revision: validation.value.revision + 1,
          updatedAt: new Date().toISOString(),
        }
        await writeFile(
          coursePath,
          JSON.stringify(savedCourse, null, 2),
          "utf8",
        )
        return savedCourse
      })
    },

    async deleteCourse(courseId: string, signal?: AbortSignal) {
      await enqueueWrite(async () => {
        throwIfAborted(signal)
        const coursePath = resolveCoursePath(storageRoot, courseId)
        await rm(coursePath, { force: true })
      })
    },
  }
}

export function createCliAppSettingsStore(
  storageRoot: string = resolveCliStorageRoot(),
): AppSettingsStore {
  const enqueueWrite = createWriteQueue()

  return {
    async loadSettings(signal?: AbortSignal) {
      throwIfAborted(signal)
      await cleanupAtomicTempFiles(join(storageRoot, "settings"))
      const settingsPath = resolveSettingsPath(storageRoot)
      try {
        const raw = await readFile(settingsPath, "utf8")
        const parsed = JSON.parse(raw) as PersistedAppSettings
        const validation = validatePersistedAppSettings(parsed)
        if (!validation.ok) {
          throw new Error(
            `Invalid persisted app settings at ${settingsPath}: ${validation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          )
        }

        return validation.value
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null
        }

        throw error
      }
    },

    async saveSettings(settings: PersistedAppSettings, signal?: AbortSignal) {
      return await enqueueWrite(async () => {
        throwIfAborted(signal)

        const validation = validatePersistedAppSettings(settings)
        if (!validation.ok) {
          throw new Error(
            `Invalid persisted app settings: ${validation.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          )
        }

        await mkdir(join(storageRoot, "settings"), { recursive: true })
        throwIfAborted(signal)

        const settingsPath = resolveSettingsPath(storageRoot)
        await writeTextFileAtomic(
          settingsPath,
          JSON.stringify(validation.value, null, 2),
          signal,
        )
        return validation.value
      })
    },
  }
}
