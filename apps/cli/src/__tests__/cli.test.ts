import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { PersistedAppSettings, PersistedCourse } from "@repo-edu/domain"
import {
  applyFixtureSourceOverlay,
  type FixtureSource,
  getFixture,
} from "@repo-edu/test-fixtures"
import { createProgram } from "../cli.js"

function toText(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString("utf8")
  }

  return String(chunk)
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd()
}

async function runCli(args: string[]): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  const program = createProgram()
  program.exitOverride()

  let stdout = ""
  let stderr = ""

  const previousStdoutWrite = process.stdout.write.bind(process.stdout)
  const previousStderrWrite = process.stderr.write.bind(process.stderr)
  const previousExitCode = process.exitCode

  process.stdout.write = ((chunk: unknown) => {
    stdout += toText(chunk)
    return true
  }) as typeof process.stdout.write

  process.stderr.write = ((chunk: unknown) => {
    stderr += toText(chunk)
    return true
  }) as typeof process.stderr.write

  process.exitCode = 0

  try {
    await program.parseAsync(["node", "redu", ...args])
  } catch (error) {
    const code = (error as { code?: unknown }).code
    if (typeof code !== "string" || !code.startsWith("commander.")) {
      throw error
    }
  } finally {
    process.stdout.write = previousStdoutWrite
    process.stderr.write = previousStderrWrite
  }

  const exitCode = process.exitCode ?? 0
  process.exitCode = previousExitCode

  return {
    exitCode,
    stdout,
    stderr,
  }
}

function makeProfile(): PersistedCourse {
  return {
    kind: "repo-edu.course.v1",
    schemaVersion: 1,
    revision: 0,
    id: "seed-course",
    displayName: "Seed Course",
    lmsConnectionName: null,
    gitConnectionName: null,
    lmsCourseId: "course-1",
    roster: {
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
      ],
      staff: [],
      groups: [
        {
          id: "g-empty",
          name: "Alpha",
          memberIds: [],
          origin: "local",
          lmsGroupId: null,
        },
        {
          id: "g-full",
          name: "Beta",
          memberIds: ["s1"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs-local",
          name: "Projects",
          groupIds: ["g-empty", "g-full"],
          connection: null,
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
          repoNameTemplate: null,
        },
      ],
      assignments: [
        {
          id: "a1",
          name: "Project 1",
          groupSetId: "gs-local",
        },
      ],
    },
    repositoryTemplate: null,
    updatedAt: "2026-03-04T10:00:00Z",
  }
}

function withCachedGroupSet(course: PersistedCourse): PersistedCourse {
  return {
    ...course,
    roster: {
      ...course.roster,
      groups: [
        ...course.roster.groups,
        {
          id: "g-cache",
          name: "LMS Team",
          memberIds: ["s1"],
          origin: "lms",
          lmsGroupId: "remote-group-1",
        },
      ],
      groupSets: [
        ...course.roster.groupSets,
        {
          id: "gs-cache",
          name: "LMS Cached",
          groupIds: ["g-cache"],
          connection: {
            kind: "canvas",
            courseId: "course-1",
            groupSetId: "remote-set-1",
            lastUpdated: "2026-03-04T10:00:00Z",
          },
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
          repoNameTemplate: null,
        },
      ],
    },
  }
}

function makeSettings(activeCourseId: string | null): PersistedAppSettings {
  return {
    kind: "repo-edu.app-settings.v1",
    schemaVersion: 1,
    activeCourseId,
    appearance: {
      theme: "system",
      windowChrome: "system",
      dateFormat: "DMY",
      timeFormat: "24h",
    },
    lmsConnections: [],
    gitConnections: [],
    lastOpenedAt: null,
    rosterColumnVisibility: {},
    rosterColumnSizing: {},
  }
}

function cloneValue<TValue>(value: TValue): TValue {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as TValue
}

function makeFixtureSeed(options?: {
  tier?: "small" | "medium"
  preset?: "shared-teams" | "assignment-scoped"
  source?: FixtureSource
}): { course: PersistedCourse; settings: PersistedAppSettings } {
  const tier = options?.tier ?? "small"
  const preset = options?.preset ?? "shared-teams"
  const fixture = getFixture({ tier, preset })
  const course = cloneValue(fixture.course)
  const settings = cloneValue(fixture.settings)

  if (options?.source) {
    const courseId = course.lmsCourseId ?? `course-${tier}-${preset}`
    applyFixtureSourceOverlay(course, settings, options.source, courseId)
  }

  return { course, settings }
}

async function seedCliDataDirectory(
  rootDirectory: string,
  options?: {
    course?: PersistedCourse
    settings?: PersistedAppSettings
  },
): Promise<void> {
  if (options?.course) {
    const coursesDirectory = join(rootDirectory, "courses")
    await mkdir(coursesDirectory, { recursive: true })
    await writeFile(
      join(coursesDirectory, `${encodeURIComponent(options.course.id)}.json`),
      JSON.stringify(options.course, null, 2),
      "utf8",
    )
  }

  if (options?.settings) {
    const settingsDirectory = join(rootDirectory, "settings")
    await mkdir(settingsDirectory, { recursive: true })
    await writeFile(
      join(settingsDirectory, "app-settings.json"),
      JSON.stringify(options.settings, null, 2),
      "utf8",
    )
  }
}

