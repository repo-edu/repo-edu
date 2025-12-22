import { create } from "zustand"
import {
  DEFAULT_GITEA_CONFIG,
  DEFAULT_GITHUB_CONFIG,
  DEFAULT_GITLAB_CONFIG,
  DEFAULT_LOG_LEVELS,
  DEFAULT_REPO_SETTINGS,
} from "../constants"

export type GitServerType = "GitHub" | "GitLab" | "Gitea"

export interface GitHubConfig {
  accessToken: string
  user: string
  studentReposOrg: string
  templateOrg: string
}

export interface GitLabConfig {
  accessToken: string
  baseUrl: string
  user: string
  studentReposGroup: string
  templateGroup: string
}

export interface GiteaConfig {
  accessToken: string
  baseUrl: string
  user: string
  studentReposGroup: string
  templateGroup: string
}

export interface RepoFormState {
  gitServerType: GitServerType
  github: GitHubConfig
  gitlab: GitLabConfig
  gitea: GiteaConfig
  // Repo-specific settings (shared across server types)
  yamlFile: string
  targetFolder: string
  assignments: string
  directoryLayout: "by-team" | "flat" | "by-task"
  logLevels: {
    info: boolean
    debug: boolean
    warning: boolean
    error: boolean
  }
}

interface RepoFormStore extends RepoFormState {
  setField: <K extends keyof RepoFormState>(
    key: K,
    value: RepoFormState[K],
  ) => void
  setGitHubField: <K extends keyof GitHubConfig>(
    key: K,
    value: GitHubConfig[K],
  ) => void
  setGitLabField: <K extends keyof GitLabConfig>(
    key: K,
    value: GitLabConfig[K],
  ) => void
  setGiteaField: <K extends keyof GiteaConfig>(
    key: K,
    value: GiteaConfig[K],
  ) => void
  setGitServerType: (type: GitServerType) => void
  setLogLevel: (level: keyof RepoFormState["logLevels"], value: boolean) => void
  reset: () => void
  loadFromSettings: (settings: Partial<RepoFormState>) => void
  getState: () => RepoFormState
  // Helper to get the active git config
  getActiveConfig: () => GitHubConfig | GitLabConfig | GiteaConfig
}

const initialState: RepoFormState = {
  gitServerType: DEFAULT_REPO_SETTINGS.gitServerType,
  github: { ...DEFAULT_GITHUB_CONFIG },
  gitlab: { ...DEFAULT_GITLAB_CONFIG },
  gitea: { ...DEFAULT_GITEA_CONFIG },
  yamlFile: DEFAULT_REPO_SETTINGS.yamlFile,
  targetFolder: DEFAULT_REPO_SETTINGS.targetFolder,
  assignments: DEFAULT_REPO_SETTINGS.assignments,
  directoryLayout: DEFAULT_REPO_SETTINGS.directoryLayout,
  logLevels: { ...DEFAULT_LOG_LEVELS },
}

export const useRepoFormStore = create<RepoFormStore>((set, get) => ({
  ...initialState,

  setField: (key, value) => set({ [key]: value }),

  setGitHubField: (key, value) =>
    set((state) => ({
      github: { ...state.github, [key]: value },
    })),

  setGitLabField: (key, value) =>
    set((state) => ({
      gitlab: { ...state.gitlab, [key]: value },
    })),

  setGiteaField: (key, value) =>
    set((state) => ({
      gitea: { ...state.gitea, [key]: value },
    })),

  setGitServerType: (type) => set({ gitServerType: type }),

  setLogLevel: (level, value) =>
    set((state) => ({
      logLevels: { ...state.logLevels, [level]: value },
    })),

  reset: () =>
    set({
      ...initialState,
      github: { ...DEFAULT_GITHUB_CONFIG },
      gitlab: { ...DEFAULT_GITLAB_CONFIG },
      gitea: { ...DEFAULT_GITEA_CONFIG },
      logLevels: { ...DEFAULT_LOG_LEVELS },
    }),

  loadFromSettings: (settings) =>
    set({
      ...initialState,
      github: { ...DEFAULT_GITHUB_CONFIG },
      gitlab: { ...DEFAULT_GITLAB_CONFIG },
      gitea: { ...DEFAULT_GITEA_CONFIG },
      logLevels: { ...DEFAULT_LOG_LEVELS },
      ...settings,
    }),

  getState: () => {
    const state = get()
    return {
      gitServerType: state.gitServerType,
      github: { ...state.github },
      gitlab: { ...state.gitlab },
      gitea: { ...state.gitea },
      yamlFile: state.yamlFile,
      targetFolder: state.targetFolder,
      assignments: state.assignments,
      directoryLayout: state.directoryLayout,
      logLevels: { ...state.logLevels },
    }
  },

  getActiveConfig: () => {
    const state = get()
    switch (state.gitServerType) {
      case "GitHub":
        return state.github
      case "GitLab":
        return state.gitlab
      case "Gitea":
        return state.gitea
    }
  },
}))

export { initialState as repoFormInitialState }
