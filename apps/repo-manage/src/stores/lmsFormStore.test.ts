import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_CANVAS_CONFIG } from "../constants"
import { useLmsFormStore } from "./lmsFormStore"

describe("lmsFormStore", () => {
  beforeEach(() => {
    useLmsFormStore.getState().reset()
  })

  it("has correct initial state", () => {
    const state = useLmsFormStore.getState().getState()
    expect(state.lmsType).toBe("Canvas")
    expect(state.canvas.baseUrl).toBe("https://canvas.tue.nl")
    expect(state.canvas.urlOption).toBe("TUE")
    expect(state.canvas.courses).toEqual([])
    expect(state.moodle.courses).toEqual([])
    expect(state.yaml).toBe(true)
    expect(state.csv).toBe(false)
    expect(state.xlsx).toBe(false)
  })

  describe("setField", () => {
    it("updates a single field", () => {
      useLmsFormStore.getState().setCanvasField("accessToken", "secret123")
      expect(useLmsFormStore.getState().canvas.accessToken).toBe("secret123")
    })

    it("updates boolean fields", () => {
      useLmsFormStore.getState().setField("csv", true)
      expect(useLmsFormStore.getState().csv).toBe(true)
    })
  })

  describe("setLmsType", () => {
    it("updates lmsType", () => {
      useLmsFormStore.getState().setLmsType("Moodle")
      expect(useLmsFormStore.getState().lmsType).toBe("Moodle")
    })

    it("resets activeCourseIndex when switching LMS type", () => {
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().setActiveCourse(1)
      useLmsFormStore.getState().setLmsType("Moodle")
      expect(useLmsFormStore.getState().activeCourseIndex).toBe(0)
    })

    it("preserves Canvas urlOption", () => {
      useLmsFormStore.getState().setCanvasField("urlOption", "CUSTOM")
      useLmsFormStore.getState().setLmsType("Moodle")
      useLmsFormStore.getState().setLmsType("Canvas")
      expect(useLmsFormStore.getState().canvas.urlOption).toBe("CUSTOM")
    })
  })

  describe("reset", () => {
    it("resets all fields to initial state", () => {
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().setCanvasField("accessToken", "secret")
      useLmsFormStore.getState().setField("csv", true)

      useLmsFormStore.getState().reset()

      const state = useLmsFormStore.getState().getState()
      expect(state.canvas.courses).toEqual([])
      expect(state.canvas.accessToken).toBe("")
      expect(state.csv).toBe(false)
    })
  })

  describe("loadFromSettings", () => {
    it("loads partial settings", () => {
      useLmsFormStore.getState().loadFromSettings({
        canvas: {
          ...DEFAULT_CANVAS_CONFIG,
          courses: [{ id: "99999", name: "Test Course", status: "verified" }],
          accessToken: "token123",
        },
      })

      const state = useLmsFormStore.getState().getState()
      expect(state.canvas.courses).toHaveLength(1)
      expect(state.canvas.courses[0].id).toBe("99999")
      expect(state.canvas.accessToken).toBe("token123")
      expect(state.lmsType).toBe("Canvas")
    })

    it("resets to defaults before applying settings", () => {
      useLmsFormStore.getState().setField("csv", true)

      useLmsFormStore.getState().loadFromSettings({
        canvas: {
          ...DEFAULT_CANVAS_CONFIG,
          courses: [{ id: "12345", name: null, status: "pending" }],
        },
      })

      expect(useLmsFormStore.getState().csv).toBe(false)
      expect(useLmsFormStore.getState().canvas.courses[0].id).toBe("12345")
    })
  })

  describe("course management", () => {
    it("adds a new empty course", () => {
      useLmsFormStore.getState().addCourse()
      const courses = useLmsFormStore.getState().getActiveCourses()
      expect(courses).toHaveLength(1)
      expect(courses[0]).toEqual({
        id: "",
        name: null,
        status: "pending",
      })
    })

    it("removes a course by index", () => {
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().updateCourse(0, { id: "111" })
      useLmsFormStore.getState().updateCourse(1, { id: "222" })

      useLmsFormStore.getState().removeCourse(0)

      const courses = useLmsFormStore.getState().getActiveCourses()
      expect(courses).toHaveLength(1)
      expect(courses[0].id).toBe("222")
    })

    it("updates a course", () => {
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().updateCourse(0, {
        id: "12345",
        name: "Test Course",
        status: "verified",
      })

      const courses = useLmsFormStore.getState().getActiveCourses()
      expect(courses[0]).toEqual({
        id: "12345",
        name: "Test Course",
        status: "verified",
      })
    })

    it("sets course status", () => {
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().setCourseStatus(0, "verifying")

      const courses = useLmsFormStore.getState().getActiveCourses()
      expect(courses[0].status).toBe("verifying")
    })
  })

  describe("getState", () => {
    it("returns a plain object with all form fields", () => {
      const state = useLmsFormStore.getState().getState()

      // Should have all LmsFormState fields
      expect(state).toHaveProperty("lmsType")
      expect(state).toHaveProperty("canvas")
      expect(state).toHaveProperty("moodle")
      expect(state.canvas).toHaveProperty("accessToken")
      expect(state.canvas).toHaveProperty("baseUrl")
      expect(state.canvas).toHaveProperty("courses")
      expect(state.moodle).toHaveProperty("accessToken")
      expect(state.moodle).toHaveProperty("courses")
      expect(state).toHaveProperty("yamlFile")
      expect(state).toHaveProperty("csv")
      expect(state).toHaveProperty("xlsx")
      expect(state).toHaveProperty("yaml")

      // Should NOT have store methods
      expect(state).not.toHaveProperty("setField")
      expect(state).not.toHaveProperty("reset")
    })
  })

  describe("getActiveCourses", () => {
    it("returns Canvas courses when lmsType is Canvas", () => {
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().updateCourse(0, { id: "canvas-course" })

      expect(useLmsFormStore.getState().lmsType).toBe("Canvas")
      const courses = useLmsFormStore.getState().getActiveCourses()
      expect(courses[0].id).toBe("canvas-course")
    })

    it("returns Moodle courses when lmsType is Moodle", () => {
      useLmsFormStore.getState().setLmsType("Moodle")
      useLmsFormStore.getState().addCourse()
      useLmsFormStore.getState().updateCourse(0, { id: "moodle-course" })

      expect(useLmsFormStore.getState().lmsType).toBe("Moodle")
      const courses = useLmsFormStore.getState().getActiveCourses()
      expect(courses[0].id).toBe("moodle-course")
    })
  })
})
