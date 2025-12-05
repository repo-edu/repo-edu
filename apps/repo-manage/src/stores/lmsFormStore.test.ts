import { beforeEach, describe, expect, it } from "vitest"
import { useLmsFormStore } from "./lmsFormStore"

describe("lmsFormStore", () => {
  beforeEach(() => {
    useLmsFormStore.getState().reset()
  })

  it("has correct initial state", () => {
    const state = useLmsFormStore.getState().getState()
    expect(state.lmsType).toBe("Canvas")
    expect(state.baseUrl).toBe("https://canvas.tue.nl")
    expect(state.urlOption).toBe("TUE")
    expect(state.yaml).toBe(true)
    expect(state.csv).toBe(false)
    expect(state.xlsx).toBe(false)
  })

  describe("setField", () => {
    it("updates a single field", () => {
      useLmsFormStore.getState().setField("courseId", "12345")
      expect(useLmsFormStore.getState().courseId).toBe("12345")
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

    it("sets urlOption to CUSTOM for non-Canvas types", () => {
      useLmsFormStore.getState().setLmsType("Moodle")
      expect(useLmsFormStore.getState().urlOption).toBe("CUSTOM")
    })

    it("preserves urlOption for Canvas", () => {
      useLmsFormStore.getState().setField("urlOption", "CUSTOM")
      useLmsFormStore.getState().setLmsType("Canvas")
      expect(useLmsFormStore.getState().urlOption).toBe("CUSTOM")
    })

    it("sets default base URL for Canvas if empty", () => {
      useLmsFormStore.getState().setField("baseUrl", "")
      useLmsFormStore.getState().setLmsType("Canvas")
      expect(useLmsFormStore.getState().baseUrl).toBe("https://canvas.tue.nl")
    })
  })

  describe("reset", () => {
    it("resets all fields to initial state", () => {
      useLmsFormStore.getState().setField("courseId", "12345")
      useLmsFormStore.getState().setField("accessToken", "secret")
      useLmsFormStore.getState().setField("csv", true)

      useLmsFormStore.getState().reset()

      const state = useLmsFormStore.getState().getState()
      expect(state.courseId).toBe("")
      expect(state.accessToken).toBe("")
      expect(state.csv).toBe(false)
    })
  })

  describe("loadFromSettings", () => {
    it("loads partial settings", () => {
      useLmsFormStore.getState().loadFromSettings({
        courseId: "99999",
        accessToken: "token123",
      })

      const state = useLmsFormStore.getState().getState()
      expect(state.courseId).toBe("99999")
      expect(state.accessToken).toBe("token123")
      // Other fields should have default values
      expect(state.lmsType).toBe("Canvas")
    })

    it("resets to defaults before applying settings", () => {
      useLmsFormStore.getState().setField("csv", true)

      useLmsFormStore.getState().loadFromSettings({
        courseId: "12345",
      })

      // csv should be reset to default (false)
      expect(useLmsFormStore.getState().csv).toBe(false)
      expect(useLmsFormStore.getState().courseId).toBe("12345")
    })
  })

  describe("getState", () => {
    it("returns a plain object with all form fields", () => {
      const state = useLmsFormStore.getState().getState()

      // Should have all LmsFormState fields
      expect(state).toHaveProperty("lmsType")
      expect(state).toHaveProperty("baseUrl")
      expect(state).toHaveProperty("customUrl")
      expect(state).toHaveProperty("urlOption")
      expect(state).toHaveProperty("accessToken")
      expect(state).toHaveProperty("courseId")
      expect(state).toHaveProperty("courseName")
      expect(state).toHaveProperty("yamlFile")
      expect(state).toHaveProperty("csv")
      expect(state).toHaveProperty("xlsx")
      expect(state).toHaveProperty("yaml")

      // Should NOT have store methods
      expect(state).not.toHaveProperty("setField")
      expect(state).not.toHaveProperty("reset")
    })
  })
})
