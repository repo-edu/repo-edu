import type { Roster } from "@repo-edu/domain/types"
import { applyPatches, produceWithPatches } from "immer"
import type {
  CourseActions,
  HistoryEntry,
  StoreGet,
  StoreInternals,
  StoreSet,
} from "./types.js"
import { HISTORY_LIMIT } from "./types.js"

export function createHistorySlice(
  set: StoreSet,
  get: StoreGet,
  internals: StoreInternals,
): {
  mutateRoster: StoreInternals["mutateRoster"]
  actions: Pick<CourseActions, "undo" | "redo" | "clearHistory">
} {
  /** Apply a roster mutation with undo/redo history tracking. */
  function mutateRoster(
    description: string,
    mutator: (roster: Roster) => void,
  ) {
    const state = get()
    if (!state.course) return

    const [nextRoster, patches, inversePatches] = produceWithPatches(
      state.course.roster,
      mutator,
    )

    if (patches.length === 0) return

    set((draft) => {
      if (!draft.course) return
      draft.course.roster = nextRoster as Roster
      draft.course.updatedAt = new Date().toISOString()
      draft.history.push({ patches, inversePatches, description })
      if (draft.history.length > HISTORY_LIMIT) {
        draft.history.splice(0, draft.history.length - HISTORY_LIMIT)
      }
      draft.future = []
      draft.checksDirty = true
    })
    internals.markCourseMutated()
  }

  return {
    mutateRoster,
    actions: {
      undo: () => {
        const state = get()
        if (state.history.length === 0 || !state.course) return null
        const entry = state.history[state.history.length - 1] as HistoryEntry
        const nextRoster = applyPatches(
          state.course.roster,
          entry.inversePatches,
        )
        set((draft) => {
          if (!draft.course) return
          draft.course.roster = nextRoster as Roster
          draft.course.updatedAt = new Date().toISOString()
          draft.history.pop()
          draft.future.push(entry)
          draft.checksDirty = true
        })
        internals.markCourseMutated()
        return entry
      },

      redo: () => {
        const state = get()
        if (state.future.length === 0 || !state.course) return null
        const entry = state.future[state.future.length - 1] as HistoryEntry
        const nextRoster = applyPatches(state.course.roster, entry.patches)
        set((draft) => {
          if (!draft.course) return
          draft.course.roster = nextRoster as Roster
          draft.course.updatedAt = new Date().toISOString()
          draft.future.pop()
          draft.history.push(entry)
          draft.checksDirty = true
        })
        internals.markCourseMutated()
        return entry
      },

      clearHistory: () => {
        set((draft) => {
          draft.history = []
          draft.future = []
        })
      },
    },
  }
}
