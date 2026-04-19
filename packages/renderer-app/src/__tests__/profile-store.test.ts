import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  ORIGIN_SYSTEM,
  type PersistedCourse,
  persistedCourseKind,
  type RosterMember,
  SYSTEM_TYPE_INDIVIDUAL_STUDENTS,
} from "@repo-edu/domain/types"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js"
import { useCourseStore } from "../stores/course-store.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeProfile(courseId = "course-1"): PersistedCourse {
  return {
    kind: persistedCourseKind,
    revision: 0,
    id: courseId,
    displayName: "Test Course",
    lmsConnectionName: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 2,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [
        {
          id: "s-1",
          name: "Ada Lovelace",
          email: "ada@example.edu",
          studentNumber: "1001",
          gitUsername: "ada",
          gitUsernameStatus: "valid",
          status: "active",
          lmsStatus: "active",
          lmsUserId: "lms-1",
          enrollmentType: "student",
          enrollmentDisplay: "Student",
          department: null,
          institution: null,
          source: "seed",
        },
      ],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: {
      kind: "remote",
      owner: "repo-edu",
      name: "starter",
      visibility: "private",
    },
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-03-05T00:00:00.000Z",
  }
}

function makeStudent(id: string, name: string): RosterMember {
  return {
    id,
    name,
    email: `${id}@example.edu`,
    studentNumber: null,
    gitUsername: null,
    gitUsernameStatus: "unknown",
    status: "active",
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: "student",
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "test",
  }
}

beforeEach(() => {
  clearWorkflowClient()
  useCourseStore.getState().clear()
})

