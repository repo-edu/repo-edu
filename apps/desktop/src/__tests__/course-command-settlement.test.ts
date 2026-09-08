import assert from "node:assert/strict"
import { it } from "node:test"
import { createCourseWorkflowHandlers } from "@repo-edu/application"
import {
  type CourseChangingCommandId,
  type ExclusiveRequestOperation,
  exclusiveCommandDeclarations,
  type WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  waitForSnapshot,
  workflowClient,
} from "../../../../packages/renderer-app/src/__tests__/session-controller.test-support"
import { useCourseStore } from "../../../../packages/renderer-app/src/stores/course-store"
import { HostAdmission } from "../host-admission"
import type { HostRequest } from "../host-admission-model"
import { executeHostCommand } from "../host-command-execution"
import { settleHostCommand } from "../host-command-settlement"
import { createHostRequestTransport } from "../host-request-transport"
import { createPreloadRequestTransport } from "../preload-request-transport"
import { createRendererCommandClient } from "../renderer-command-client"
import { commandPayloadSchemas } from "../request-command-schemas"
import { commitRequestPersistence } from "../request-persistence"
import { assertCommandFreeze } from "./command-freeze-assertions"
import { requestChannel, until } from "./request-port-harness"

const file = {
  kind: "user-file-ref" as const,
  referenceId: "file",
  displayName: "import.csv",
  mediaType: "text/csv",
  byteLength: 0,
}

const commands = [
  "roster.importFromFile",
  "groupSet.importFromFile",
  "gitUsernames.import",
  "repo.create",
  "repo.clone",
  "repo.update",
] as const satisfies readonly CourseChangingCommandId[]

it("covers the complete declared course command set", () => {
  assert.deepEqual(
    [...commands].sort(),
    Object.entries(exclusiveCommandDeclarations)
      .filter(([, declaration]) => declaration.courseTransition === "required")
      .map(([id]) => id)
      .sort(),
  )
})

function officialResult(
  command: CourseChangingCommandId,
  course: PersistedCourse,
) {
  const roster = structuredClone(course.roster)
  roster.groupSets[0]!.name = "Imported groups"
  const idSequences = { ...course.idSequences, nextGroupSeq: 20 }
  switch (command) {
    case "roster.importFromFile":
      return { roster, idSequences }
    case "groupSet.importFromFile":
      return { ...course, roster, idSequences }
    case "gitUsernames.import":
      return roster
    case "repo.create":
      return {
        repositoriesPlanned: 1,
        repositoriesCreated: 1,
        repositoriesAdopted: 0,
        repositoriesFailed: 0,
        templateCommitShas: { assignment: "created-sha" },
        recordedRepositories: { assignment: { g_0100: "created-repo" } },
        completedAt: course.updatedAt,
      }
    case "repo.clone":
      return {
        repositoriesPlanned: 1,
        repositoriesCloned: 1,
        repositoriesFailed: 0,
        recordedRepositories: { assignment: { g_0100: "cloned-repo" } },
        completedAt: course.updatedAt,
      }
    case "repo.update":
      return {
        repositoriesPlanned: 1,
        prsCreated: 1,
        prsSkipped: 0,
        prsFailed: 0,
        templateCommitSha: "updated-sha",
        recordedRepositories: { assignment: { g_0100: "updated-repo" } },
        completedAt: course.updatedAt,
      }
  }
}

