import { create } from "zustand"
import { DEFAULT_LMS_SETTINGS } from "../constants"

export type CourseStatus = "pending" | "verifying" | "verified" | "failed"

export interface CourseEntry {
  id: string
  name: string | null
  status: CourseStatus
}

export interface LmsFormState {
  lmsType: "Canvas" | "Moodle"
  baseUrl: string
  customUrl: string
  urlOption: "TUE" | "CUSTOM"
  accessToken: string
  courses: CourseEntry[]
  activeCourseIndex: number
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
  addCourse: () => void
  removeCourse: (index: number) => void
  updateCourse: (index: number, updates: Partial<CourseEntry>) => void
  setCourseStatus: (index: number, status: CourseStatus) => void
  setActiveCourse: (index: number) => void
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

  addCourse: () =>
    set((state) => ({
      courses: [...state.courses, { id: "", name: null, status: "pending" }],
      activeCourseIndex: state.courses.length,
    })),

  removeCourse: (index) =>
    set((state) => {
      const newCourses = state.courses.filter((_, i) => i !== index)
      let newActiveIndex = state.activeCourseIndex
      if (index < state.activeCourseIndex) {
        newActiveIndex = state.activeCourseIndex - 1
      } else if (index === state.activeCourseIndex && newCourses.length > 0) {
        newActiveIndex = Math.min(
          state.activeCourseIndex,
          newCourses.length - 1,
        )
      }
      return { courses: newCourses, activeCourseIndex: newActiveIndex }
    }),

  updateCourse: (index, updates) =>
    set((state) => ({
      courses: state.courses.map((course, i) =>
        i === index ? { ...course, ...updates } : course,
      ),
    })),

  setCourseStatus: (index, status) =>
    set((state) => ({
      courses: state.courses.map((course, i) =>
        i === index ? { ...course, status } : course,
      ),
    })),

  setActiveCourse: (index) => set({ activeCourseIndex: index }),

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
      courses: state.courses,
      activeCourseIndex: state.activeCourseIndex,
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
