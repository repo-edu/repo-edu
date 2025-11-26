import { create } from "zustand";

export interface RepoFormState {
  accessToken: string;
  user: string;
  baseUrl: string;
  studentReposGroup: string;
  templateGroup: string;
  yamlFile: string;
  targetFolder: string;
  assignments: string;
  directoryLayout: "by-team" | "flat" | "by-task";
  logLevels: {
    info: boolean;
    debug: boolean;
    warning: boolean;
    error: boolean;
  };
}

interface RepoFormStore extends RepoFormState {
  setField: <K extends keyof RepoFormState>(key: K, value: RepoFormState[K]) => void;
  setLogLevel: (level: keyof RepoFormState["logLevels"], value: boolean) => void;
  reset: () => void;
  loadFromSettings: (settings: Partial<RepoFormState>) => void;
  getState: () => RepoFormState;
}

const initialState: RepoFormState = {
  accessToken: "",
  user: "",
  baseUrl: "https://gitlab.tue.nl",
  studentReposGroup: "",
  templateGroup: "",
  yamlFile: "",
  targetFolder: "",
  assignments: "",
  directoryLayout: "flat",
  logLevels: {
    info: true,
    debug: false,
    warning: true,
    error: true,
  },
};

export const useRepoFormStore = create<RepoFormStore>((set, get) => ({
  ...initialState,

  setField: (key, value) => set({ [key]: value }),

  setLogLevel: (level, value) =>
    set((state) => ({
      logLevels: { ...state.logLevels, [level]: value },
    })),

  reset: () => set(initialState),

  loadFromSettings: (settings) => set({ ...initialState, ...settings }),

  getState: () => {
    const state = get();
    return {
      accessToken: state.accessToken,
      user: state.user,
      baseUrl: state.baseUrl,
      studentReposGroup: state.studentReposGroup,
      templateGroup: state.templateGroup,
      yamlFile: state.yamlFile,
      targetFolder: state.targetFolder,
      assignments: state.assignments,
      directoryLayout: state.directoryLayout,
      logLevels: { ...state.logLevels },
    };
  },
}));

export { initialState as repoFormInitialState };