describe("course store", () => {
  it("tracks async load checkpoints and stores the loaded course", async () => {
    const gate = deferred<PersistedCourse>()
    const client = createWorkflowClient({
      "course.load": async ({ courseId }) => {
        const course = await gate.promise
        return { ...course, id: courseId }
      },
      "course.save": async (course) => course,
    })
    setWorkflowClient(client as unknown as WorkflowClient)

    const loadPromise = useCourseStore.getState().load("course-a")
    assert.equal(useCourseStore.getState().status, "loading")

    gate.resolve(makeProfile())
    await loadPromise

    const state = useCourseStore.getState()
    assert.equal(state.status, "loaded")
    assert.equal(state.course?.id, "course-a")
    assert.equal(state.history.length, 0)
    assert.equal(state.future.length, 0)
  })

  it("supports undo and redo for roster mutations", async () => {
    const course = makeProfile()
    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useCourseStore.getState().load(course.id)

    useCourseStore.getState().addMember(makeStudent("s-2", "Grace Hopper"))
    assert.equal(useCourseStore.getState().course?.roster.students.length, 2)
    assert.equal(useCourseStore.getState().history.length, 1)

    const undone = useCourseStore.getState().undo()
    assert.equal(undone?.description, "Add Grace Hopper")
    assert.equal(useCourseStore.getState().course?.roster.students.length, 1)
    assert.equal(useCourseStore.getState().future.length, 1)

    const redone = useCourseStore.getState().redo()
    assert.equal(redone?.description, "Add Grace Hopper")
    assert.equal(useCourseStore.getState().course?.roster.students.length, 2)
    assert.equal(useCourseStore.getState().history.length, 1)
  })

  it("clears redo history after a new mutation following undo", async () => {
    const course = makeProfile()
    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useCourseStore.getState().load(course.id)

    useCourseStore.getState().addMember(makeStudent("s-2", "Grace Hopper"))
    useCourseStore.getState().addMember(makeStudent("s-3", "Linus Torvalds"))
    assert.equal(useCourseStore.getState().history.length, 2)

    useCourseStore.getState().undo()
    assert.equal(useCourseStore.getState().future.length, 1)

    useCourseStore.getState().addMember(makeStudent("s-4", "Alan Turing"))
    assert.equal(useCourseStore.getState().future.length, 0)
    assert.equal(useCourseStore.getState().history.length, 2)
  })

  it("records exactly one undo entry for full setRoster replacement", async () => {
    const course = makeProfile()
    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useCourseStore.getState().load(course.id)

    const nextRoster = {
      ...course.roster,
      students: [...course.roster.students, makeStudent("s-2", "Grace Hopper")],
    }
    useCourseStore.getState().setRoster(nextRoster, "Import students from file")

    assert.equal(useCourseStore.getState().history.length, 1)
    assert.equal(useCourseStore.getState().future.length, 0)
    assert.equal(useCourseStore.getState().course?.roster.students.length, 2)

    const undone = useCourseStore.getState().undo()
    assert.equal(undone?.description, "Import students from file")
    assert.equal(useCourseStore.getState().history.length, 0)
    assert.equal(useCourseStore.getState().future.length, 1)
    assert.equal(useCourseStore.getState().course?.roster.students.length, 1)
  })

  it("undo/redo restores unnamed import snapshots and keeps team ids monotonic", async () => {
    const course = makeProfile()
    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useCourseStore.getState().load(course.id)

    const baselineCourse = useCourseStore.getState().course
    assert.ok(baselineCourse)
    const baselineRoster = baselineCourse.roster
    const baselineGroupSetIds = baselineRoster.groupSets
      .map((groupSet) => groupSet.id)
      .sort()

    const importedGroupSet = {
      id: "gs_9001",
      name: "RepoBee Teams",
      nameMode: "unnamed" as const,
      teams: [
        { id: "ut_0001", gitUsernames: ["alice", "bob"] },
        { id: "ut_0002", gitUsernames: ["carol"] },
      ],
      connection: {
        kind: "import" as const,
        sourceFilename: "students.txt",
        sourcePath: null,
        lastUpdated: "2026-03-06T10:00:00.000Z",
      },
      repoNameTemplate: "{assignment}-{members}",
      columnVisibility: {},
      columnSizing: {},
    }

    const importedRoster: PersistedCourse["roster"] = {
      ...baselineRoster,
      groupSets: [...baselineRoster.groupSets, importedGroupSet],
    }

    useCourseStore
      .getState()
      .setRoster(importedRoster, "Import group set from file")
    useCourseStore.getState().setIdSequences({
      ...baselineCourse.idSequences,
      nextTeamSeq: 3,
    })

    assert.equal(useCourseStore.getState().history.length, 1)
    assert.equal(
      useCourseStore.getState().course?.roster.groupSets.length,
      baselineRoster.groupSets.length + 1,
    )
    assert.equal(useCourseStore.getState().course?.idSequences.nextTeamSeq, 3)

    const undone = useCourseStore.getState().undo()
    assert.equal(undone?.description, "Import group set from file")
    const undoneGroupSetIds = (
      useCourseStore.getState().course?.roster.groupSets ?? []
    )
      .map((groupSet) => groupSet.id)
      .sort()
    assert.deepStrictEqual(undoneGroupSetIds, baselineGroupSetIds)
    assert.equal(useCourseStore.getState().course?.idSequences.nextTeamSeq, 3)

    const redone = useCourseStore.getState().redo()
    assert.equal(redone?.description, "Import group set from file")
    const redoneSet = useCourseStore
      .getState()
      .course?.roster.groupSets.find((groupSet) => groupSet.id === "gs_9001")
    assert.equal(redoneSet?.nameMode, "unnamed")
    if (redoneSet?.nameMode === "unnamed") {
      assert.deepStrictEqual(
        redoneSet.teams.map((team) => team.gitUsernames),
        [["alice", "bob"], ["carol"]],
      )
    }
    assert.equal(useCourseStore.getState().course?.idSequences.nextTeamSeq, 3)
  })

  it("undo/redo restores unnamed reimport snapshots and keeps team ids monotonic", async () => {
    const course = makeProfile()
    course.roster.groupSets = [
      {
        id: "gs_0001",
        name: "RepoBee Teams",
        nameMode: "unnamed",
        teams: [
          { id: "ut_0001", gitUsernames: ["alice", "bob"] },
          { id: "ut_0002", gitUsernames: ["carol"] },
        ],
        connection: {
          kind: "import",
          sourceFilename: "students.txt",
          sourcePath: null,
          lastUpdated: "2026-03-06T10:00:00.000Z",
        },
        repoNameTemplate: "{assignment}-{members}",
        columnVisibility: {},
        columnSizing: {},
      },
    ]
    course.idSequences = {
      ...course.idSequences,
      nextGroupSetSeq: 2,
      nextTeamSeq: 3,
    }

    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useCourseStore.getState().load(course.id)

    const baselineCourse = useCourseStore.getState().course
    assert.ok(baselineCourse)
    const baselineRoster = baselineCourse.roster
    const targetGroupSet = baselineRoster.groupSets.find(
      (groupSet) => groupSet.id === "gs_0001",
    )
    assert.ok(targetGroupSet)
    assert.equal(targetGroupSet?.nameMode, "unnamed")
    if (!targetGroupSet || targetGroupSet.nameMode !== "unnamed") {
      return
    }

    const reimportedRoster: PersistedCourse["roster"] = {
      ...baselineRoster,
      groupSets: baselineRoster.groupSets.map((groupSet) => {
        if (
          groupSet.id !== targetGroupSet.id ||
          groupSet.nameMode !== "unnamed"
        ) {
          return groupSet
        }
        return {
          ...groupSet,
          teams: [
            { id: "ut_0003", gitUsernames: ["zoe"] },
            { id: "ut_0004", gitUsernames: ["yan", "xiu"] },
          ],
          connection: {
            kind: "import",
            sourceFilename: "students.txt",
            sourcePath: null,
            lastUpdated: "2026-03-06T11:00:00.000Z",
          },
        }
      }),
    }

    useCourseStore
      .getState()
      .setRoster(reimportedRoster, 'Import into group set "RepoBee Teams"')
    useCourseStore.getState().setIdSequences({
      ...baselineCourse.idSequences,
      nextTeamSeq: 5,
    })

    const afterApply = useCourseStore
      .getState()
      .course?.roster.groupSets.find((groupSet) => groupSet.id === "gs_0001")
    assert.equal(afterApply?.nameMode, "unnamed")
    if (afterApply?.nameMode === "unnamed") {
      assert.deepStrictEqual(
        afterApply.teams.map((team) => team.gitUsernames),
        [["zoe"], ["yan", "xiu"]],
      )
    }
    assert.equal(useCourseStore.getState().course?.idSequences.nextTeamSeq, 5)

    const undone = useCourseStore.getState().undo()
    assert.equal(undone?.description, 'Import into group set "RepoBee Teams"')
    const afterUndo = useCourseStore
      .getState()
      .course?.roster.groupSets.find((groupSet) => groupSet.id === "gs_0001")
    assert.equal(afterUndo?.nameMode, "unnamed")
    if (afterUndo?.nameMode === "unnamed") {
      assert.deepStrictEqual(
        afterUndo.teams.map((team) => team.gitUsernames),
        [["alice", "bob"], ["carol"]],
      )
    }
    assert.equal(useCourseStore.getState().course?.idSequences.nextTeamSeq, 5)

    const redone = useCourseStore.getState().redo()
    assert.equal(redone?.description, 'Import into group set "RepoBee Teams"')
    const afterRedo = useCourseStore
      .getState()
      .course?.roster.groupSets.find((groupSet) => groupSet.id === "gs_0001")
    assert.equal(afterRedo?.nameMode, "unnamed")
    if (afterRedo?.nameMode === "unnamed") {
      assert.deepStrictEqual(
        afterRedo.teams.map((team) => team.gitUsernames),
        [["zoe"], ["yan", "xiu"]],
      )
    }
    assert.equal(useCourseStore.getState().course?.idSequences.nextTeamSeq, 5)
  })

  it("normalizes individual-student system group names during load", async () => {
    const course = makeProfile()
    course.roster.students = [makeStudent("s-1", "Berg, S.O.S. van den")]
    course.roster.groups = [
      {
        id: "g-system-1",
        name: "s-o-s.van-den-berg",
        memberIds: ["s-1"],
        origin: ORIGIN_SYSTEM,
        lmsGroupId: null,
      },
    ]
    course.roster.groupSets = [
      {
        id: "gs-system-individual",
        name: "Individual Students",
        groupIds: ["g-system-1"],
        connection: {
          kind: "system",
          systemType: SYSTEM_TYPE_INDIVIDUAL_STUDENTS,
        },
        nameMode: "named",
        repoNameTemplate: null,
        columnVisibility: {},
        columnSizing: {},
      },
    ]

    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useCourseStore.getState().load(course.id)

    const renamedGroup = useCourseStore
      .getState()
      .course?.roster.groups.find((group) => group.id === "g-system-1")
    assert.equal(renamedGroup?.name, "s.o.s.van.den.berg")
  })

  it("keeps local updates and reports save errors via sync state", async () => {
    const course = makeProfile()
    const client = createWorkflowClient({
      "course.load": async () => course,
      "course.save": async () => {
        throw new Error("save failed")
      },
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useCourseStore.getState().load(course.id)

    useCourseStore.getState().setDisplayName("Renamed Course")
    assert.equal(
      useCourseStore.getState().course?.displayName,
      "Renamed Course",
    )

    const result = await useCourseStore.getState().save()
    assert.equal(result, false)
    assert.equal(useCourseStore.getState().syncState, "error")
    assert.equal(useCourseStore.getState().syncError, "save failed")
  })
})
