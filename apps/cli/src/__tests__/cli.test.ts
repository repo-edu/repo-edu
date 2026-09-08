import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import type {
  WorkflowClient,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  createCourseStorageFailure,
  createWorkflowClient,
} from "@repo-edu/application-contract"
import {
  defaultAppSettings,
  type PersistedAppSettings,
  splitAppSettings,
} from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createCourseStore } from "@repo-edu/host-node"
import { createChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import {
  applyFixtureSourceOverlay,
  type FixtureSource,
  getFixture,
} from "@repo-edu/test-fixtures"
import { createProgram } from "../cli.js"
import { createCliWorkflowClient } from "../workflow-runtime.js"

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

function createInspectionProgram() {
  return createProgram({
    createWorkflowClient: () => {
      throw new Error("The command tree is inspected, never run.")
    },
  })
}

async function runCli(
  args: string[],
  options: { storageRoot: string } | { workflowClient: WorkflowClient },
): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  // This caller owns the controller it passes and stops it below. The program
  // never composes a workflow client of its own, so the root and controller
  // reach the runtime only through this thunk.
  const childProcessLifetimeController = createChildProcessLifetimeController({
    diagnosticSink() {},
    warnUnconfirmedTree(error): never {
      throw error
    },
  })
  const program = createProgram({
    createWorkflowClient: () =>
      "workflowClient" in options
        ? options.workflowClient
        : createCliWorkflowClient({
            childProcessLifetimeController,
            storageRoot: options.storageRoot,
          }),
  })
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
    await childProcessLifetimeController.stopAndConfirm()
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
    backing: "lms",
    revision: 0,
    id: "seed-course",
    displayName: "Seed Course",
    lmsConnectionId: null,
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
          repositories: {},
        },
      ],
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-03-04T10:00:00Z",
  }
}

function makeSettings(activeCourseId: string | null): PersistedAppSettings {
  return {
    ...defaultAppSettings,
    activeSurface:
      activeCourseId === null
        ? { kind: "home" }
        : { kind: "course", courseId: activeCourseId },
    activeTab: "roster",
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
  preset?: "shared-teams" | "task-groups"
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
    await createCourseStore(rootDirectory).saveCourse({
      ...options.course,
      revision: 0,
    })
  }

  if (options?.settings) {
    const settingsDirectory = join(rootDirectory, "settings")
    const sections = splitAppSettings(options.settings)
    await mkdir(settingsDirectory, { recursive: true })
    await writeFile(
      join(settingsDirectory, "credentials.json"),
      JSON.stringify(sections.credentials, null, 2),
      "utf8",
    )
    await writeFile(
      join(settingsDirectory, "preferences.json"),
      JSON.stringify(sections.preferences, null, 2),
      "utf8",
    )
  }
}

