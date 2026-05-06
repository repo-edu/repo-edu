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

function plannedGroupIds(
  plan: ReturnType<typeof planRepositoryOperation>,
): string[] {
  assert.equal(plan.ok, true)
  if (!plan.ok) {
    return []
  }
  return plan.value.groups.map((group) => group.groupId).sort()
}

describe("docs fixture integration: source parity", () => {
  it("supports canvas source overlays and source-sensitive workflows", async () => {
    const runtime = createDocsDemoRuntime({
      source: "canvas",
    })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(course.lmsConnectionName, "Canvas Demo")
    assert.equal(course.roster.connection?.kind, "canvas")

    const nonSystemGroupSets = course.roster.groupSets.filter(
      (groupSet) => groupSet.connection?.kind !== "system",
    )
    assert.ok(nonSystemGroupSets.length > 0)
    assert.ok(
      nonSystemGroupSets.every(
        (groupSet) => groupSet.connection?.kind === "canvas",
      ),
    )

    const nonSystemGroups = course.roster.groups.filter(
      (group) => group.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((group) => group.origin === "lms"))
    assert.ok(nonSystemGroups.every((group) => group.lmsGroupId !== null))

    const available = await runtime.workflowClient.run(
      "groupSet.fetchAvailableFromLms",
      { course, appSettings },
    )
    assert.equal(available.length > 0, true)

    const imported = await runtime.workflowClient.run("roster.importFromLms", {
      course,
      appSettings,
      lmsCourseId: runtime.seedCourseId,
    })
    assert.equal(imported.roster.connection?.kind, "canvas")
  })

  it("supports moodle source overlays and source-sensitive workflows", async () => {
    const runtime = createDocsDemoRuntime({
      source: "moodle",
    })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(course.lmsConnectionName, "Moodle Demo")
    assert.equal(course.roster.connection?.kind, "moodle")

    const nonSystemGroupSets = course.roster.groupSets.filter(
      (groupSet) => groupSet.connection?.kind !== "system",
    )
    assert.ok(nonSystemGroupSets.length > 0)
    assert.ok(
      nonSystemGroupSets.every(
        (groupSet) => groupSet.connection?.kind === "moodle",
      ),
    )
    assert.ok(
      nonSystemGroupSets.every(
        (groupSet) =>
          groupSet.connection?.kind === "moodle" &&
          "groupingId" in groupSet.connection,
      ),
    )

    const nonSystemGroups = course.roster.groups.filter(
      (group) => group.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((group) => group.origin === "lms"))
    assert.ok(nonSystemGroups.every((group) => group.lmsGroupId !== null))

    const available = await runtime.workflowClient.run(
      "groupSet.fetchAvailableFromLms",
      { course, appSettings },
    )
    assert.equal(available.length > 0, true)

    const imported = await runtime.workflowClient.run("roster.importFromLms", {
      course,
      appSettings,
      lmsCourseId: runtime.seedCourseId,
    })
    assert.equal(imported.roster.connection?.kind, "moodle")
  })

  it("rejects LMS workflows for file source overlays", async () => {
    const runtime = createDocsDemoRuntime({
      source: "file",
    })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
    assert.equal(course.roster.connection?.kind, "import")
    assert.equal(course.roster.students.length, 0)
    assert.equal(course.roster.staff.length, 0)
    assert.equal(course.roster.groups.length, 0)
    assert.equal(course.roster.assignments.length > 0, true)

    const importedRepoBeeSets = course.roster.groupSets.filter(
      (groupSet) =>
        groupSet.connection?.kind === "import" &&
        groupSet.nameMode === "unnamed",
    )
    assert.equal(importedRepoBeeSets.length > 0, true)
    assert.equal(
      importedRepoBeeSets.every((groupSet) => groupSet.teams.length > 0),
      true,
    )

    await assert.rejects(
      runtime.workflowClient.run("groupSet.fetchAvailableFromLms", {
        course,
        appSettings,
      }),
      (error: unknown) => isAppErrorWithType(error, "not-found"),
    )

    await assert.rejects(
      runtime.workflowClient.run("roster.importFromLms", {
        course,
        appSettings,
        lmsCourseId: runtime.seedCourseId,
      }),
      (error: unknown) => isAppErrorWithType(error, "not-found"),
    )
  })
})

describe("docs fixture integration: repository planning by fixed task setup", () => {
  it("api-design and api-implementation share one group set and match repo.create count", async () => {
    const runtime = createDocsDemoRuntime({
      source: "canvas",
    })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    const designPlan = planRepositoryOperation(course, "a1", "create")
    const implPlan = planRepositoryOperation(course, "a2", "create")

    const designGroupIds = plannedGroupIds(designPlan)
    const implGroupIds = plannedGroupIds(implPlan)
    assert.deepEqual(designGroupIds, implGroupIds)
    assert.equal(designGroupIds.length > 0, true)

    const designResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "a1",
      template: null,
    })
    assert.equal(designResult.repositoriesPlanned, designGroupIds.length)

    const implResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "a2",
      template: null,
    })
    assert.equal(implResult.repositoriesPlanned, implGroupIds.length)
  })

  it("data-pipeline isolates its group population from web-api and matches repo.create count", async () => {
    const runtime = createDocsDemoRuntime({
      source: "canvas",
    })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    const designPlan = planRepositoryOperation(course, "a1", "create")
    const pipelinePlan = planRepositoryOperation(course, "a3", "create")

    const designGroupIds = plannedGroupIds(designPlan)
    const pipelineGroupIds = plannedGroupIds(pipelinePlan)
    const overlap = designGroupIds.filter((groupId) =>
      pipelineGroupIds.includes(groupId),
    )
    assert.deepEqual(overlap, [])
    assert.equal(designGroupIds.length > 0, true)
    assert.equal(pipelineGroupIds.length > 0, true)

    const designResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "a1",
      template: null,
    })
    assert.equal(designResult.repositoriesPlanned, designGroupIds.length)

    const pipelineResult = await runtime.workflowClient.run("repo.create", {
      course,
      appSettings,
      assignmentId: "a3",
      template: null,
    })
    assert.equal(pipelineResult.repositoriesPlanned, pipelineGroupIds.length)
  })
})

describe("docs fixture integration: recorded analysis git mocks", () => {
  it("seeds an analysis document and supports discovery, filtered log analysis, and blame", async () => {
    const runtime = createDocsDemoRuntime({
      source: "canvas",
    })
    const documents = await runtime.workflowClient.run(
      "documents.list",
      undefined,
    )
    const analysisSummary = documents.find(
      (document) =>
        document.kind === "analysis" &&
        document.displayName === "Arithmetic Expression Evaluator",
    )
    assert.ok(analysisSummary)

    const analysis = await runtime.workflowClient.run("analyses.load", {
      analysisId: analysisSummary.id,
    })
    assert.equal(analysis.searchFolder, runtime.analysisFixtureRootPath)
    assert.deepEqual(analysis.analysisInputs.extensions, ["py"])

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
        "adeyemi-lindqvist-ramaswamy",
        "eriksen-okafor-raman",
        "lindqvist-okafor-tanaka",
      ],
    )

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
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
