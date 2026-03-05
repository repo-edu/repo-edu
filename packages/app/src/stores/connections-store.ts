import { create } from "zustand";
import type { ConnectionStatus, CourseStatus } from "../types/index.js";

type ConnectionsState = {
  lmsStatus: ConnectionStatus;
  gitStatuses: Record<string, ConnectionStatus>;
  lmsError: string | null;
  gitErrors: Record<string, string | null>;
  courseStatuses: Record<string, CourseStatus>;
  courseErrors: Record<string, string | null>;
  activeProfileForCourse: string | null;
};

type ConnectionsActions = {
  setLmsStatus: (status: ConnectionStatus, error?: string | null) => void;
  setGitStatus: (
    name: string,
    status: ConnectionStatus,
    error?: string | null,
  ) => void;
  setCourseStatus: (
    profile: string,
    status: CourseStatus,
    error?: string | null,
  ) => void;
  setActiveProfileForCourse: (profile: string | null) => void;
  resetLmsStatus: () => void;
  resetGitStatus: (name: string) => void;
  removeGitStatus: (name: string) => void;
  renameGitStatus: (oldName: string, newName: string) => void;
  resetAllStatuses: () => void;
};

const initialState: ConnectionsState = {
  lmsStatus: "disconnected",
  gitStatuses: {},
  lmsError: null,
  gitErrors: {},
  courseStatuses: {},
  courseErrors: {},
  activeProfileForCourse: null,
};

export const useConnectionsStore = create<
  ConnectionsState & ConnectionsActions
>((set) => ({
  ...initialState,

  setLmsStatus: (status, error) =>
    set({ lmsStatus: status, lmsError: error ?? null }),

  setGitStatus: (name, status, error) =>
    set((state) => ({
      gitStatuses: { ...state.gitStatuses, [name]: status },
      gitErrors: { ...state.gitErrors, [name]: error ?? null },
    })),

  setCourseStatus: (profile, status, error) =>
    set((state) => ({
      courseStatuses: { ...state.courseStatuses, [profile]: status },
      courseErrors: { ...state.courseErrors, [profile]: error ?? null },
    })),

  setActiveProfileForCourse: (profile) =>
    set({ activeProfileForCourse: profile }),

  resetLmsStatus: () => set({ lmsStatus: "disconnected", lmsError: null }),

  resetGitStatus: (name) =>
    set((state) => {
      const gitStatuses = { ...state.gitStatuses };
      const gitErrors = { ...state.gitErrors };
      delete gitStatuses[name];
      delete gitErrors[name];
      return { gitStatuses, gitErrors };
    }),

  removeGitStatus: (name) =>
    set((state) => {
      const gitStatuses = { ...state.gitStatuses };
      const gitErrors = { ...state.gitErrors };
      delete gitStatuses[name];
      delete gitErrors[name];
      return { gitStatuses, gitErrors };
    }),

  renameGitStatus: (oldName, newName) =>
    set((state) => {
      const gitStatuses = { ...state.gitStatuses };
      const gitErrors = { ...state.gitErrors };
      if (oldName in gitStatuses) {
        gitStatuses[newName] = gitStatuses[oldName];
        delete gitStatuses[oldName];
      }
      if (oldName in gitErrors) {
        gitErrors[newName] = gitErrors[oldName];
        delete gitErrors[oldName];
      }
      return { gitStatuses, gitErrors };
    }),

  resetAllStatuses: () => set(initialState),
}));

export const selectLmsStatus = (state: ConnectionsState) => state.lmsStatus;
export const selectLmsError = (state: ConnectionsState) => state.lmsError;
export const selectGitStatuses = (state: ConnectionsState) =>
  state.gitStatuses;
export const selectGitStatus =
  (name: string) => (state: ConnectionsState) =>
    state.gitStatuses[name] ?? "disconnected";
export const selectGitError =
  (name: string) => (state: ConnectionsState) =>
    state.gitErrors[name] ?? null;
export const selectCourseStatus =
  (profile: string) => (state: ConnectionsState) =>
    state.courseStatuses[profile] ?? "unknown";
export const selectCourseError =
  (profile: string) => (state: ConnectionsState) =>
    state.courseErrors[profile] ?? null;
