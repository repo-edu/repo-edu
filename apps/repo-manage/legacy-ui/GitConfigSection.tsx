import {
  Button,
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useRepoFormStore, useUiStore } from "../stores"
import type { GitServerType } from "../stores/repoFormStore"
import { FormField } from "./FormField"
import { Section } from "./Section"

export function GitConfigSection() {
  const repoForm = useRepoFormStore()
  const ui = useUiStore()

  const isGitHub = repoForm.gitServerType === "GitHub"
  const isGitLab = repoForm.gitServerType === "GitLab"
  const isGitea = repoForm.gitServerType === "Gitea"

  // Get active config for the current server type
  const activeConfig = repoForm.getActiveConfig()

  // Dynamic labels based on server type
  const orgLabel = isGitHub ? "Organization" : "Group"
  const studentReposLabel = `Student Repos ${orgLabel}`
  const templateLabel = `Template ${orgLabel}`

  // Get/set access token for active server
  const handleAccessTokenChange = (value: string) => {
    if (isGitHub) repoForm.setGitHubField("accessToken", value)
    else if (isGitLab) repoForm.setGitLabField("accessToken", value)
    else repoForm.setGiteaField("accessToken", value)
  }

  // Get/set user for active server
  const handleUserChange = (value: string) => {
    if (isGitHub) repoForm.setGitHubField("user", value)
    else if (isGitLab) repoForm.setGitLabField("user", value)
    else repoForm.setGiteaField("user", value)
  }

  // Get/set base URL for active server (only GitLab/Gitea)
  const handleBaseUrlChange = (value: string) => {
    if (isGitLab) repoForm.setGitLabField("baseUrl", value)
    else if (isGitea) repoForm.setGiteaField("baseUrl", value)
  }

  // Get base URL for display (only GitLab/Gitea have editable base URLs)
  const getBaseUrl = () => {
    if (isGitLab) return repoForm.gitlab.baseUrl
    if (isGitea) return repoForm.gitea.baseUrl
    return ""
  }

  // Get student repos value for active server
  const getStudentRepos = () => {
    if (isGitHub) return repoForm.github.studentReposOrg
    if (isGitLab) return repoForm.gitlab.studentReposGroup
    return repoForm.gitea.studentReposGroup
  }

  // Get template value for active server
  const getTemplate = () => {
    if (isGitHub) return repoForm.github.templateOrg
    if (isGitLab) return repoForm.gitlab.templateGroup
    return repoForm.gitea.templateGroup
  }

  // Set student repos for active server
  const handleStudentReposChange = (value: string) => {
    if (isGitHub) repoForm.setGitHubField("studentReposOrg", value)
    else if (isGitLab) repoForm.setGitLabField("studentReposGroup", value)
    else repoForm.setGiteaField("studentReposGroup", value)
  }

  // Set template for active server
  const handleTemplateChange = (value: string) => {
    if (isGitHub) repoForm.setGitHubField("templateOrg", value)
    else if (isGitLab) repoForm.setGitLabField("templateGroup", value)
    else repoForm.setGiteaField("templateGroup", value)
  }

  return (
    <Section id="git-config" title="Git Server Configuration">
      {/* Server Type Dropdown */}
      <FormField label="Server Type" tooltip="Git hosting platform">
        <Select
          value={repoForm.gitServerType}
          onValueChange={(v) => repoForm.setGitServerType(v as GitServerType)}
        >
          <SelectTrigger size="xs" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GitHub" size="xs">
              GitHub
            </SelectItem>
            <SelectItem value="GitLab" size="xs">
              GitLab
            </SelectItem>
            <SelectItem value="Gitea" size="xs">
              Gitea
            </SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {/* Base URL - only for GitLab/Gitea */}
      {(isGitLab || isGitea) && (
        <FormField
          label="Base URL"
          tooltip={`${repoForm.gitServerType} server URL`}
        >
          <Input
            size="xs"
            value={getBaseUrl()}
            onChange={(e) => handleBaseUrlChange(e.target.value)}
            placeholder={
              isGitLab ? "https://gitlab.tue.nl" : "https://gitea.example.com"
            }
            className="flex-1"
          />
        </FormField>
      )}

      {/* Access Token - per server type */}
      <FormField
        label="Access Token"
        tooltip={`${repoForm.gitServerType} personal access token`}
      >
        <div className="flex gap-1 flex-1">
          <Input
            size="xs"
            type={activeConfig.accessToken ? "password" : "text"}
            value={activeConfig.accessToken}
            onChange={(e) => handleAccessTokenChange(e.target.value)}
            placeholder={activeConfig.accessToken ? "••••••••" : "Not set"}
            className={cn(
              "flex-1 password-input",
              !activeConfig.accessToken && "token-empty",
            )}
          />
          <Button
            size="xs"
            variant="outline"
            onClick={() => ui.openTokenDialog(activeConfig.accessToken)}
          >
            Edit
          </Button>
        </div>
      </FormField>

      {/* User */}
      <FormField label="User" tooltip="Your Git username">
        <Input
          size="xs"
          value={activeConfig.user}
          onChange={(e) => handleUserChange(e.target.value)}
          placeholder="username"
          className="flex-1"
        />
      </FormField>

      {/* Student Repos Group/Organization */}
      <FormField
        label={studentReposLabel}
        tooltip={`${orgLabel} path for student repositories`}
      >
        <Input
          size="xs"
          value={getStudentRepos()}
          onChange={(e) => handleStudentReposChange(e.target.value)}
          placeholder={
            isGitHub ? "my-org/student-repos" : "course/student-repos"
          }
          className="flex-1"
        />
      </FormField>

      {/* Template Group/Organization */}
      <FormField
        label={templateLabel}
        tooltip={`${orgLabel} path containing templates`}
      >
        <Input
          size="xs"
          value={getTemplate()}
          onChange={(e) => handleTemplateChange(e.target.value)}
          placeholder={isGitHub ? "my-org/templates" : "course/templates"}
          className="flex-1"
        />
      </FormField>
    </Section>
  )
}
