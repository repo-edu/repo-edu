import { create } from "zustand"
import type { Group, GroupCategory } from "../bindings"
import {
  DEFAULT_CANVAS_CONFIG,
  DEFAULT_LMS_SETTINGS,
  DEFAULT_MOODLE_CONFIG,
} from "../constants"

export type CourseStatus = "pending" | "verifying" | "verified" | "failed"

export interface CourseEntry {
  id: string
  name: string | null
  status: CourseStatus
}

export interface CanvasConfig {
  accessToken: string
  baseUrl: string
  customUrl: string
  urlOption: "TUE" | "CUSTOM"
  courses: CourseEntry[]
}

export interface MoodleConfig {
  accessToken: string
  baseUrl: string
  courses: CourseEntry[]
}

export interface LmsFormState {
  lmsType: "Canvas" | "Moodle"
  canvas: CanvasConfig
  moodle: MoodleConfig
  activeCourseIndex: number
  // Group categories (group sets) and groups
  groupCategories: GroupCategory[]
  groups: Group[]
  groupsLoading: boolean
  groupCategoriesError: string | null
  selectedGroupCategoryId: string | null
  // Output settings (shared)
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
  setCanvasField: <K extends keyof CanvasConfig>(
    key: K,
    value: CanvasConfig[K],
  ) => void
  setMoodleField: <K extends keyof MoodleConfig>(
    key: K,
    value: MoodleConfig[K],
  ) => void
  setLmsType: (type: "Canvas" | "Moodle") => void
  addCourse: () => void
  removeCourse: (index: number) => void
  updateCourse: (index: number, updates: Partial<CourseEntry>) => void
  setCourseStatus: (index: number, status: CourseStatus) => void
  setActiveCourse: (index: number) => void
  // Group categories and groups
  setGroupCategories: (categories: GroupCategory[]) => void
  setGroups: (groups: Group[]) => void
  setGroupsLoading: (loading: boolean) => void
  setGroupCategoriesError: (error: string | null) => void
  setSelectedGroupCategoryId: (id: string | null) => void
  clearGroupCategories: () => void
  reset: () => void
  loadFromSettings: (settings: Partial<LmsFormState>) => void
  getState: () => LmsFormState
  getSaveableState: () => Omit<
    LmsFormState,
    | "groupCategories"
    | "groups"
    | "groupsLoading"
    | "groupCategoriesError"
    | "selectedGroupCategoryId"
  >
  // Helper to get the active LMS config
  getActiveConfig: () => CanvasConfig | MoodleConfig
  getActiveCourses: () => CourseEntry[]
}

const initialState: LmsFormState = {
  lmsType: DEFAULT_LMS_SETTINGS.lmsType,
  canvas: { ...DEFAULT_CANVAS_CONFIG },
  moodle: { ...DEFAULT_MOODLE_CONFIG },
  activeCourseIndex: DEFAULT_LMS_SETTINGS.activeCourseIndex,
  groupCategories: [],
  groups: [],
  groupsLoading: false,
  groupCategoriesError: null,
  selectedGroupCategoryId: null,
  yamlFile: DEFAULT_LMS_SETTINGS.yamlFile,
  outputFolder: DEFAULT_LMS_SETTINGS.outputFolder,
  csvFile: DEFAULT_LMS_SETTINGS.csvFile,
  xlsxFile: DEFAULT_LMS_SETTINGS.xlsxFile,
  memberOption: DEFAULT_LMS_SETTINGS.memberOption,
  includeGroup: DEFAULT_LMS_SETTINGS.includeGroup,
  includeMember: DEFAULT_LMS_SETTINGS.includeMember,
  includeInitials: DEFAULT_LMS_SETTINGS.includeInitials,
  fullGroups: DEFAULT_LMS_SETTINGS.fullGroups,
  csv: DEFAULT_LMS_SETTINGS.csv,
  xlsx: DEFAULT_LMS_SETTINGS.xlsx,
  yaml: DEFAULT_LMS_SETTINGS.yaml,
}