async function withTempCliDataDirectory(
  run: (rootDirectory: string) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "repo-edu-cli-"))

  try {
    await run(temporaryRoot)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

describe("CLI command tree", () => {
  it("top-level help matches golden", async () => {
    const golden = await readFile(
      join(import.meta.dirname, "goldens", "help-top.txt"),
      "utf8",
    )

    const help = createInspectionProgram().helpInformation()
    assert.equal(normalize(help), normalize(golden))
  })
})

describe("CLI workflow-backed behaviors", () => {
  it("requires an explicit course for every course-scoped command before running workflows", async () => {
    const calls: string[] = []
    const workflowClient: WorkflowClient = {
      async run(id) {
        calls.push(id)
        throw new Error("Unexpected workflow call")
      },
    }
    const commands = [
      ["course", "show"],
      ["lms", "verify"],
      ["validate", "--assignment", "Project 1"],
      ["repo", "create", "--all"],
      ["repo", "clone", "--all"],
      ["repo", "update", "--assignment", "Project 1"],
    ]
    for (const args of commands) {
      const result = await runCli(args, { workflowClient })
      assert.equal(result.exitCode, 1, args.join(" "))
      assert.match(result.stderr, /requires --course <id>/)
      assert.equal(result.stdout, "")
    }
    assert.deepEqual(calls, [])
  })

  it("keeps desktop observations independent of invocation selection without changing preferences", async () => {
    await withTempCliDataDirectory(async (storageRoot) => {
      const course = makeProfile()
      await seedCliDataDirectory(storageRoot, {
        course,
        settings: makeSettings(course.id),
      })
      const other = {
        ...course,
        id: "other-course",
        displayName: "Other Course",
      }
      await seedCliDataDirectory(storageRoot, { course: other })
      const preferencesPath = join(storageRoot, "settings", "preferences.json")
      const before = await readFile(preferencesPath, "utf8")
      const active = await runCli(["--course", other.id, "course", "active"], {
        storageRoot,
      })
      assert.equal(active.exitCode, 0)
      assert.equal(active.stdout, `${course.id}\n`)
      const list = await runCli(["course", "list", "--course", other.id], {
        storageRoot,
      })
      assert.equal(list.exitCode, 0)
      assert.match(list.stdout, /^\* seed-course\t/m)
      assert.match(list.stdout, /^ {2}other-course\t/m)
      const show = await runCli(["course", "show", "--course", other.id], {
        storageRoot,
      })
      assert.equal(show.exitCode, 0)
      assert.match(show.stdout, /"id": "other-course"/)
      assert.match(show.stdout, /"revision": 1/)
      const missingSelection = await runCli(["course", "show"], { storageRoot })
      assert.equal(missingSelection.exitCode, 1)
      assert.match(missingSelection.stderr, /requires --course <id>/)
      assert.equal(await readFile(preferencesPath, "utf8"), before)
      assert.deepEqual((await readdir(storageRoot)).sort(), [
        "courses.sqlite",
        "settings",
      ])
    })
  })

  it("reports no desktop active course even when --course is supplied", async () => {
    await withTempCliDataDirectory(async (storageRoot) => {
      await seedCliDataDirectory(storageRoot, { settings: makeSettings(null) })
      const active = await runCli(
        ["--course", "seed-course", "course", "active"],
        { storageRoot },
      )
      assert.equal(active.exitCode, 0)
      assert.equal(active.stdout, "No active course.\n")
      assert.deepEqual(await readdir(storageRoot), ["settings"])
    })
  })

  it("fails course list and show on a corrupt shared database without success output", async () => {
    await withTempCliDataDirectory(async (storageRoot) => {
      await writeFile(join(storageRoot, "courses.sqlite"), "invalid database")
      for (const args of [
        ["course", "list"],
        ["--course", "seed-course", "course", "show"],
      ]) {
        const result = await runCli(args, { storageRoot })
        assert.equal(result.exitCode, 1)
        assert.equal(result.stdout, "")
        assert.match(result.stderr, /database/i)
      }
      assert.equal(
        await readFile(join(storageRoot, "courses.sqlite"), "utf8"),
        "invalid database",
      )
    })
  })

  it("does not report repository success or retry after a terminal course save failure", async () => {
    const calls: string[] = []
    const handlers: Partial<WorkflowHandlerMap> = {
      "course.load": async () => ({ ...makeProfile(), revision: 1 }),
      "settings.loadApp": async () => ({
        ...splitAppSettings(makeSettings(null)),
        recovery: [],
      }),
      "repo.update": async () => ({
        prsCreated: 1,
        prsSkipped: 0,
        prsFailed: 0,
        repositoriesPlanned: 1,
        completedAt: "2026-09-06T12:00:00.000Z",
        templateCommitSha: "abc123",
        recordedRepositories: {},
      }),
      "course.save": async () => {
        calls.push("save")
        throw createCourseStorageFailure("Course storage failed.")
      },
    }
    const result = await runCli(
      [
        "--course",
        "seed-course",
        "repo",
        "update",
        "--assignment",
        "Project 1",
      ],
      {
        workflowClient: createWorkflowClient(handlers as WorkflowHandlerMap),
      },
    )
    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Course storage failed/)
    assert.deepEqual(calls, ["save"])
  })

  it("course list shows seeded course and active marker", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli(["course", "list"], {
        storageRoot: rootDirectory,
      })
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

      const result = await runCli(
        ["--course", course.id, "validate", "--assignment", "Project 1"],
        {
          storageRoot: rootDirectory,
        },
      )
      assert.equal(result.exitCode, 1)
      assert.match(result.stdout, /Validation found/)
      assert.match(result.stdout, /missing_email/)
    })
  })

  it("git verify forwards the configured user-agent into the workflow input", async () => {
    const settings: PersistedAppSettings = {
      ...makeSettings(null),
      gitConnections: [
        {
          id: "main-git",
          provider: "github",
          baseUrl: "https://github.com",
          token: "token-1",
          userAgent: "Name / Organization / email@example.com",
        },
      ],
    }

    let verifyInput: unknown = null
    const handlers: Partial<WorkflowHandlerMap> = {
      "settings.loadApp": async () => ({
        ...splitAppSettings(settings),
        recovery: [],
      }),
      "connection.verifyGitDraft": async (input) => {
        verifyInput = input
        return { verified: true, checkedAt: "2026-03-04T10:00:00.000Z" }
      },
    }
    const workflowClient = createWorkflowClient(handlers as WorkflowHandlerMap)

    const result = await runCli(["git", "verify"], { workflowClient })
    assert.equal(result.exitCode, 0)
    assert.deepStrictEqual(verifyInput, {
      provider: "github",
      baseUrl: "https://github.com",
      token: "token-1",
      userAgent: "Name / Organization / email@example.com",
    })
  })

  it("repo create fails when selected course has no git connection", async () => {
    await withTempCliDataDirectory(async (rootDirectory) => {
      const course = makeProfile()
      await seedCliDataDirectory(rootDirectory, {
        course,
        settings: makeSettings(course.id),
      })

      const result = await runCli(
        ["--course", course.id, "repo", "create", "--assignment", "Project 1"],
        { storageRoot: rootDirectory },
      )
      assert.equal(result.exitCode, 1)
      assert.match(result.stderr, /No Git connection is configured/)
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

      const courseList = await runCli(["course", "list"], {
        storageRoot: rootDirectory,
      })
      assert.equal(courseList.exitCode, 0)
      assert.equal(
        courseList.stdout.includes(`* ${course.id}\t${course.displayName}`),
        true,
      )

      const validate = await runCli(
        ["--course", course.id, "validate", "--assignment", "lab01"],
        {
          storageRoot: rootDirectory,
        },
      )
      assert.equal(validate.exitCode, 1)
      assert.match(validate.stdout, /Validation found \d+ issue/)

      const repoDryRun = await runCli(
        [
          "--course",
          course.id,
          "repo",
          "create",
          "--assignment",
          "lab01",
          "--dry-run",
        ],
        { storageRoot: rootDirectory },
      )
      assert.equal(repoDryRun.exitCode, 0)
      assert.match(
        repoDryRun.stdout,
        /Planned repository operation for assignment 'lab01' \(a1\)/,
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

      const verify = await runCli(["--course", course.id, "lms", "verify"], {
        storageRoot: rootDirectory,
      })
      assert.equal(verify.exitCode, 1)
      assert.match(
        verify.stderr,
        /Selected course does not reference an LMS connection/,
      )
    })
  })
})
