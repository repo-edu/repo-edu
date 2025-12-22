import { describe, expect, it } from "vitest"
import type { LmsFormState } from "../stores/lmsFormStore"
import type { RepoFormState } from "../stores/repoFormStore"
import {
  validateLmsConnection,
  validateLmsGenerate,
  validateRepo,
} from "./forms"

const validLmsForm: LmsFormState = {
  lmsType: "Canvas",
  canvas: {
    accessToken: "secret-token",
    baseUrl: "https://canvas.tue.nl",
    customUrl: "",
    urlOption: "TUE",
    courses: [{ id: "12345", name: "Test Course", status: "verified" }],
  },
  moodle: {
    accessToken: "",
    baseUrl: "",
    courses: [],
  },
  activeCourseIndex: 0,
  yamlFile: "students.yaml",
  outputFolder: "/path/to/output",
  csvFile: "student-info.csv",
  xlsxFile: "student-info.xlsx",
  memberOption: "(email, gitid)",
  includeGroup: true,
  includeMember: true,
  includeInitials: false,
  fullGroups: true,
  csv: false,
  xlsx: false,
  yaml: true,
}

const validRepoForm: RepoFormState = {
  gitServerType: "GitLab",
  github: {
    accessToken: "",
    user: "",
    studentReposOrg: "",
    templateOrg: "",
  },
  gitlab: {
    accessToken: "git-token",
    baseUrl: "https://gitlab.tue.nl",
    user: "testuser",
    studentReposGroup: "student-repos",
    templateGroup: "templates",
  },
  gitea: {
    accessToken: "",
    baseUrl: "",
    user: "",
    studentReposGroup: "",
    templateGroup: "",
  },
  yamlFile: "/path/to/students.yaml",
  targetFolder: "/path/to/target",
  assignments: "assignment1,assignment2",
  directoryLayout: "flat",
  logLevels: {
    info: true,
    debug: false,
    warning: true,
    error: true,
  },
}

describe("validateLmsConnection", () => {
  it("returns valid when LMS connection settings are complete", () => {
    const result = validateLmsConnection(validLmsForm)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("requires base URL for TUE option", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      canvas: { ...validLmsForm.canvas, baseUrl: "" },
    }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Base URL is required")
  })

  it("requires custom URL for CUSTOM option", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      canvas: {
        ...validLmsForm.canvas,
        urlOption: "CUSTOM",
        customUrl: "",
      },
    }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Custom URL is required")
  })

  it("validates URL format", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      canvas: { ...validLmsForm.canvas, baseUrl: "not-a-url" },
    }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Base URL must be a valid URL")
  })

  it("requires access token", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      canvas: { ...validLmsForm.canvas, accessToken: "" },
    }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Access token is required")
  })

  it("uses Moodle base URL for Moodle LMS type", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      lmsType: "Moodle",
      moodle: {
        accessToken: "moodle-token",
        baseUrl: "https://moodle.example.com",
        courses: [],
      },
    }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(true)
  })

  it("requires base URL for Moodle", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      lmsType: "Moodle",
      moodle: {
        accessToken: "moodle-token",
        baseUrl: "",
        courses: [],
      },
    }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Base URL is required")
  })

  it("does NOT require output folder for connection validation", () => {
    const form: LmsFormState = { ...validLmsForm, outputFolder: "" }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(true)
  })

  it("does NOT require YAML file for connection validation", () => {
    const form: LmsFormState = { ...validLmsForm, yamlFile: "" }
    const result = validateLmsConnection(form)
    expect(result.valid).toBe(true)
  })
})