export const useLmsFormStore = create<LmsFormStore>((set, get) => ({
  ...initialState,

  setField: (key, value) => set({ [key]: value }),

  setCanvasField: (key, value) =>
    set((state) => ({
      canvas: { ...state.canvas, [key]: value },
    })),

  setMoodleField: (key, value) =>
    set((state) => ({
      moodle: { ...state.moodle, [key]: value },
    })),

  setLmsType: (type) =>
    set(() => ({
      lmsType: type,
      activeCourseIndex: 0,
    })),

  addCourse: () =>
    set((state) => {
      const newCourse = { id: "", name: null, status: "pending" as const }
      if (state.lmsType === "Canvas") {
        const courses = [...state.canvas.courses, newCourse]
        return {
          canvas: { ...state.canvas, courses },
          activeCourseIndex: courses.length - 1,
        }
      } else {
        const courses = [...state.moodle.courses, newCourse]
        return {
          moodle: { ...state.moodle, courses },
          activeCourseIndex: courses.length - 1,
        }
      }
    }),

  removeCourse: (index) =>
    set((state) => {
      const updateCourses = (courses: CourseEntry[]) => {
        const newCourses = courses.filter((_, i) => i !== index)
        let newActiveIndex = state.activeCourseIndex
        if (index < state.activeCourseIndex) {
          newActiveIndex = state.activeCourseIndex - 1
        } else if (index === state.activeCourseIndex && newCourses.length > 0) {
          newActiveIndex = Math.min(
            state.activeCourseIndex,
            newCourses.length - 1,
          )
        }
        return { newCourses, newActiveIndex }
      }

      if (state.lmsType === "Canvas") {
        const { newCourses, newActiveIndex } = updateCourses(
          state.canvas.courses,
        )
        return {
          canvas: { ...state.canvas, courses: newCourses },
          activeCourseIndex: newActiveIndex,
        }
      } else {
        const { newCourses, newActiveIndex } = updateCourses(
          state.moodle.courses,
        )
        return {
          moodle: { ...state.moodle, courses: newCourses },
          activeCourseIndex: newActiveIndex,
        }
      }
    }),

  updateCourse: (index, updates) =>
    set((state) => {
      const updateCourses = (courses: CourseEntry[]) =>
        courses.map((course, i) =>
          i === index ? { ...course, ...updates } : course,
        )

      if (state.lmsType === "Canvas") {
        return {
          canvas: {
            ...state.canvas,
            courses: updateCourses(state.canvas.courses),
          },
        }
      } else {
        return {
          moodle: {
            ...state.moodle,
            courses: updateCourses(state.moodle.courses),
          },
        }
      }
    }),

  setCourseStatus: (index, status) =>
    set((state) => {
      const updateCourses = (courses: CourseEntry[]) =>
        courses.map((course, i) =>
          i === index ? { ...course, status } : course,
        )

      if (state.lmsType === "Canvas") {
        return {
          canvas: {
            ...state.canvas,
            courses: updateCourses(state.canvas.courses),
          },
        }
      } else {
        return {
          moodle: {
            ...state.moodle,
            courses: updateCourses(state.moodle.courses),
          },
        }
      }
    }),

  setActiveCourse: (index) => set({ activeCourseIndex: index }),

  setGroupCategories: (categories) =>
    set((state) => {
      const selectedId = state.selectedGroupCategoryId
      const keepSelected =
        selectedId && categories.some((category) => category.id === selectedId)
      return {
        groupCategories: categories,
        groupCategoriesError: null,
        selectedGroupCategoryId: keepSelected ? selectedId : null,
      }
    }),

  setGroups: (groups) => set({ groups }),

  setGroupsLoading: (loading) => set({ groupsLoading: loading }),

  setGroupCategoriesError: (error) => {
    if (error) {
      // On error: clear everything
      set({
        groupCategories: [],
        groups: [],
        groupsLoading: false,
        groupCategoriesError: error,
        selectedGroupCategoryId: null,
      })
    } else {
      // Just clearing error: keep categories
      set({ groupCategoriesError: null })
    }
  },

  setSelectedGroupCategoryId: (id) => set({ selectedGroupCategoryId: id }),

  clearGroupCategories: () =>
    set({
      groupCategories: [],
      groups: [],
      groupsLoading: false,
      groupCategoriesError: null,
      selectedGroupCategoryId: null,
    }),

  reset: () =>
    set({
      ...initialState,
      canvas: { ...DEFAULT_CANVAS_CONFIG },
      moodle: { ...DEFAULT_MOODLE_CONFIG },
    }),

  loadFromSettings: (settings) =>
    set({
      ...initialState,
      canvas: { ...DEFAULT_CANVAS_CONFIG },
      moodle: { ...DEFAULT_MOODLE_CONFIG },
      ...settings,
    }),

  getState: () => {
    const state = get()
    return {
      lmsType: state.lmsType,
      canvas: state.canvas,
      moodle: state.moodle,
      activeCourseIndex: state.activeCourseIndex,
      groupCategories: state.groupCategories,
      groups: state.groups,
      groupsLoading: state.groupsLoading,
      groupCategoriesError: state.groupCategoriesError,
      selectedGroupCategoryId: state.selectedGroupCategoryId,
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

  // Get only the state that should be persisted (excludes transient runtime state)
  getSaveableState: () => {
    const state = get()
    return {
      lmsType: state.lmsType,
      canvas: state.canvas,
      moodle: state.moodle,
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

  getActiveConfig: () => {
    const state = get()
    return state.lmsType === "Canvas" ? state.canvas : state.moodle
  },

  getActiveCourses: () => {
    const state = get()
    return state.lmsType === "Canvas"
      ? state.canvas.courses
      : state.moodle.courses
  },
}))

export { initialState as lmsFormInitialState }
