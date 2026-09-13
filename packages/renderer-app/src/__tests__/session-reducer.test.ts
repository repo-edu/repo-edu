import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { savingSyncStatus } from "../persistence/create-persister.js"
import {
  selectSettingsSyncState,
  selectUserActionIsWaiting,
} from "../session/selectors.js"
import {
  canAdmitCourseMutation,
  canAdmitSessionChange,
  createInitialSessionSnapshot,
  type SessionTransactionDescriptor,
  sessionReducer,
} from "../session/session-reducer.js"

describe("session reducer", () => {
  const waitingCases: {
    descriptor: SessionTransactionDescriptor
    visible: boolean
  }[] = [
    { descriptor: { kind: "command", operation: "repo.clone" }, visible: true },
    {
      descriptor: {
        kind: "enter",
        targetSurface: { kind: "course", courseId: "course-b" },
      },
      visible: true,
    },
    {
      descriptor: {
        kind: "create",
        targetSurface: { kind: "course", courseId: "course-b" },
      },
      visible: true,
    },
    { descriptor: { kind: "duplicate" }, visible: true },
    { descriptor: { kind: "rename" }, visible: true },
    {
      descriptor: {
        kind: "delete",
        courseId: "course-a",
        blocksCourseMutation: true,
      },
      visible: true,
    },
    {
      descriptor: { kind: "operation", operation: "course.list" },
      visible: false,
    },
    { descriptor: { kind: "bootstrap" }, visible: false },
    { descriptor: { kind: "close" }, visible: false },
  ]

  for (const { descriptor, visible } of waitingCases) {
    it(`${visible ? "shows" : "hides"} a queued ${descriptor.kind} in the waiting display`, () => {
      let state = createInitialSessionSnapshot()
      const running = {
        kind: "operation",
        operation: "analysis.discoverRepos",
      } as const
      state = sessionReducer(state, {
        type: "transaction-enter",
        turnId: 1,
        descriptor: running,
      })
      state = sessionReducer(state, {
        type: "transaction-start",
        turnId: 1,
        descriptor: running,
      })
      assert.equal(selectUserActionIsWaiting(state), false)
      if (descriptor.kind === "close") {
        state = sessionReducer(state, { type: "close-start" })
      }
      state = sessionReducer(state, {
        type: "transaction-enter",
        turnId: 2,
        descriptor,
      })
      assert.equal(state.transactions.admitted.has(2), true)
      assert.equal(selectUserActionIsWaiting(state), visible)

      state = sessionReducer(state, { type: "transaction-retire", turnId: 1 })
      assert.equal(selectUserActionIsWaiting(state), visible)
      state = sessionReducer(state, {
        type: "transaction-start",
        turnId: 2,
        descriptor,
      })
      assert.equal(state.transactions.runningTurnId, 2)
      assert.equal(selectUserActionIsWaiting(state), false)
      state = sessionReducer(state, { type: "transaction-retire", turnId: 2 })
      assert.equal(selectUserActionIsWaiting(state), false)
    })
  }

  it("holds one global freeze from command admission through retirement", () => {
    let state = createInitialSessionSnapshot()
    state = {
      ...state,
      settings: {
        ...state.settings,
        preferences: {
          ...state.settings.preferences,
          activeSurface: { kind: "course", courseId: "course-a" },
        },
      },
    }
    const descriptor = { kind: "command", operation: "repo.clone" } as const
    state = sessionReducer(state, {
      type: "transaction-enter",
      turnId: 1,
      descriptor,
    })
    for (const current of [
      state,
      sessionReducer(state, {
        type: "transaction-start",
        turnId: 1,
        descriptor,
      }),
    ]) {
      assert.equal(canAdmitSessionChange(current), false)
      assert.equal(canAdmitCourseMutation(current, "course-a"), false)
      for (const event of [
        { type: "preference", event: { type: "set-theme", theme: "dark" } },
        {
          type: "credential",
          event: { type: "set-active-git-connection", id: "git" },
        },
        {
          type: "transaction-enter",
          turnId: 2,
          descriptor: { kind: "duplicate" },
        },
      ] as const)
        assert.equal(sessionReducer(current, event), current)
    }
    state = sessionReducer(state, { type: "transaction-retire", turnId: 1 })
    assert.equal(canAdmitSessionChange(state), true)
    assert.equal(canAdmitCourseMutation(state, "course-a"), true)
  })

  for (const kind of ["enter", "create"] as const) {
    it(`derives the course edit gate from the active and target courses during ${kind}`, () => {
      let state = createInitialSessionSnapshot()
      state = sessionReducer(state, {
        type: "preference",
        event: {
          type: "set-navigation",
          surface: { kind: "course", courseId: "course-a" },
          tab: "roster",
        },
      })
      const targetSurface = { kind: "course", courseId: "course-b" } as const
      const descriptor = { kind, targetSurface }
      state = sessionReducer(state, {
        type: "transaction-enter",
        turnId: 1,
        descriptor,
      })
      state = sessionReducer(state, {
        type: "transaction-start",
        turnId: 1,
        descriptor,
      })
      assert.equal(canAdmitCourseMutation(state, "course-a"), false)
      assert.equal(canAdmitCourseMutation(state, "course-b"), false)
      state = sessionReducer(state, {
        type: "surface-commit",
        turnId: 1,
        surface: targetSurface,
        tab: "roster",
        courseLoadStatus: { state: "loaded", message: null },
        preferenceEvents: [],
      })
      assert.equal(canAdmitCourseMutation(state, "course-a"), false)
      assert.equal(canAdmitCourseMutation(state, "course-b"), true)
    })
  }

  it("makes disposal terminal and rejects queued transaction starts", () => {
    let state = createInitialSessionSnapshot()
    state = sessionReducer(state, {
      type: "transaction-enter",
      turnId: 1,
      descriptor: {
        kind: "enter",
        targetSurface: { kind: "course", courseId: "course-b" },
      },
    })
    const disposed = sessionReducer(state, { type: "dispose" })
    assert.equal(disposed.lifecycle.kind, "disposed")
    assert.equal(disposed.transactions.admitted.size, 0)

    const rearmed = sessionReducer(disposed, {
      type: "transaction-start",
      turnId: 1,
      descriptor: { kind: "duplicate" },
    })
    assert.equal(rearmed, disposed)
  })

  it("closes external settings input in one lifecycle transition", () => {
    let state = createInitialSessionSnapshot()
    state = sessionReducer(state, {
      type: "preference",
      event: { type: "set-theme", theme: "dark" },
    })
    assert.equal(state.settings.preferences.appearance.theme, "dark")

    state = sessionReducer(state, { type: "close-start" })
    const refused = sessionReducer(state, {
      type: "preference",
      event: { type: "set-theme", theme: "light" },
    })
    assert.equal(refused, state)
    const repeated = sessionReducer(state, { type: "close-start" })
    assert.equal(repeated, state)
    assert.equal(repeated.lifecycle.kind, "closing")
  })

  it("admits settings status only for the active worker slot while closing", () => {
    let state = createInitialSessionSnapshot()
    state = sessionReducer(state, {
      type: "settings-workers-installed",
      credentialsWorkerId: 3,
      preferencesWorkerId: 4,
    })
    state = sessionReducer(state, { type: "close-start" })
    const stale = sessionReducer(state, {
      type: "settings-worker-status",
      scope: "preferences",
      workerId: 2,
      status: savingSyncStatus,
    })
    assert.equal(stale, state)

    state = sessionReducer(state, {
      type: "settings-worker-status",
      scope: "preferences",
      workerId: 4,
      status: savingSyncStatus,
    })
    assert.equal(selectSettingsSyncState(state), "saving")
  })

  it("dismisses both document errors with one root event", () => {
    let state = createInitialSessionSnapshot()
    state = sessionReducer(state, {
      type: "settings-workers-installed",
      credentialsWorkerId: 1,
      preferencesWorkerId: 2,
    })
    for (const [scope, workerId] of [
      ["credentials", 1],
      ["preferences", 2],
    ] as const) {
      state = sessionReducer(state, {
        type: "settings-worker-status",
        scope,
        workerId,
        status: { state: "error", message: `${scope} failed` },
      })
    }
    assert.equal(selectSettingsSyncState(state), "error")
    state = sessionReducer(state, {
      type: "dismiss-sync-error",
      scope: "settings",
    })
    assert.equal(state.settings.credentialsSyncStatus.state, "idle")
    assert.equal(state.settings.preferencesSyncStatus.state, "idle")
  })
})
