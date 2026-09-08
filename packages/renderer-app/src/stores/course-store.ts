import { enablePatches, produceWithPatches } from "immer"
import { create } from "zustand"
import { createHistorySlice } from "./slices/history.js"
import { createLifecycleSlice } from "./slices/lifecycle.js"
import { createMetadataActionsSlice } from "./slices/metadata-actions.js"
import { createRosterActionsSlice } from "./slices/roster-actions.js"
import type {
  CourseActions,
  CourseState,
  StoreInternals,
  StoreSet,
} from "./slices/types.js"
import { initialState } from "./slices/types.js"

enablePatches()

export type { CourseActions, CourseState } from "./slices/types.js"

export const useCourseStore = create<CourseState & CourseActions>()(
  (publish, get) => {
    const set: StoreSet = (recipe) => {
      const current = get()
      const [next, patches] = produceWithPatches(current, recipe)
      if (patches.length === 0) return
      const semanticChange = patches.some(
        ({ path }) =>
          path[0] === "course" &&
          !(
            path.length === 2 &&
            (path[1] === "revision" || path[1] === "updatedAt")
          ),
      )
      publish({
        ...next,
        admissionNumber:
          next.admissionNumber !== current.admissionNumber
            ? next.admissionNumber
            : current.admissionNumber + Number(semanticChange),
      })
    }
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
  },
)

export * from "./course-store-selectors.js"
