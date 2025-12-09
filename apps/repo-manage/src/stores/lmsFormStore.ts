import { create } from "zustand"
import { DEFAULT_LMS_SETTINGS } from "../constants"

export interface LmsFormState {
  lmsType: "Canvas" | "Moodle"
  baseUrl: string
  customUrl: string
  urlOption: "TUE" | "CUSTOM"
  accessToken: string
  courseId: string
  courseName: string
  yamlFile: string
  outputFolder: string
  csvFile: string
  xlsxFile: string
  memberOption: "(email, gitid)" | "email" | "git_id"
  includeGroup: boolean
  includeMember: boolean
  includeInitials: boolean
  fullGroups: boolean
  csv: boolean
  xlsx: boolean
  yaml: boolean
}

interface LmsFormStore extends LmsFormState {
  setField: <K extends keyof LmsFormState>(
    key: K,
    value: LmsFormState[K],
  ) => void
  setLmsType: (type: "Canvas" | "Moodle") => void
  reset: () => void
  loadFromSettings: (settings: Partial<LmsFormState>) => void
  getState: () => LmsFormState
}

const initialState: LmsFormState = { ...DEFAULT_LMS_SETTINGS }

export const useLmsFormStore = create<LmsFormStore>((set, get) => ({
  ...initialState,

  setField: (key, value) => set({ [key]: value }),

  setLmsType: (type) =>
    set((state) => ({
      lmsType: type,
      urlOption: type !== "Canvas" ? "CUSTOM" : state.urlOption,
      baseUrl:
        type === "Canvas" && !state.baseUrl
          ? DEFAULT_LMS_SETTINGS.baseUrl
          : state.baseUrl,
    })),

  reset: () => set(initialState),

  loadFromSettings: (settings) => set({ ...initialState, ...settings }),

  getState: () => {
    const state = get()
    return {
      lmsType: state.lmsType,
      baseUrl: state.baseUrl,
      customUrl: state.customUrl,
      urlOption: state.urlOption,
      accessToken: state.accessToken,
      courseId: state.courseId,
      courseName: state.courseName,
      yamlFile: state.yamlFile,
      outputFolder: state.outputFolder,
      csvFile: state.csvFile,
      xlsxFile: state.xlsxFile,
      memberOption: state.memberOption,
      includeGroup: state.includeGroup,
      includeMember: state.includeMember,
      includeInitials: state.includeInitials,
      fullGroups: state.fullGroups,
      csv: state.csv,
      xlsx: state.xlsx,
      yaml: state.yaml,
    }
  },
}))

export { initialState as lmsFormInitialState }
