import { create } from "zustand"
import type { ConnectionStatus, CourseStatus } from "../types/index.js"

type ConnectionsState = {
  lmsStatus: ConnectionStatus
  lmsStatuses: Record<string, ConnectionStatus>
  gitStatuses: Record<string, ConnectionStatus>
  lmsError: string | null
  lmsErrors: Record<string, string | null>
  gitErrors: Record<string, string | null>
  courseStatuses: Record<string, CourseStatus>
  courseErrors: Record<string, string | null>
  activeCourseForConnections: string | null
}

type ConnectionsActions = {
  setLmsStatus: (status: ConnectionStatus, error?: string | null) => void
  setLmsConnectionStatus: (
    name: string,
    status: ConnectionStatus,
    error?: string | null,
  ) => void
  setGitStatus: (
    id: string,
    status: ConnectionStatus,
    error?: string | null,
  ) => void
  setCourseStatus: (
    course: string,
    status: CourseStatus,
    error?: string | null,
  ) => void
  setActiveCourseForConnections: (course: string | null) => void
  resetLmsStatus: () => void
  resetLmsConnectionStatus: (name: string) => void
  removeLmsConnectionStatus: (name: string) => void
  renameLmsConnectionStatus: (oldName: string, newName: string) => void
  resetGitStatus: (id: string) => void
  removeGitStatus: (id: string) => void
  resetAllStatuses: () => void
}

const initialState: ConnectionsState = {
  lmsStatus: "disconnected",
  lmsStatuses: {},
  gitStatuses: {},
  lmsError: null,
  lmsErrors: {},
  gitErrors: {},
  courseStatuses: {},
  courseErrors: {},
  activeCourseForConnections: null,
}

export const useConnectionsStore = create<
  ConnectionsState & ConnectionsActions
>((set) => ({
  ...initialState,

  setLmsStatus: (status, error) =>
    set({ lmsStatus: status, lmsError: error ?? null }),

  setLmsConnectionStatus: (name, status, error) =>
    set((state) => ({
      lmsStatuses: { ...state.lmsStatuses, [name]: status },
      lmsErrors: { ...state.lmsErrors, [name]: error ?? null },
    })),

  setGitStatus: (id, status, error) =>
    set((state) => ({
      gitStatuses: { ...state.gitStatuses, [id]: status },
      gitErrors: { ...state.gitErrors, [id]: error ?? null },
    })),

  setCourseStatus: (course, status, error) =>
    set((state) => ({
      courseStatuses: { ...state.courseStatuses, [course]: status },
      courseErrors: { ...state.courseErrors, [course]: error ?? null },
    })),

  setActiveCourseForConnections: (course) =>
    set({ activeCourseForConnections: course }),

  resetLmsStatus: () => set({ lmsStatus: "disconnected", lmsError: null }),

  resetLmsConnectionStatus: (name) =>
    set((state) => {
      const lmsStatuses = { ...state.lmsStatuses }
      const lmsErrors = { ...state.lmsErrors }
      delete lmsStatuses[name]
      delete lmsErrors[name]
      return { lmsStatuses, lmsErrors }
    }),

  removeLmsConnectionStatus: (name) =>
    set((state) => {
      const lmsStatuses = { ...state.lmsStatuses }
      const lmsErrors = { ...state.lmsErrors }
      delete lmsStatuses[name]
      delete lmsErrors[name]
      return { lmsStatuses, lmsErrors }
    }),

  renameLmsConnectionStatus: (oldName, newName) =>
    set((state) => {
      const lmsStatuses = { ...state.lmsStatuses }
      const lmsErrors = { ...state.lmsErrors }
      if (oldName in lmsStatuses) {
        lmsStatuses[newName] = lmsStatuses[oldName]
        delete lmsStatuses[oldName]
      }
      if (oldName in lmsErrors) {
        lmsErrors[newName] = lmsErrors[oldName]
        delete lmsErrors[oldName]
      }
      return { lmsStatuses, lmsErrors }
    }),

  resetGitStatus: (id) =>
    set((state) => {
      const gitStatuses = { ...state.gitStatuses }
      const gitErrors = { ...state.gitErrors }
      delete gitStatuses[id]
      delete gitErrors[id]
      return { gitStatuses, gitErrors }
    }),

  removeGitStatus: (id) =>
    set((state) => {
      const gitStatuses = { ...state.gitStatuses }
      const gitErrors = { ...state.gitErrors }
      delete gitStatuses[id]
      delete gitErrors[id]
      return { gitStatuses, gitErrors }
    }),

  resetAllStatuses: () => set(initialState),
}))

export const selectLmsStatus = (state: ConnectionsState) => state.lmsStatus
export const selectLmsError = (state: ConnectionsState) => state.lmsError
export const selectLmsStatuses = (state: ConnectionsState) => state.lmsStatuses
export const selectLmsStatusByName =
  (name: string) => (state: ConnectionsState) =>
    state.lmsStatuses[name] ?? "disconnected"
export const selectLmsErrorByName =
  (name: string) => (state: ConnectionsState) =>
    state.lmsErrors[name] ?? null
export const selectGitStatuses = (state: ConnectionsState) => state.gitStatuses
export const selectGitStatus = (id: string) => (state: ConnectionsState) =>
  state.gitStatuses[id] ?? "disconnected"
export const selectGitError = (id: string) => (state: ConnectionsState) =>
  state.gitErrors[id] ?? null
export const selectCourseStatus =
  (course: string) => (state: ConnectionsState) =>
    state.courseStatuses[course] ?? "unknown"
export const selectCourseError =
  (course: string) => (state: ConnectionsState) =>
    state.courseErrors[course] ?? null
