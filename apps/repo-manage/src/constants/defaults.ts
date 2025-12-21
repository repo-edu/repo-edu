export const DEFAULT_LMS_SETTINGS = {
  lmsType: "Canvas" as const,
  baseUrl: "https://canvas.tue.nl",
  customUrl: "",
  urlOption: "TUE" as const,
  accessToken: "",
  courses: [] as { id: string; name: string | null; status: "pending" }[],
  activeCourseIndex: 0,
  yamlFile: "students.yaml",
  outputFolder: "",
  csvFile: "student-info.csv",
  xlsxFile: "student-info.xlsx",
  memberOption: "(email, gitid)" as const,
  includeGroup: true,
  includeMember: true,
  includeInitials: false,
  fullGroups: true,
  csv: false,
  xlsx: false,
  yaml: true,
}

// Base log level defaults; treat as immutable. Clone when embedding to avoid shared references.
export const DEFAULT_LOG_LEVELS = {
  info: true,
  debug: false,
  warning: true,
  error: true,
}

export const DEFAULT_REPO_SETTINGS = {
  accessToken: "",
  user: "",
  baseUrl: "https://gitlab.tue.nl",
  studentReposGroup: "",
  templateGroup: "",
  yamlFile: "",
  targetFolder: "",
  assignments: "",
  directoryLayout: "flat" as const,
  logLevels: { ...DEFAULT_LOG_LEVELS },
}

export const DEFAULT_GUI_THEME = "system" as const
