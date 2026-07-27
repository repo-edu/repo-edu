import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { savingSyncStatus } from "../persistence/create-persister.js"
import { selectSettingsSyncStatus } from "../session/selectors.js"
import {
  createInitialSessionSnapshot,
  sessionReducer,
} from "../session/session-reducer.js"

describe("session reducer", () => {
  it("makes disposal terminal and rejects queued transaction starts", () => {
    let state = createInitialSessionSnapshot()
    state = sessionReducer(state, {
      type: "transaction-enter",
      turnId: 1,
      descriptor: {
        kind: "enter",
        targetSurface: { kind: "course", courseId: "course-b" },
        leavingCourseId: null,
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

    state = sessionReducer(state, { type: "close-start", attemptId: "close-1" })
    const refused = sessionReducer(state, {
      type: "preference",
      event: { type: "set-theme", theme: "light" },
    })
    assert.equal(refused, state)

    const staleRestore = sessionReducer(state, {
      type: "close-restore",
      attemptId: "close-0",
    })
    assert.equal(staleRestore, state)
    const restored = sessionReducer(state, {
      type: "close-restore",
      attemptId: "close-1",
    })
    assert.equal(restored.lifecycle.kind, "live")
  })

  it("admits settings status only for the active worker slot while closing", () => {
    let state = createInitialSessionSnapshot()
    state = sessionReducer(state, {
      type: "settings-workers-installed",
      credentialsWorkerId: 3,
      preferencesWorkerId: 4,
    })
    state = sessionReducer(state, { type: "close-start", attemptId: "close-1" })
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
    assert.equal(selectSettingsSyncStatus(state).state, "saving")
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
    assert.equal(selectSettingsSyncStatus(state).state, "error")
    state = sessionReducer(state, {
      type: "dismiss-sync-error",
      scope: "settings",
    })
    assert.equal(state.settings.credentialsSyncStatus.state, "idle")
    assert.equal(state.settings.preferencesSyncStatus.state, "idle")
  })
})
