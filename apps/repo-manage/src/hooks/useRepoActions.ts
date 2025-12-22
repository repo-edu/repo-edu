import { formatError } from "../services/commandUtils"
import * as repoService from "../services/repoService"
import { useOutputStore, useRepoFormStore } from "../stores"
import type { RepoFormState } from "../stores/repoFormStore"
import { validateRepo } from "../validation/forms"

/**
 * Helper to get the base URL for the active git server type.
 * GitHub always uses github.com, GitLab/Gitea use their configured base URLs.
 */
function getBaseUrl(repo: RepoFormState) {
  switch (repo.gitServerType) {
    case "GitHub":
      return "https://github.com"
    case "GitLab":
      return repo.gitlab.baseUrl
    case "Gitea":
      return repo.gitea.baseUrl
  }
}

/**
 * Helper to get the active config values (access_token, user) for the selected server type.
 */
function getActiveCredentials(repo: RepoFormState) {
  switch (repo.gitServerType) {
    case "GitHub":
      return { accessToken: repo.github.accessToken, user: repo.github.user }
    case "GitLab":
      return { accessToken: repo.gitlab.accessToken, user: repo.gitlab.user }
    case "Gitea":
      return { accessToken: repo.gitea.accessToken, user: repo.gitea.user }
  }
}

/**
 * Helper to get the student repos org/group for the active git server type.
 */
function getStudentRepos(repo: RepoFormState) {
  switch (repo.gitServerType) {
    case "GitHub":
      return repo.github.studentReposOrg
    case "GitLab":
      return repo.gitlab.studentReposGroup
    case "Gitea":
      return repo.gitea.studentReposGroup
  }
}

/**
 * Helper to get the template org/group for the active git server type.
 */
function getTemplate(repo: RepoFormState) {
  switch (repo.gitServerType) {
    case "GitHub":
      return repo.github.templateOrg
    case "GitLab":
      return repo.gitlab.templateGroup
    case "Gitea":
      return repo.gitea.templateGroup
  }
}

/**
 * Hook providing repository-related actions (verify config, create repos).
 */
export function useRepoActions() {
  const repoForm = useRepoFormStore()
  const output = useOutputStore()

  const handleVerifyConfig = async () => {
    const repoValidation = validateRepo(repoForm.getState())
    if (!repoValidation.valid) {
      output.appendWithNewline("⚠ Cannot verify: fix repo form errors first")
      return
    }
    const repo = repoForm.getState()
    const creds = getActiveCredentials(repo)
    output.appendWithNewline("Verifying configuration...")
    try {
      const result = await repoService.verifyConfig({
        access_token: creds.accessToken,
        user: creds.user,
        base_url: getBaseUrl(repo),
        student_repos: getStudentRepos(repo),
        template: getTemplate(repo),
      })
      output.appendWithNewline(result.message)
      if (result.details) {
        output.appendWithNewline(result.details)
      }
    } catch (error: unknown) {
      const { message, details } = formatError(error)
      output.appendWithNewline(`✗ Error: ${message}`)
      if (details) {
        output.appendWithNewline(details)
      }
    }
  }

  const handleCreateRepos = async () => {
    const repoValidation = validateRepo(repoForm.getState())
    if (!repoValidation.valid) {
      output.appendWithNewline(
        "⚠ Cannot create repos: fix repo form errors first",
      )
      return
    }
    const repo = repoForm.getState()
    const creds = getActiveCredentials(repo)
    output.appendWithNewline("Creating student repositories...")
    output.appendWithNewline(`Teams: ${repo.yamlFile}`)
    output.appendWithNewline(`Assignments: ${repo.assignments}`)
    output.appendWithNewline("")
    try {
      const result = await repoService.setupRepos({
        config: {
          access_token: creds.accessToken,
          user: creds.user,
          base_url: getBaseUrl(repo),
          student_repos: getStudentRepos(repo),
          template: getTemplate(repo),
        },
        yaml_file: repo.yamlFile,
        assignments: repo.assignments,
      })
      if (result.message) output.appendWithNewline(result.message)
      if (result.details) output.appendWithNewline(result.details)
    } catch (error: unknown) {
      const { message, details } = formatError(error)
      output.appendWithNewline(`✗ Error: ${message}`)
      if (details) {
        output.appendWithNewline(details)
      }
    }
  }

  return { handleVerifyConfig, handleCreateRepos }
}
