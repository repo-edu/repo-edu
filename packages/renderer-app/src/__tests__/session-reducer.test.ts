import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  idleSyncStatus,
  savingSyncStatus,
} from "../persistence/create-persister.js"
import {
  createInitialSessionSnapshot,
  sessionReducer,
} from "../session/session-reducer.js"

describe("session reducer", () => {
  it("treats disposal as terminal in the session reducer", () => {
    const disposed = sessionReducer(createInitialSessionSnapshot(), {
      type: "dispose",
    })
    assert.equal(disposed.disposed, true)

    // A queued transition that resolved past dispose must not re-arm pending.
    const reArmed = sessionReducer(disposed, {
      type: "enter-start",
      requestId: 1,
      targetSurface: { kind: "course", courseId: "course-b" },
      leavingCourseId: null,
    })
    assert.equal(reArmed, disposed)
    assert.equal(reArmed.pending, null)
  })

  it("derives settings sync status from both settings workers", () => {
    let state = createInitialSessionSnapshot()

    state = sessionReducer(state, {
      type: "set-sync-status",
      scope: "credentials",
      status: { state: "error", message: "Could not save app credentials." },
    })
    assert.equal(state.settingsSyncStatus.state, "error")
    assert.equal(
      state.settingsSyncStatus.message,
      "Could not save app credentials.",
    )

    state = sessionReducer(state, {
      type: "set-sync-status",
      scope: "preferences",
      status: idleSyncStatus,
    })
    assert.equal(state.settingsSyncStatus.state, "error")
    assert.equal(
      state.settingsSyncStatus.message,
      "Could not save app credentials.",
    )

    state = sessionReducer(state, {
      type: "dismiss-sync-error",
      scope: "settings",
    })
    assert.equal(state.credentialsSyncStatus.state, "idle")
    assert.equal(state.preferencesSyncStatus.state, "idle")
    assert.equal(state.settingsSyncStatus.state, "idle")

    state = sessionReducer(state, {
      type: "set-sync-status",
      scope: "preferences",
      status: savingSyncStatus,
    })
    assert.equal(state.settingsSyncStatus.state, "saving")
  })
})
