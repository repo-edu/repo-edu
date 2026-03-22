import type {
  GitProviderKind,
  PersistedAppSettings,
  PersistedGitConnection,
} from "./types.js"

import { persistedAppSettingsKind } from "./types.js"

export const gitProviderDefaultBaseUrls: Record<GitProviderKind, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
  gitea: "",
}

const gitProviderDisplayLabels: Record<GitProviderKind, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
}

export function gitConnectionDisplayLabel(
  connection: Pick<PersistedGitConnection, "provider" | "baseUrl">,
): string {
  const label = gitProviderDisplayLabels[connection.provider]
  const defaultUrl = gitProviderDefaultBaseUrls[connection.provider]
  if (connection.baseUrl === defaultUrl || connection.baseUrl === "") {
    return label
  }
  const shortUrl = connection.baseUrl.replace(/^https?:\/\//, "")
  return `${label} · ${shortUrl}`
}

export const defaultAppSettings: PersistedAppSettings = {
  kind: persistedAppSettingsKind,
  schemaVersion: 1,
  activeCourseId: null,
  activeTab: "roster",
  appearance: {
    theme: "system",
    windowChrome: "system",
    dateFormat: "DMY",
    timeFormat: "24h",
  },
  window: {
    width: 1180,
    height: 760,
  },
  lmsConnections: [],
  gitConnections: [],
  lastOpenedAt: null,
  rosterColumnVisibility: {},
  rosterColumnSizing: {},
  groupsColumnVisibility: {},
  groupsColumnSizing: {},
}
