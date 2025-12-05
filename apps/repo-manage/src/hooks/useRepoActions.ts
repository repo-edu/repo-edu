import { formatError } from "../services/commandUtils"
import * as repoService from "../services/repoService"
import { useOutputStore, useRepoFormStore } from "../stores"
import { validateRepo } from "../validation/forms"

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
    output.appendWithNewline("Verifying configuration...")
    try {
      const result = await repoService.verifyConfig({
        access_token: repo.accessToken,
        user: repo.user,
        base_url: repo.baseUrl,
        student_repos_group: repo.studentReposGroup,
        template_group: repo.templateGroup,
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
    output.appendWithNewline("Creating student repositories...")
    output.appendWithNewline(`Teams: ${repo.yamlFile}`)
    output.appendWithNewline(`Assignments: ${repo.assignments}`)
    output.appendWithNewline("")
    try {
      const result = await repoService.setupRepos({
        config: {
          access_token: repo.accessToken,
          user: repo.user,
          base_url: repo.baseUrl,
          student_repos_group: repo.studentReposGroup,
          template_group: repo.templateGroup,
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