for (const command of commands) {
  it(`${command} saves and applies the same complete course before release without a second save`, {
    timeout: 5000,
  }, async () => {
    resetStores()
    const channel = requestChannel()
    const save = deferred<void>()
    const publication = deferred<void>()
    const course = makeCourse("course")
    course.roster.groups = [
      {
        id: "g_0100",
        name: "Group",
        origin: "local",
        lmsGroupId: null,
        memberIds: [],
      },
    ]
    course.roster.groupSets = [
      {
        id: "gs_0100",
        name: "Original groups",
        nameMode: "named",
        groupIds: ["g_0100"],
        connection: null,
        repoNameTemplate: null,
        columnVisibility: {},
        columnSizing: {},
      },
    ]
    course.roster.assignments = [
      {
        id: "assignment",
        name: "Assignment",
        groupSetId: "gs_0100",
        repositories: { g_0100: "old-repo" },
        templateCommitSha: null,
      },
    ]
    let saved: PersistedCourse | undefined
    let release: HostRequest | undefined
    let writes = 0
    let captured: PersistedCourse | undefined
    const admission = new HostAdmission((effect) => {
      if (effect.type === "release-command") release = effect.request
    })
    const handlers = {
      ...createCourseWorkflowHandlers({
        async saveCourse(value) {
          writes += 1
          saved = structuredClone(value)
          await save.promise
          const stamp = {
            revision: value.revision + 1,
            updatedAt: "2026-09-07T13:00:00.000Z",
          }
          saved = { ...saved, ...stamp }
          return stamp
        },
        async loadCourse() {
          return null
        },
        async listCourses() {
          return []
        },
        async deleteCourse() {},
      }),
      [command]: async (input: { course: PersistedCourse }) => {
        captured = structuredClone(input.course)
        return officialResult(command, input.course)
      },
    } as WorkflowHandlerMap
    const host = createHostRequestTransport({
      admission,
      receive(request, message, signal) {
        if (message.type === "bundle")
          void commitRequestPersistence({
            request,
            bundle: message.bundle,
            admission,
            handlers,
            transport: host,
          })
        if (message.type === "input")
          void executeHostCommand({
            request,
            operation: message.input as ExclusiveRequestOperation,
            signal: signal!,
            admission,
            handlers,
            transport: host,
          })
        if (message.type === "acknowledged") {
          assert.deepEqual(useCourseStore.getState().course, saved)
          admission.dispatch({ type: "settlement-acknowledged", request })
        }
      },
    })
    const preload = createPreloadRequestTransport({
      channel(id) {
        return {
          renderer: channel.renderer,
          transfer() {
            host.acceptCommand(id, channel.host)
          },
        }
      },
      terminal(error) {
        admission.dispatch({ type: "terminal", error })
      },
    })
    const controller = startController({
      commandClient: createRendererCommandClient(preload.bridge),
      workflowClient: workflowClient(async (id) => {
        if (id === "settings.loadApp")
          return makeSettings({
            activeSurface: { kind: "course", courseId: course.id },
          })
        if (id === "course.load") return course
        throw new Error(`Unexpected ordinary workflow ${id}`)
      }),
      onBootstrapReady: async () => {
        admission.dispatch({ type: "bootstrap-acknowledged" })
      },
    })
    try {
      await waitForSnapshot(
        controller,
        (state) => state.bootstrap.status === "ready",
      )
      const before = structuredClone(useCourseStore.getState().course!)
      const credentials = controller.getSnapshot().settings.credentials
      const inputs = {
        "roster.importFromFile": { course: before, file },
        "groupSet.importFromFile": {
          course: before,
          file,
          format: "group-set-csv",
          targetGroupSetId: "gs_0100",
        },
        "gitUsernames.import": { course: before, credentials, file },
        "repo.create": {
          course: before,
          credentials,
          assignmentId: "assignment",
          template: null,
        },
        "repo.clone": {
          course: before,
          credentials,
          assignmentId: "assignment",
          template: null,
        },
        "repo.update": {
          course: before,
          credentials,
          assignmentId: "assignment",
        },
      }
      const running = controller.operations.execute(command, async (scope) => {
        await scope.run(command, inputs[command] as never)
        assert.deepEqual(useCourseStore.getState().course, saved)
        assert.throws(
          () =>
            scope.mutateCourse(course.id, (actions) =>
              actions.setDisplayName("Partial"),
            ),
          /partial course mutations/,
        )
        await publication.promise
      })
      await until(() => {
        const state = admission.getSnapshot()
        if (state.phase === "terminal") throw state.error
        return saved !== undefined
      })
      assert.equal(admission.getSnapshot().phase, "executing.settling")
      await assertCommandFreeze(controller)
      assert.deepEqual(useCourseStore.getState().course, before)
      assert.deepEqual(captured, before)
      assert.equal(release, undefined)
      save.resolve()
      await until(
        () =>
          useCourseStore.getState().course?.revision === before.revision + 1,
      )
      assert.deepEqual(useCourseStore.getState().course, saved)
      const applied = useCourseStore.getState().course!
      await assertCommandFreeze(controller)
      if (command.startsWith("repo.")) {
        const assignment = applied.roster.assignments[0]!
        assert.equal(
          assignment.repositories?.g_0100,
          command === "repo.create"
            ? "created-repo"
            : command === "repo.clone"
              ? "cloned-repo"
              : "updated-repo",
        )
        assert.equal(
          assignment.templateCommitSha,
          command === "repo.create"
            ? "created-sha"
            : command === "repo.clone"
              ? null
              : "updated-sha",
        )
      } else {
        assert.equal(applied.roster.groupSets[0]?.name, "Imported groups")
        if (command !== "gitUsernames.import")
          assert.equal(applied.idSequences.nextGroupSeq, 20)
      }
      assert.equal(release, undefined)
      publication.resolve()
      await until(() => release !== undefined)
      await assertCommandFreeze(controller)
      assert.equal(
        controller.operations.change(() => {}),
        false,
      )
      host.release(release!)
      await running
      await controller.flush()
      assert.equal(writes, 1)
      assert.equal(admission.getSnapshot().phase, "interactive")
      assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
      assert.ok(controller.undo(course.id))
      assert.deepEqual(useCourseStore.getState().course?.roster, before.roster)
      assert.equal(useCourseStore.getState().course?.revision, saved?.revision)
    } finally {
      controller.dispose()
      preload.dispose()
      host.dispose()
      channel.dispose()
    }
  })
}

