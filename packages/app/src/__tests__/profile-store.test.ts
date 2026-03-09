import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  createWorkflowClient,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  type PersistedProfile,
  persistedProfileKind,
  type RosterMember,
} from "@repo-edu/domain"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "../contexts/workflow-client.js"
import { useProfileStore } from "../stores/profile-store.js"
import { useToastStore } from "../stores/toast-store.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeProfile(profileId = "profile-1"): PersistedProfile {
  return {
    kind: persistedProfileKind,
    schemaVersion: 2,
    id: profileId,
    displayName: "Test Profile",
    lmsConnectionName: null,
    gitConnectionName: "git-main",
    courseId: null,
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
      owner: "repo-edu",
      name: "starter",
      visibility: "private",
    },
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
  useProfileStore.getState().clear()
  useToastStore.getState().clearToasts()
})

describe("profile store", () => {
  it("tracks async load checkpoints and stores the loaded profile", async () => {
    const gate = deferred<PersistedProfile>()
    const client = createWorkflowClient({
      "profile.load": async ({ profileId }) => {
        const profile = await gate.promise
        return { ...profile, id: profileId }
      },
      "profile.save": async (profile) => profile,
    })
    setWorkflowClient(client as unknown as WorkflowClient)

    const loadPromise = useProfileStore.getState().load("profile-a")
    assert.equal(useProfileStore.getState().status, "loading")

    gate.resolve(makeProfile())
    await loadPromise

    const state = useProfileStore.getState()
    assert.equal(state.status, "loaded")
    assert.equal(state.profile?.id, "profile-a")
    assert.equal(state.history.length, 0)
    assert.equal(state.future.length, 0)
  })

  it("supports undo and redo for roster mutations", async () => {
    const profile = makeProfile()
    const client = createWorkflowClient({
      "profile.load": async () => profile,
      "profile.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useProfileStore.getState().load(profile.id)

    useProfileStore.getState().addMember(makeStudent("s-2", "Grace Hopper"))
    assert.equal(useProfileStore.getState().profile?.roster.students.length, 2)
    assert.equal(useProfileStore.getState().history.length, 1)

    const undone = useProfileStore.getState().undo()
    assert.equal(undone?.description, "Add Grace Hopper")
    assert.equal(useProfileStore.getState().profile?.roster.students.length, 1)
    assert.equal(useProfileStore.getState().future.length, 1)

    const redone = useProfileStore.getState().redo()
    assert.equal(redone?.description, "Add Grace Hopper")
    assert.equal(useProfileStore.getState().profile?.roster.students.length, 2)
    assert.equal(useProfileStore.getState().history.length, 1)
  })

  it("clears redo history after a new mutation following undo", async () => {
    const profile = makeProfile()
    const client = createWorkflowClient({
      "profile.load": async () => profile,
      "profile.save": async (current) => current,
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useProfileStore.getState().load(profile.id)

    useProfileStore.getState().addMember(makeStudent("s-2", "Grace Hopper"))
    useProfileStore.getState().addMember(makeStudent("s-3", "Linus Torvalds"))
    assert.equal(useProfileStore.getState().history.length, 2)

    useProfileStore.getState().undo()
    assert.equal(useProfileStore.getState().future.length, 1)

    useProfileStore.getState().addMember(makeStudent("s-4", "Alan Turing"))
    assert.equal(useProfileStore.getState().future.length, 0)
    assert.equal(useProfileStore.getState().history.length, 2)
  })

  it("keeps local updates and reports save errors via toast", async () => {
    const profile = makeProfile()
    const client = createWorkflowClient({
      "profile.load": async () => profile,
      "profile.save": async () => {
        throw new Error("save failed")
      },
    })
    setWorkflowClient(client as unknown as WorkflowClient)
    await useProfileStore.getState().load(profile.id)

    useProfileStore.getState().setDisplayName("Renamed Profile")
    assert.equal(
      useProfileStore.getState().profile?.displayName,
      "Renamed Profile",
    )

    const result = await useProfileStore.getState().save()
    assert.equal(result, false)
    assert.equal(useToastStore.getState().toasts.length, 1)
    assert.equal(useToastStore.getState().toasts[0]?.message, "save failed")
  })
})
