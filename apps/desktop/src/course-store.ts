import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { CourseStore } from "@repo-edu/application"
import {
  type PersistedCourse,
  persistedCourseKind,
  type Roster,
  validatePersistedCourse,
} from "@repo-edu/domain"
import { desktopSeedCourseId } from "./course-ids"

function createSeedRoster(): Roster {
  const roster: Roster = {
    connection: null,
    students: [
      {
        id: "s1",
        name: "Ada Lovelace",
        email: "",
        studentNumber: "1001",
        gitUsername: null,
        gitUsernameStatus: "unknown",
        status: "active",
        lmsStatus: null,
        lmsUserId: null,
        enrollmentType: "student",
        enrollmentDisplay: null,
        department: null,
        institution: null,
        source: "local",
      },
      {
        id: "s2",
        name: "Grace Hopper",
        email: "grace@example.com",
        studentNumber: "1002",
        gitUsername: "ghopper",
        gitUsernameStatus: "valid",
        status: "active",
        lmsStatus: null,
        lmsUserId: null,
        enrollmentType: "student",
        enrollmentDisplay: null,
        department: null,
        institution: null,
        source: "local",
      },
    ],
    staff: [],
    groups: [
      {
        id: "g-seed-alpha",
        name: "Alpha",
        memberIds: ["s1"],
        origin: "local",
        lmsGroupId: null,
      },
      {
        id: "g-seed-empty",
        name: "Empty Group",
        memberIds: [],
        origin: "local",
        lmsGroupId: null,
      },
      {
        id: "g-system-s1",
        name: "ada_lovelace",
        memberIds: ["s1"],
        origin: "system",
        lmsGroupId: null,
      },
      {
        id: "g-system-s2",
        name: "grace_hopper",
        memberIds: ["s2"],
        origin: "system",
        lmsGroupId: null,
      },
      {
        id: "g-system-staff",
        name: "staff",
        memberIds: [],
        origin: "system",
        lmsGroupId: null,
      },
    ],
    groupSets: [
      {
        id: "gs-seed-projects",
        name: "Projects",
        groupIds: ["g-seed-alpha", "g-seed-empty"],
        connection: null,
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
      {
        id: "gs-system-individual",
        name: "Individual Students",
        groupIds: ["g-system-s1", "g-system-s2"],
        connection: {
          kind: "system",
          systemType: "individual_students",
        },
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
      {
        id: "gs-system-staff",
        name: "Staff",
        groupIds: ["g-system-staff"],
        connection: {
          kind: "system",
          systemType: "staff",
        },
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
    ],
    assignments: [
      {
        id: "a-seed-project-1",
        name: "Project 1",
        groupSetId: "gs-seed-projects",
      },
    ],
  }

  return roster
}

function createSeedCourse(): PersistedCourse {
  return {
    kind: persistedCourseKind,
    schemaVersion: 1,
    revision: 0,
    id: desktopSeedCourseId,
    displayName: "Seed Course",
    lmsConnectionName: null,
    gitConnectionId: null,
    organization: null,
    lmsCourseId: null,
    roster: createSeedRoster(),
    repositoryTemplate: null,
    updatedAt: "2026-03-04T10:00:00Z",
  }
}

function resolveCoursesDirectory(storageRoot: string): string {
  return join(storageRoot, "courses")
}

function sanitizeCourseFileBaseName(displayName: string): string {
  const normalized = displayName.trim().replace(/\s+/g, " ")
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional range for filename sanitization
  const withoutIllegal = normalized.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
  const withoutTrailingDots = withoutIllegal.replace(/[. ]+$/g, "")
  return withoutTrailingDots.length > 0 ? withoutTrailingDots : "course"
}

function resolveCoursePathFromDisplayName(
  storageRoot: string,
  displayName: string,
  duplicateIndex = 0,
): string {
  const baseName = sanitizeCourseFileBaseName(displayName)
  const fileName =
    duplicateIndex === 0
      ? `${baseName}.json`
      : `${baseName} (${duplicateIndex + 1}).json`
  return join(resolveCoursesDirectory(storageRoot), fileName)
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
  storageRoot: string,
  courseId: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<string> {
  for (let duplicateIndex = 0; ; duplicateIndex += 1) {
    throwIfAborted(signal)
    const candidatePath = resolveCoursePathFromDisplayName(
      storageRoot,
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

async function ensureSeedCourse(storageRoot: string): Promise<void> {
  const directory = resolveCoursesDirectory(storageRoot)
  await mkdir(directory, { recursive: true })
  const existingSeedPath = await findCoursePathById(
    storageRoot,
    desktopSeedCourseId,
  )
  if (existingSeedPath !== null) {
    return
  }

  const seed = createSeedCourse()
  const seedPath = await resolveCoursePathForWrite(
    storageRoot,
    seed.id,
    seed.displayName,
  )
  await writeFile(seedPath, JSON.stringify(seed, null, 2), "utf8")
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

async function readPersistedCourse(
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

export function createDesktopCourseStore(storageRoot: string): CourseStore {
  let writeQueue: Promise<void> = Promise.resolve()

  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const run = writeQueue.then(task, task)
    writeQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    async listCourses(signal?: AbortSignal) {
      throwIfAborted(signal)
      await ensureSeedCourse(storageRoot)
      throwIfAborted(signal)

      const directory = resolveCoursesDirectory(storageRoot)
      const entries = await readdir(directory, { withFileTypes: true })
      const courses: PersistedCourse[] = []

      for (const entry of entries) {
        throwIfAborted(signal)
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue
        }

        courses.push(await readPersistedCourse(join(directory, entry.name)))
      }

      return courses.filter((course) => course.id !== desktopSeedCourseId)
    },
    async loadCourse(courseId: string, signal?: AbortSignal) {
      throwIfAborted(signal)
      await ensureSeedCourse(storageRoot)
      throwIfAborted(signal)

      const coursePath = await findCoursePathById(storageRoot, courseId, signal)
      if (coursePath === null) {
        return null
      }

      return await readPersistedCourse(coursePath)
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

        await ensureSeedCourse(storageRoot)
        throwIfAborted(signal)

        const existingPath = await findCoursePathById(
          storageRoot,
          validation.value.id,
          signal,
        )
        if (existingPath !== null) {
          const existingCourse = await readPersistedCourse(existingPath)
          if (existingCourse.revision !== validation.value.revision) {
            throw new Error(
              `Course revision invariant violated for '${validation.value.id}' (expected ${validation.value.revision}, stored ${existingCourse.revision}).`,
            )
          }
        } else if (validation.value.revision !== 0) {
          throw new Error(
            `Course revision invariant violated for '${validation.value.id}' (expected ${validation.value.revision}, stored missing course).`,
          )
        }

        const savedCourse: PersistedCourse = {
          ...validation.value,
          revision: validation.value.revision + 1,
          updatedAt: new Date().toISOString(),
        }
        const coursePath = await resolveCoursePathForWrite(
          storageRoot,
          savedCourse.id,
          savedCourse.displayName,
          signal,
        )
        await writeFile(
          coursePath,
          JSON.stringify(savedCourse, null, 2),
          "utf8",
        )
        if (existingPath !== null && existingPath !== coursePath) {
          await rm(existingPath, { force: true })
        }
        return savedCourse
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