it("refuses a partial course settlement on the wire", () => {
  assert.equal(
    commandPayloadSchemas("gitUsernames.import").settlement.safeParse({
      workflowId: "gitUsernames.import",
      outcome: {
        disposition: "completed",
        completion: {
          status: "succeeded",
          result: makeCourse("course").roster,
        },
      },
      authoritative: { course: { roster: makeCourse("course").roster } },
    }).success,
    false,
  )
})

for (const boundary of ["before", "after"] as const) {
  it(`makes failure ${boundary} the course result commit terminal without publishing a command result`, async () => {
    const admission = new HostAdmission(() => {})
    const request = { cancel() {} }
    admission.dispatch({ type: "bootstrap-acknowledged" })
    admission.dispatch({
      type: "exclusive-intent",
      command: "gitUsernames.import",
      request,
    })
    admission.dispatch({ type: "preparation-committed", request })
    let writes = 0
    let committed: PersistedCourse | undefined
    let settlements = 0
    await executeHostCommand({
      admission,
      request,
      signal: new AbortController().signal,
      operation: {
        workflowId: "gitUsernames.import",
        input: {
          course: makeCourse("course"),
          credentials: makeSettings().credentials,
          file,
        },
        settlementInput: undefined,
      },
      handlers: {
        "gitUsernames.import": async ({ course }) => course.roster,
        "course.save": async (value) => {
          writes += 1
          if (boundary === "after") committed = structuredClone(value)
          throw {
            type: "course-storage",
            reason: "storage-failure",
            message: "Row mismatch",
          }
        },
      } as WorkflowHandlerMap,
      transport: {
        progress() {},
        output() {},
        settlement() {
          settlements += 1
        },
      },
    })
    assert.equal(writes, 1)
    assert.deepEqual(
      committed,
      boundary === "after" ? makeCourse("course") : undefined,
    )
    assert.equal(settlements, 0)
    assert.equal(admission.getSnapshot().phase, "terminal")
  })
}

for (const disposition of ["stopped", "failed"] as const) {
  it(`persists the official course result of a known ${disposition} outcome`, async () => {
    const admission = new HostAdmission(() => {})
    const request = { cancel() {} }
    const course = makeCourse("course")
    admission.dispatch({ type: "bootstrap-acknowledged" })
    admission.dispatch({
      type: "exclusive-intent",
      command: "gitUsernames.import",
      request,
    })
    admission.dispatch({ type: "preparation-committed", request })
    admission.dispatch({ type: "input-prepared", request })
    const outcome =
      disposition === "stopped"
        ? { disposition: "stopped" as const, result: course.roster }
        : {
            disposition: "completed" as const,
            completion: {
              status: "failed" as const,
              error: { type: "effect" as const, message: "Known failure" },
              result: course.roster,
            },
          }
    admission.dispatch({
      type: "outcome-fixed",
      request,
      completion: {
        operation: {
          workflowId: "gitUsernames.import",
          input: { course, credentials: makeSettings().credentials, file },
          settlementInput: undefined,
        },
        outcome,
      },
    })
    const stamp = { revision: 1, updatedAt: "2026-09-07T13:00:00.000Z" }
    let saved: PersistedCourse | undefined
    await settleHostCommand(
      request,
      admission,
      {
        "course.save": async (value) => {
          saved = structuredClone(value)
          return stamp
        },
      } as WorkflowHandlerMap,
      {
        settlement(_request, value) {
          assert.deepEqual(value.outcome, outcome)
          assert.deepEqual(value.authoritative, {
            course: { ...saved, ...stamp },
          })
        },
      },
    )
    assert.deepEqual(saved, course)
  })
}