async function withTempCliDataDirectory(
  run: (rootDirectory: string) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "repo-edu-cli-"))
  const previous = process.env.REPO_EDU_CLI_DATA_DIR
  process.env.REPO_EDU_CLI_DATA_DIR = temporaryRoot

  try {
    await run(temporaryRoot)
  } finally {
    if (previous === undefined) {
      delete process.env.REPO_EDU_CLI_DATA_DIR
    } else {
      process.env.REPO_EDU_CLI_DATA_DIR = previous
    }

    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

describe("CLI command tree", () => {
  it("top-level help matches golden", async () => {
    const golden = await readFile(
      join(import.meta.dirname, "goldens", "help-top.txt"),
      "utf8",
    )

    const help = createProgram().helpInformation()
    assert.equal(normalize(help), normalize(golden))
  })

  it("lms cache help matches golden", async () => {
    const golden = await readFile(
      join(import.meta.dirname, "goldens", "help-lms-cache.txt"),
      "utf8",
    )

    const lms = createProgram().commands.find(
      (command) => command.name() === "lms",
    )
    assert.ok(lms)

    const cache = lms.commands.find((command) => command.name() === "cache")
    assert.ok(cache)

    const help = cache.helpInformation()
    assert.equal(normalize(help), normalize(golden))
  })
})

describe("CLI workflow-backed behaviors", () => {
  it("course list shows seeded course and active marker", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli(["course", "list"])
      assert.equal(result.exitCode, 0)
      assert.match(result.stdout, /^\* seed-course\tSeed Course\t/m)
    })
  })

  it("roster show renders summary, students, and assignments", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli([
        "roster",
        "show",
        "--students",
        "--assignments",
      ])
      assert.equal(result.exitCode, 0)
      assert.match(result.stdout, /Course: seed-course/)
      assert.match(result.stdout, /Students:\n- s1\tAda Lovelace/)
      assert.match(result.stdout, /Assignments:\n- a1\tProject 1/)
    })
  })

  it("lms cache list reports empty cache", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli(["lms", "cache", "list"])
      assert.equal(result.exitCode, 0)
      assert.match(result.stdout, /No LMS cached group sets\./)
    })
  })

  it("lms cache delete removes cached group set from saved course", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = withCachedGroupSet(makeProfile())
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli(["lms", "cache", "delete", "gs-cache"])
      assert.equal(result.exitCode, 0)
      assert.match(result.stdout, /Deleted cached group set 'gs-cache'\./)

      const rawProfile = await readFile(
        join(rootDirectory, "courses", "seed-course.json"),
        "utf8",
      )
      const savedCourse = JSON.parse(rawProfile) as PersistedCourse

      assert.equal(
        savedCourse.roster.groupSets.some(
          (groupSet) => groupSet.id === "gs-cache",
        ),
        false,
      )
      assert.equal(
        savedCourse.roster.groups.some((group) => group.id === "g-cache"),
        false,
      )
    })
  })

  it("validate reports domain issues with non-zero exit", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli(["validate", "--assignment", "Project 1"])
      assert.equal(result.exitCode, 1)
      assert.match(result.stdout, /Validation found/)
      assert.match(result.stdout, /missing_email/)
    })
  })

  it("repo delete enforces explicit confirmation via workflow", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli([
        "repo",
        "delete",
        "--assignment",
        "Project 1",
      ])
      assert.equal(result.exitCode, 1)
      assert.match(result.stderr, /explicit confirmation/)
    })
  })

  it("repo create fails when selected course has no git connection", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli([
        "repo",
        "create",
        "--assignment",
        "Project 1",
      ])
      assert.equal(result.exitCode, 1)
      assert.match(result.stderr, /does not reference a Git connection/)
    })
  })
})

describe("CLI fixture-backed integration", () => {
  it("runs offline-safe commands against fixture-seeded data", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const { course, settings } = makeFixtureSeed({
        tier: "small",
        preset: "shared-teams",
      })
      await seedCliDataDirectory(rootDirectory, { course, settings })

      const courseList = await runCli(["course", "list"])
      assert.equal(courseList.exitCode, 0)
      assert.equal(
        courseList.stdout.includes(`* ${course.id}\t${course.displayName}`),
        true,
      )

      const rosterShow = await runCli([
        "roster",
        "show",
        "--students",
        "--assignments",
      ])
      assert.equal(rosterShow.exitCode, 0)
      assert.match(rosterShow.stdout, new RegExp(`Course: ${course.id}`))
      assert.match(rosterShow.stdout, /Students:\n- s-0001\t/)
      assert.match(rosterShow.stdout, /Assignments:\n- a1\tassignment-1\t/)

      const validate = await runCli([
        "validate",
        "--assignment",
        "assignment-1",
      ])
      assert.equal(validate.exitCode, 0)
      assert.match(
        validate.stdout,
        /Validation passed for assignment 'assignment-1'/,
      )

      const repoDryRun = await runCli([
        "repo",
        "create",
        "--assignment",
        "assignment-1",
        "--dry-run",
      ])
      assert.equal(repoDryRun.exitCode, 0)
      assert.match(
        repoDryRun.stdout,
        /Planned repository operation for assignment 'assignment-1' \(a1\)/,
      )
      assert.match(repoDryRun.stdout, /^- .+\tgroup=.+\tassignment=.+$/m)
    })
  })

  it("fails LMS-dependent command with fixture file source overlay", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const { course, settings } = makeFixtureSeed({
        tier: "small",
        preset: "shared-teams",
        source: "file",
      })
      await seedCliDataDirectory(rootDirectory, { course, settings })

      const verify = await runCli(["lms", "verify"])
      assert.equal(verify.exitCode, 1)
      assert.match(
        verify.stderr,
        /Selected course does not reference an LMS connection/,
      )
    })
  })
})