describe("validateLmsGenerate", () => {
  it("returns valid for complete form", () => {
    const result = validateLmsGenerate(validLmsForm)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("includes LMS connection validation errors", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      canvas: { ...validLmsForm.canvas, accessToken: "" },
    }
    const result = validateLmsGenerate(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Access token is required")
  })

  it("requires at least one verified course", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      canvas: { ...validLmsForm.canvas, courses: [] },
    }
    const result = validateLmsGenerate(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("At least one verified course is required")
  })

  it("requires verified status on course", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      canvas: {
        ...validLmsForm.canvas,
        courses: [{ id: "12345", name: null, status: "pending" }],
      },
    }
    const result = validateLmsGenerate(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("At least one verified course is required")
  })

  it("requires YAML file", () => {
    const form: LmsFormState = { ...validLmsForm, yamlFile: "" }
    const result = validateLmsGenerate(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("YAML file is required")
  })

  it("requires output folder", () => {
    const form: LmsFormState = { ...validLmsForm, outputFolder: "" }
    const result = validateLmsGenerate(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Output folder is required")
  })

  it("requires at least one output format", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      csv: false,
      xlsx: false,
      yaml: false,
    }
    const result = validateLmsGenerate(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Select at least one output format (YAML, CSV, or XLSX)",
    )
  })

  it("accepts any output format combination", () => {
    const csvOnly: LmsFormState = {
      ...validLmsForm,
      csv: true,
      xlsx: false,
      yaml: false,
    }
    expect(validateLmsGenerate(csvOnly).valid).toBe(true)

    const xlsxOnly: LmsFormState = {
      ...validLmsForm,
      csv: false,
      xlsx: true,
      yaml: false,
    }
    expect(validateLmsGenerate(xlsxOnly).valid).toBe(true)

    const allFormats: LmsFormState = {
      ...validLmsForm,
      csv: true,
      xlsx: true,
      yaml: true,
    }
    expect(validateLmsGenerate(allFormats).valid).toBe(true)
  })
})

describe("validateRepo", () => {
  it("returns valid for complete form", () => {
    const result = validateRepo(validRepoForm)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("requires YAML file", () => {
    const form = { ...validRepoForm, yamlFile: "" }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("YAML file is required")
  })

  it("requires target folder", () => {
    const form = { ...validRepoForm, targetFolder: "" }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Target folder is required")
  })

  it("requires access token for active server (GitLab)", () => {
    const form = {
      ...validRepoForm,
      gitlab: { ...validRepoForm.gitlab, accessToken: "" },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Access token is required")
  })

  it("requires user for active server (GitLab)", () => {
    const form = {
      ...validRepoForm,
      gitlab: { ...validRepoForm.gitlab, user: "" },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("User is required")
  })

  it("requires base URL for GitLab", () => {
    const form = {
      ...validRepoForm,
      gitlab: { ...validRepoForm.gitlab, baseUrl: "" },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Base URL is required")
  })

  it("validates base URL format for GitLab", () => {
    const form = {
      ...validRepoForm,
      gitlab: { ...validRepoForm.gitlab, baseUrl: "invalid-url" },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Base URL must be a valid URL")
  })

  it("does not require base URL for GitHub", () => {
    const form = {
      ...validRepoForm,
      gitServerType: "GitHub" as const,
      github: {
        accessToken: "gh-token",
        user: "ghuser",
        studentReposOrg: "my-org",
        templateOrg: "my-templates",
      },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(true)
  })

  it("requires student repos group for GitLab", () => {
    const form = {
      ...validRepoForm,
      gitlab: { ...validRepoForm.gitlab, studentReposGroup: "" },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Student repos group is required")
  })

  it("requires template group for GitLab", () => {
    const form = {
      ...validRepoForm,
      gitlab: { ...validRepoForm.gitlab, templateGroup: "" },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Template group is required")
  })

  it("requires student repos organization for GitHub", () => {
    const form = {
      ...validRepoForm,
      gitServerType: "GitHub" as const,
      github: {
        accessToken: "gh-token",
        user: "ghuser",
        studentReposOrg: "",
        templateOrg: "my-templates",
      },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Student repos organization is required")
  })

  it("collects multiple errors", () => {
    const form = {
      ...validRepoForm,
      yamlFile: "",
      targetFolder: "",
      gitlab: { ...validRepoForm.gitlab, accessToken: "" },
    }
    const result = validateRepo(form)
    expect(result.valid).toBe(false)
    // 3 errors: yamlFile, targetFolder, accessToken
    expect(result.errors).toHaveLength(3)
  })
})
