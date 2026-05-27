import { enablePatches } from "immer"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { createHistorySlice } from "./slices/history.js"
import { createLifecycleSlice } from "./slices/lifecycle.js"
import { createMetadataActionsSlice } from "./slices/metadata-actions.js"
import { createRosterActionsSlice } from "./slices/roster-actions.js"
import type {
  CourseActions,
  CourseState,
  StoreInternals,
} from "./slices/types.js"
import { initialState } from "./slices/types.js"

enablePatches()

export type { CourseActions, CourseState } from "./slices/types.js"

export const useCourseStore = create<CourseState & CourseActions>()(
  immer((set, get) => {
    const markCourseMutated = () => {
      set((draft) => {
        if (!draft.course) return
        draft.checksDirty = true
      })
    }

    const internals: StoreInternals = {
      markCourseMutated,
      mutateRoster: null as unknown as StoreInternals["mutateRoster"],
    }

    const history = createHistorySlice(set, get, internals)
    internals.mutateRoster = history.mutateRoster

    return {
      ...initialState,
      ...history.actions,
      ...createRosterActionsSlice(set, get, internals),
      ...createMetadataActionsSlice(set, get, internals),
      ...createLifecycleSlice(set, get),
    }
  }),
)

export * from "./course-store-selectors.js"
