import { describe, it, expect } from "vitest";
import { validateLms, validateRepo } from "./forms";
import type { LmsFormState } from "../stores/lmsFormStore";
import type { RepoFormState } from "../stores/repoFormStore";

const validLmsForm: LmsFormState = {
  lmsType: "Canvas",
  baseUrl: "https://canvas.tue.nl",
  customUrl: "",
  urlOption: "TUE",
  accessToken: "secret-token",
  courseId: "12345",
  courseName: "Test Course",
  yamlFile: "students.yaml",
  infoFileFolder: "",
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
};

const validRepoForm: RepoFormState = {
  accessToken: "git-token",
  user: "testuser",
  baseUrl: "https://gitlab.tue.nl",
  studentReposGroup: "student-repos",
  templateGroup: "templates",
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
};

describe("validateLms", () => {
  it("returns valid for complete form", () => {
    const result = validateLms(validLmsForm);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires base URL for TUE option", () => {
    const form = { ...validLmsForm, baseUrl: "" };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Base URL is required");
  });

  it("requires custom URL for CUSTOM option", () => {
    const form = { ...validLmsForm, urlOption: "CUSTOM" as const, customUrl: "" };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Custom URL is required");
  });

  it("validates URL format", () => {
    const form = { ...validLmsForm, baseUrl: "not-a-url" };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Base URL must be a valid URL");
  });

  it("requires access token", () => {
    const form = { ...validLmsForm, accessToken: "" };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Access token is required");
  });

  it("requires course ID", () => {
    const form = { ...validLmsForm, courseId: "" };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Course ID is required");
  });

  it("requires YAML file", () => {
    const form = { ...validLmsForm, yamlFile: "" };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("YAML file is required");
  });

  it("requires at least one output format", () => {
    const form = { ...validLmsForm, csv: false, xlsx: false, yaml: false };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Select at least one output format (YAML, CSV, or XLSX)");
  });

  it("accepts any output format combination", () => {
    const csvOnly = { ...validLmsForm, csv: true, xlsx: false, yaml: false };
    expect(validateLms(csvOnly).valid).toBe(true);

    const xlsxOnly = { ...validLmsForm, csv: false, xlsx: true, yaml: false };
    expect(validateLms(xlsxOnly).valid).toBe(true);

    const allFormats = { ...validLmsForm, csv: true, xlsx: true, yaml: true };
    expect(validateLms(allFormats).valid).toBe(true);
  });

  it("uses custom URL for non-Canvas LMS types", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      lmsType: "Moodle",
      customUrl: "https://moodle.example.com",
    };
    const result = validateLms(form);
    expect(result.valid).toBe(true);
  });

  it("requires custom URL for Moodle", () => {
    const form: LmsFormState = {
      ...validLmsForm,
      lmsType: "Moodle",
      customUrl: "",
    };
    const result = validateLms(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Custom URL is required");
  });
});

describe("validateRepo", () => {
  it("returns valid for complete form", () => {
    const result = validateRepo(validRepoForm);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires YAML file", () => {
    const form = { ...validRepoForm, yamlFile: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("YAML file is required");
  });

  it("requires target folder", () => {
    const form = { ...validRepoForm, targetFolder: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Target folder is required");
  });

  it("requires access token", () => {
    const form = { ...validRepoForm, accessToken: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Access token is required");
  });

  it("requires user", () => {
    const form = { ...validRepoForm, user: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("User is required");
  });

  it("requires base URL", () => {
    const form = { ...validRepoForm, baseUrl: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Base URL is required");
  });

  it("validates base URL format", () => {
    const form = { ...validRepoForm, baseUrl: "invalid-url" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Base URL must be a valid URL");
  });

  it("requires student repos group", () => {
    const form = { ...validRepoForm, studentReposGroup: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Student repos group is required");
  });

  it("requires template group", () => {
    const form = { ...validRepoForm, templateGroup: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Template group is required");
  });

  it("collects multiple errors", () => {
    const form = { ...validRepoForm, yamlFile: "", targetFolder: "", accessToken: "" };
    const result = validateRepo(form);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });
});
