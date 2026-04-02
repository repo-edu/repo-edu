import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import type {
  PersistedAppSettings,
  PersistedCourse,
} from "@repo-edu/domain/types"
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
    schemaVersion: 2,
    revision: 0,
    id: "seed-course",
    displayName: "Seed Course",
    lmsConnectionName: null,
    gitConnectionId: null,
    organization: null,
    lmsCourseId: "course-1",
    idSequences: {
      nextGroupSeq: 3,
      nextGroupSetSeq: 2,
      nextMemberSeq: 2,
      nextAssignmentSeq: 2,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [
        {
          id: "m_0001",
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
          id: "g_0001",
          name: "Alpha",
          memberIds: [],
          origin: "local",
          lmsGroupId: null,
        },
        {
          id: "g_0002",
          name: "Beta",
          memberIds: ["m_0001"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs_0001",
          name: "Projects",
          nameMode: "named",
          groupIds: ["g_0001", "g_0002"],
          connection: null,
          repoNameTemplate: null,
          columnVisibility: {},
          columnSizing: {},
        },
      ],
      assignments: [
        {
          id: "a1",
          name: "Project 1",
          groupSetId: "gs_0001",
        },
      ],
    },
    repositoryTemplate: null,
    updatedAt: "2026-03-04T10:00:00Z",
  }
}

function makeSettings(activeCourseId: string | null): PersistedAppSettings {
  return {
    kind: "repo-edu.app-settings.v1",
    schemaVersion: 1,
    activeCourseId,
    activeTab: "roster",
    appearance: {
      theme: "system",
      windowChrome: "system",
      dateFormat: "DMY",
      timeFormat: "24h",
    },
    window: { width: 1180, height: 760 },
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
