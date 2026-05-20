import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createDocsDemoRuntime } from "../demo-runtime.js"

function isAppErrorWithType(
  error: unknown,
  type: "validation" | "not-found" | "provider" | "unexpected" | "cancelled",
) {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === type
  )
}

function isAppErrorWithAnyType(
  error: unknown,
  types: Array<
    "validation" | "not-found" | "provider" | "unexpected" | "cancelled"
  >,
) {
  return types.some((type) => isAppErrorWithType(error, type))
}

function plannedGroupIds(
  plan: ReturnType<typeof planRepositoryOperation>,
): string[] {
  assert.equal(plan.ok, true)
  if (!plan.ok) {
    return []
  }
  return plan.value.groups.map((group) => group.groupId).sort()
}

describe("docs fixture integration: seeded LMS course", () => {
  it("uses local/generated LMS cohort data without Canvas source state", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
    assert.equal(course.roster.connection, null)
    assert.equal(course.roster.students.length, 67)
    assert.equal(course.roster.staff.length, 3)
    assert.equal(course.roster.groupSets.length, 2)
    assert.ok(
      course.roster.groupSets.every((groupSet) => groupSet.connection === null),
    )

    const nonSystemGroups = course.roster.groups.filter(
      (group) => group.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((group) => group.origin === "local"))
    assert.ok(nonSystemGroups.every((group) => group.lmsGroupId === null))

    await assert.rejects(
      runtime.workflowClient.run("groupSet.fetchAvailableFromLms", {
        course,
        appSettings,
      }),
      (error: unknown) =>
        isAppErrorWithAnyType(error, ["validation", "not-found"]),
    )

    await assert.rejects(
      runtime.workflowClient.run("roster.importFromLms", {
        course,
        appSettings,
        lmsCourseId: runtime.lmsCourseId,
      }),
      (error: unknown) =>
        isAppErrorWithAnyType(error, ["validation", "not-found"]),
    )
  })
})

describe("docs fixture integration: seeded RepoBee course", () => {
  it("rejects LMS workflows for the RepoBee course", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.repobeeCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
    assert.equal(course.roster.connection, null)

    const repobeeSets = course.roster.groupSets.filter(
      (groupSet) => groupSet.nameMode === "unnamed",
    )
    assert.equal(repobeeSets.length > 0, true)
    assert.equal(
      repobeeSets.every((groupSet) => groupSet.teams.length > 0),
      true,
    )

    await assert.rejects(
      runtime.workflowClient.run("groupSet.fetchAvailableFromLms", {
        course,
        appSettings,
      }),
      (error: unknown) => isAppErrorWithType(error, "validation"),
    )

    await assert.rejects(
      runtime.workflowClient.run("roster.importFromLms", {
        course,
        appSettings,
        lmsCourseId: runtime.lmsCourseId,
      }),
      (error: unknown) => isAppErrorWithType(error, "validation"),
    )
  })
})

describe("docs fixture integration: repository planning by fixed task setup", () => {
  it("calculator and scheduler share one group set and match repo.create count", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    const calculatorPlan = planRepositoryOperation(
      course,
      "calculator",
      "create",
    )
    const schedulerPlan = planRepositoryOperation(
      course,
      "topological-task-scheduler",
      "create",
    )

    const calculatorGroupIds = plannedGroupIds(calculatorPlan)
    const schedulerGroupIds = plannedGroupIds(schedulerPlan)
    assert.deepEqual(calculatorGroupIds, schedulerGroupIds)
    assert.equal(calculatorGroupIds.length > 0, true)

    const calculatorResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "calculator",
      template: null,
    })
    assert.equal(
      calculatorResult.repositoriesPlanned,
      calculatorGroupIds.length,
    )

    const schedulerResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "topological-task-scheduler",
      template: null,
    })
    assert.equal(schedulerResult.repositoriesPlanned, schedulerGroupIds.length)
  })

  it("huffman isolates its group population and matches repo.create count", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    const calculatorPlan = planRepositoryOperation(
      course,
      "calculator",
      "create",
    )
    const huffmanPlan = planRepositoryOperation(
      course,
      "huffman-encoder",
      "create",
    )

    const calculatorGroupIds = plannedGroupIds(calculatorPlan)
    const huffmanGroupIds = plannedGroupIds(huffmanPlan)
    const overlap = calculatorGroupIds.filter((groupId) =>
      huffmanGroupIds.includes(groupId),
    )
    assert.deepEqual(overlap, [])
    assert.equal(calculatorGroupIds.length > 0, true)
    assert.equal(huffmanGroupIds.length > 0, true)

    const calculatorResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "calculator",
      template: null,
    })
    assert.equal(
      calculatorResult.repositoriesPlanned,
      calculatorGroupIds.length,
    )

    const huffmanResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "huffman-encoder",
      template: null,
    })
    assert.equal(huffmanResult.repositoriesPlanned, huffmanGroupIds.length)
  })
})

