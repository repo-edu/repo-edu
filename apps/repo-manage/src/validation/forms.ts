import type { LmsFormState } from "../stores/lmsFormStore"
import type { RepoFormState } from "../stores/repoFormStore"

const urlRegex = /^https?:\/\/.+/i

function require(value: string, label: string, errors: string[]) {
  if (!value || value.trim() === "") {
    errors.push(`${label} is required`)
  }
}

function requireUrl(value: string, label: string, errors: string[]) {
  if (!value || value.trim() === "") {
    errors.push(`${label} is required`)
  } else if (!urlRegex.test(value.trim())) {
    errors.push(`${label} must be a valid URL`)
  }
}

/** Validate LMS connection settings (URL and token only, for per-course verification) */
export function validateLmsConnection(form: LmsFormState) {
  const errors: string[] = []

  const isCanvas = form.lmsType === "Canvas"
  if (isCanvas) {
    const config = form.canvas
    const isCustom = config.urlOption === "CUSTOM"
    const urlToCheck = isCustom ? config.customUrl : config.baseUrl
    requireUrl(urlToCheck, isCustom ? "Custom URL" : "Base URL", errors)
    require(config.accessToken, "Access token", errors)
  } else {
    const config = form.moodle
    requireUrl(config.baseUrl, "Base URL", errors)
    require(config.accessToken, "Access token", errors)
  }

  return { valid: errors.length === 0, errors }
}

/** Validate LMS + output settings (for Generate Files button) */
export function validateLmsGenerate(form: LmsFormState) {
  const errors: string[] = []

  // First validate connection settings
  const connectionResult = validateLmsConnection(form)
  errors.push(...connectionResult.errors)

  // Validate that at least one course is verified
  const courses =
    form.lmsType === "Canvas" ? form.canvas.courses : form.moodle.courses
  const verifiedCourses = courses.filter((c) => c.status === "verified")
  if (verifiedCourses.length === 0) {
    errors.push("At least one verified course is required")
  }

  // Then validate output settings
  require(form.yamlFile, "YAML file", errors)
  require(form.outputFolder, "Output folder", errors)

  if (!form.csv && !form.xlsx && !form.yaml) {
    errors.push("Select at least one output format (YAML, CSV, or XLSX)")
  }

  return { valid: errors.length === 0, errors }
}

export function validateRepo(form: RepoFormState) {
  const errors: string[] = []

  require(form.yamlFile, "YAML file", errors)
  require(form.targetFolder, "Target folder", errors)

  // Validate active git server config (including per-server org/group)
  switch (form.gitServerType) {
    case "GitHub":
      require(form.github.accessToken, "Access token", errors)
      require(form.github.user, "User", errors)
      require(form.github.studentReposOrg, "Student repos organization", errors)
      require(form.github.templateOrg, "Template organization", errors)
      break
    case "GitLab":
      require(form.gitlab.accessToken, "Access token", errors)
      require(form.gitlab.user, "User", errors)
      requireUrl(form.gitlab.baseUrl, "Base URL", errors)
      require(form.gitlab.studentReposGroup, "Student repos group", errors)
      require(form.gitlab.templateGroup, "Template group", errors)
      break
    case "Gitea":
      require(form.gitea.accessToken, "Access token", errors)
      require(form.gitea.user, "User", errors)
      requireUrl(form.gitea.baseUrl, "Base URL", errors)
      require(form.gitea.studentReposGroup, "Student repos group", errors)
      require(form.gitea.templateGroup, "Template group", errors)
      break
  }

  return { valid: errors.length === 0, errors }
}
