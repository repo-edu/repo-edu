import type { LmsFormState } from "../stores/lmsFormStore";
import type { RepoFormState } from "../stores/repoFormStore";

const urlRegex = /^https?:\/\/.+/i;

function require(value: string, label: string, errors: string[]) {
  if (!value || value.trim() === "") {
    errors.push(`${label} is required`);
  }
}

function requireUrl(value: string, label: string, errors: string[]) {
  if (!value || value.trim() === "") {
    errors.push(`${label} is required`);
  } else if (!urlRegex.test(value.trim())) {
    errors.push(`${label} must be a valid URL`);
  }
}

export function validateLms(form: LmsFormState) {
  const errors: string[] = [];

  const isCustom = form.urlOption === "CUSTOM" || form.lmsType !== "Canvas";
  const urlToCheck = isCustom ? form.customUrl : form.baseUrl;

  requireUrl(urlToCheck, isCustom ? "Custom URL" : "Base URL", errors);
  require(form.accessToken, "Access token", errors);
  require(form.courseId, "Course ID", errors);
  require(form.yamlFile, "YAML file", errors);

  if (!form.csv && !form.xlsx && !form.yaml) {
    errors.push("Select at least one output format (YAML, CSV, or XLSX)");
  }

  return { valid: errors.length === 0, errors };
}

export function validateRepo(form: RepoFormState) {
  const errors: string[] = [];

  require(form.yamlFile, "YAML file", errors);
  require(form.targetFolder, "Target folder", errors);
  require(form.accessToken, "Access token", errors);
  require(form.user, "User", errors);
  requireUrl(form.baseUrl, "Base URL", errors);
  require(form.studentReposGroup, "Student repos group", errors);
  require(form.templateGroup, "Template group", errors);

  return { valid: errors.length === 0, errors };
}