describe("docs fixture integration: recorded analysis git mocks", () => {
  it("seeds analysis documents and supports discovery, filtered log analysis, and blame", async () => {
    const runtime = createDocsDemoRuntime()
    const documents = await runtime.workflowClient.run(
      "documents.list",
      undefined,
    )
    const analysisSummary = documents.find(
      (document) =>
        document.kind === "analysis" && document.id === runtime.analysisId,
    )
    assert.ok(analysisSummary)

    const analysis = await runtime.workflowClient.run("analyses.load", {
      analysisId: analysisSummary.id,
    })
    assert.equal(analysis.searchFolder, runtime.analysisFixtureRootPath)
    assert.deepEqual(analysis.analysisInputs.extensions, ["py"])

    const analyses = await Promise.all(
      documents
        .filter((document) => document.kind === "analysis")
        .map((document) =>
          runtime.workflowClient.run("analyses.load", {
            analysisId: document.id,
          }),
        ),
    )
    assert.ok(
      analyses.every(
        (seededAnalysis) =>
          seededAnalysis.searchFolder === runtime.analysisFixtureRootPath,
      ),
    )

    const discovered = await runtime.workflowClient.run(
      "analysis.discoverRepos",
      {
        searchFolder: runtime.analysisFixtureRootPath,
        maxDepth: 1,
      },
    )
    assert.deepEqual(
      discovered.repos.map((repo) => repo.name),
      [
        "calculator-adeyemi-lindqvist-ramaswamy",
        "calculator-eriksen-okafor-raman",
        "calculator-lindqvist-okafor-tanaka",
        "huffman-encoder-team-01",
        "huffman-encoder-team-02",
        "huffman-encoder-team-03",
      ],
    )

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })
    const analysisCourse: PersistedCourse = {
      ...course,
      searchFolder: analysis.searchFolder,
      analysisInputs: analysis.analysisInputs,
    }
    const selectedRepo = discovered.repos[0]

    const result = await runtime.workflowClient.run("analysis.run", {
      course: analysisCourse,
      repositoryAbsolutePath: selectedRepo.path,
      config: {
        extensions: ["py"],
        includeFiles: ["*.py", "tests/*.py"],
        excludeFiles: ["test_unary.py"],
        excludeAuthors: ["Nobody*"],
        excludeEmails: ["nobody@example.edu"],
        excludeRevisions: ["0000000"],
        excludeMessages: ["chore:*"],
        since: "2026-01-01",
        until: "2026-12-31",
        whitespace: true,
        nFiles: 3,
        maxConcurrency: 2,
      },
    })
    assert.equal(result.resolvedAsOfOid.length, 40)
    assert.equal(result.authorStats.length > 0, true)
    assert.equal(result.fileStats.length > 0, true)
    assert.equal(result.fileStats.length <= 3, true)
    assert.equal(
      result.fileStats.every((file) => !file.path.endsWith("test_unary.py")),
      true,
    )

    const blameTarget =
      result.fileStats.find((file) => file.path === "evaluator.py") ??
      result.fileStats[0]
    const blame = await runtime.workflowClient.run("analysis.blame", {
      course: analysisCourse,
      repositoryAbsolutePath: selectedRepo.path,
      config: {
        extensions: ["py"],
        includeFiles: ["*.py", "tests/*.py"],
        excludeFiles: [],
        excludeAuthors: [],
        excludeEmails: [],
        whitespace: false,
        maxConcurrency: 2,
        copyMove: 4,
      },
      personDbBaseline: result.personDbBaseline,
      files: [blameTarget.path],
      asOfCommit: result.resolvedAsOfOid,
    })

    assert.equal(blame.fileBlames.length, 1)
    assert.equal(blame.fileBlames[0].path, blameTarget.path)
    assert.equal(blame.fileBlames[0].lines.length > 0, true)
    assert.equal(blame.authorSummaries.length > 0, true)
  })
})
