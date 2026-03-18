import type {
  AppError,
  AppValidationIssue,
  DiagnosticOutput,
  MilestoneProgress,
  RepositoryBatchInput,
  RepositoryCloneResult,
  RepositoryCreateResult,
  RepositoryUpdateInput,
  RepositoryUpdateResult,
  VerifyGitDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type {
  PersistedCourse,
  PlannedRepositoryGroup,
  RepositoryTemplate,
  ValidationResult,
} from "@repo-edu/domain"
import { planRepositoryOperation, resolveGitUsernames } from "@repo-edu/domain"
import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  PatchFile,
  PatchFileStatus,
} from "@repo-edu/integrations-git-contract"
import { createValidationAppError } from "./core.js"
import {
  isSharedAppError,
  normalizeProviderError,
  resolveAppSettingsSnapshot,
  resolveCourseSnapshot,
  resolveGitDraft,
  throwIfAborted,
  toCancelledAppError,
} from "./workflow-helpers.js"
export type RepositoryWorkflowPorts = {
  git: Pick<
    GitProviderClient,
    | "createRepositories"
    | "createTeam"
    | "assignRepositoriesToTeam"
    | "getRepositoryDefaultBranchHead"
    | "getTemplateDiff"
    | "createBranch"
    | "createPullRequest"
    | "resolveRepositoryCloneUrls"
  >
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
}

type PlannedRepositoryWithTemplate = {
  group: PlannedRepositoryGroup
  template: RepositoryTemplate | null
}

type RepositoryCreateBatch = {
  template: RepositoryTemplate | null
  repositoryNames: string[]
}

type PlannedTeamSetup = {
  groupId: string
  teamName: string
  memberIds: string[]
  repositoryNames: string[]
}

function resolveAssignment(
  course: PersistedCourse,
  assignmentId: string,
): PersistedCourse["roster"]["assignments"][number] | null {
  return (
    course.roster.assignments.find(
      (assignment) => assignment.id === assignmentId,
    ) ?? null
  )
}

function resolveGroupSetRepoNameTemplate(
  course: PersistedCourse,
  assignmentId: string,
): string | undefined {
  const assignment = resolveAssignment(course, assignmentId)
  if (assignment === null) {
    return undefined
  }
  const groupSet = course.roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  )
  if (groupSet?.repoNameTemplate === null || groupSet === undefined) {
    return undefined
  }
  return groupSet.repoNameTemplate
}

function resolveAssignmentRepositoryTemplate(
  course: PersistedCourse,
  assignmentId: string,
  fallbackTemplate: RepositoryTemplate | null,
): RepositoryTemplate | null {
  const assignment = resolveAssignment(course, assignmentId)
  if (assignment?.repositoryTemplate !== undefined) {
    return assignment.repositoryTemplate
  }
  return fallbackTemplate
}

function templateKey(template: RepositoryTemplate | null): string {
  if (template === null) {
    return "__none__"
  }
  if (template.kind === "local") {
    return `local:${template.path}:${template.visibility}`
  }
  return `remote:${template.owner}/${template.name}:${template.visibility}`
}

function describeTemplate(template: RepositoryTemplate | null): string {
  if (template === null) {
    return "no template"
  }
  if (template.kind === "local") {
    return `local:${template.path} (${template.visibility})`
  }
  return `${template.owner}/${template.name} (${template.visibility})`
}

function collectRepositoryGroups(
  course: PersistedCourse,
  assignmentId: string | null,
  groupIds?: readonly string[],
): ValidationResult<PlannedRepositoryGroup[]> {
  const assignmentIds =
    assignmentId === null
      ? course.roster.assignments.map((assignment) => assignment.id)
      : [assignmentId]
  const selectedGroupIds = groupIds ? new Set(groupIds) : null

  const plannedGroups: PlannedRepositoryGroup[] = []
  for (const selectedAssignmentId of assignmentIds) {
    const repoNameTemplate = resolveGroupSetRepoNameTemplate(
      course,
      selectedAssignmentId,
    )
    const plan = planRepositoryOperation(
      course.roster,
      selectedAssignmentId,
      repoNameTemplate,
    )
    if (!plan.ok) {
      return plan
    }
    const groups =
      selectedGroupIds === null
        ? plan.value.groups
        : plan.value.groups.filter((group) =>
            selectedGroupIds.has(group.groupId),
          )
    plannedGroups.push(...groups)
  }

  return {
    ok: true,
    value: plannedGroups,
  }
}

function planRepositoriesWithTemplates(
  course: PersistedCourse,
  groups: readonly PlannedRepositoryGroup[],
  fallbackTemplate: RepositoryTemplate | null,
): ValidationResult<PlannedRepositoryWithTemplate[]> {
  const repoTemplateKeyByName = new Map<string, string>()
  const groupIdByRepoName = new Map<string, string>()
  const planned: PlannedRepositoryWithTemplate[] = []

  for (const group of groups) {
    const effectiveTemplate = resolveAssignmentRepositoryTemplate(
      course,
      group.assignmentId,
      fallbackTemplate,
    )
    const key = templateKey(effectiveTemplate)
    const existingTemplateKey = repoTemplateKeyByName.get(group.repoName)
    if (existingTemplateKey !== undefined && existingTemplateKey !== key) {
      return {
        ok: false,
        issues: [
          {
            path: "input.assignmentId",
            message: `Repository '${group.repoName}' resolves to multiple templates. Use unique repo names or a single template per repository name.`,
          },
        ],
      }
    }

    const existingGroupId = groupIdByRepoName.get(group.repoName)
    if (existingGroupId !== undefined && existingGroupId !== group.groupId) {
      return {
        ok: false,
        issues: [
          {
            path: "input.assignmentId",
            message: `Repository name collision: '${group.repoName}' is produced by multiple groups.`,
          },
        ],
      }
    }

    repoTemplateKeyByName.set(group.repoName, key)
    groupIdByRepoName.set(group.repoName, group.groupId)
    planned.push({
      group,
      template: effectiveTemplate,
    })
  }

  return {
    ok: true,
    value: planned,
  }
}

function createRepositoryBatches(
  planned: readonly PlannedRepositoryWithTemplate[],
): RepositoryCreateBatch[] {
  const batchesByTemplateKey = new Map<
    string,
    { template: RepositoryTemplate | null; repositoryNames: Set<string> }
  >()

  for (const entry of planned) {
    const key = templateKey(entry.template)
    const existing = batchesByTemplateKey.get(key)
    if (existing) {
      existing.repositoryNames.add(entry.group.repoName)
      continue
    }
    batchesByTemplateKey.set(key, {
      template: entry.template,
      repositoryNames: new Set([entry.group.repoName]),
    })
  }

  return Array.from(batchesByTemplateKey.values()).map((batch) => ({
    template: batch.template,
    repositoryNames: Array.from(batch.repositoryNames),
  }))
}

function planTeamSetup(
  groups: readonly PlannedRepositoryGroup[],
): PlannedTeamSetup[] {
  const teamsByGroupId = new Map<
    string,
    {
      teamName: string
      memberIds: Set<string>
      repositoryNames: Set<string>
    }
  >()

  for (const group of groups) {
    const existing = teamsByGroupId.get(group.groupId)
    if (existing) {
      group.activeMemberIds.forEach((memberId) => {
        existing.memberIds.add(memberId)
      })
      existing.repositoryNames.add(group.repoName)
      continue
    }

    teamsByGroupId.set(group.groupId, {
      teamName: group.groupName,
      memberIds: new Set(group.activeMemberIds),
      repositoryNames: new Set([group.repoName]),
    })
  }

  return Array.from(teamsByGroupId.entries()).map(([groupId, team]) => ({
    groupId,
    teamName: team.teamName,
    memberIds: Array.from(team.memberIds),
    repositoryNames: Array.from(team.repositoryNames),
  }))
}

function uniqueRepositoryNames(
  groups: readonly PlannedRepositoryGroup[],
): string[] {
  return Array.from(new Set(groups.map((group) => group.repoName)))
}

function resolveRequiredAssignment(
  course: PersistedCourse,
  assignmentId: string,
) {
  const assignment = resolveAssignment(course, assignmentId)
  if (assignment !== null) {
    return assignment
  }
  throw createValidationAppError("Repository update assignment is invalid.", [
    {
      path: "input.assignmentId",
      message: `Assignment '${assignmentId}' was not found.`,
    },
  ])
}

function formatTemplateUpdateBody(
  assignmentName: string,
  fromSha: string,
  toSha: string,
  files: ReadonlyArray<{
    path: string
    previousPath: string | null
    status: string
  }>,
): string {
  const header = [
    `Template update for assignment '${assignmentName}'.`,
    "",
    `Source template diff: ${fromSha.slice(0, 7)} -> ${toSha.slice(0, 7)}`,
    "",
    "Changed files:",
  ]
  const lines =
    files.length === 0
      ? ["- (No changed files reported by provider)"]
      : files.map((file) =>
          file.status === "renamed" && file.previousPath
            ? `- ${file.status}: ${file.previousPath} -> ${file.path}`
            : `- ${file.status}: ${file.path}`,
        )
  return header.concat(lines).join("\n")
}

type RepositoryDirectoryLayout = "flat" | "by-team" | "by-task"

function normalizeDirectoryLayout(
  value: RepositoryBatchInput["directoryLayout"],
): RepositoryDirectoryLayout {
  if (value === "by-team" || value === "by-task") {
    return value
  }
  return "flat"
}

function normalizeTargetDirectory(value: string | undefined): string {
  const normalized = value?.trim()
  return normalized === undefined || normalized === "" ? "." : normalized
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    return "unnamed"
  }
  return trimmed.replace(/[\\/]/g, "_")
}

function joinPath(base: string, segment: string): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/"
  const normalizedBase = base.replace(/[\\/]+$/g, "")
  const normalizedSegment = segment.replace(/^[\\/]+/g, "")
  if (normalizedBase === "") {
    return normalizedSegment
  }
  return `${normalizedBase}${separator}${normalizedSegment}`
}

function repositoryCloneParentPath(
  targetDirectory: string,
  layout: RepositoryDirectoryLayout,
  group: PlannedRepositoryGroup,
): string {
  if (layout === "flat") {
    return targetDirectory
  }

  const folderName =
    layout === "by-team"
      ? sanitizePathSegment(group.groupName)
      : sanitizePathSegment(group.assignmentName)
  return joinPath(targetDirectory, folderName)
}

function repositoryClonePath(
  targetDirectory: string,
  layout: RepositoryDirectoryLayout,
  group: PlannedRepositoryGroup,
): string {
  return joinPath(
    repositoryCloneParentPath(targetDirectory, layout, group),
    sanitizePathSegment(group.repoName),
  )
}

const TEMP_CLONE_DIRECTORY_NAME = ".repo-edu-clone-tmp"

function repositoryCloneTempRoot(targetDirectory: string): string {
  return joinPath(targetDirectory, TEMP_CLONE_DIRECTORY_NAME)
}

function repositoryCloneTempPath(
  tempRoot: string,
  repoName: string,
  index: number,
): string {
  return joinPath(tempRoot, `${sanitizePathSegment(repoName)}-${index}`)
}

function requireGitOrganization(
  course: PersistedCourse,
  operation: "repo.create" | "repo.clone" | "repo.update",
): string {
  if (course.organization === null || course.organization.trim() === "") {
    throw createValidationAppError(
      "Course is missing organization for repository workflows.",
      [
        {
          path: "course.organization",
          message: `Set an organization before running ${operation}.`,
        },
      ],
    )
  }
  return course.organization
}

function normalizeRepositoryExecutionError(
  error: unknown,
  operation: string,
): AppError {
  if (isSharedAppError(error)) {
    return error
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return toCancelledAppError()
  }

  return {
    type: "provider",
    message: error instanceof Error ? error.message : String(error),
    provider: "git",
    operation,
    retryable: true,
  }
}

export function createRepositoryWorkflowHandlers(
  ports: RepositoryWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"repo.create" | "repo.clone" | "repo.update">,
  "repo.create" | "repo.clone" | "repo.update"
> {
  return {
    "repo.create": async (
      input: RepositoryBatchInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryCreateResult> => {
      const totalSteps = 7
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const gitDraft = resolveGitDraft(course, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Course does not reference a Git connection.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.create")

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(
          course,
          input.assignmentId,
          input.groupIds,
        )
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        const plannedWithTemplates = planRepositoriesWithTemplates(
          course,
          planned.value,
          input.template,
        )
        if (!plannedWithTemplates.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            plannedWithTemplates.issues,
          )
        }

        if (planned.value.length === 0) {
          options?.onProgress?.({
            step: totalSteps,
            totalSteps,
            label: "Repository create workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            repositoriesCreated: 0,
            repositoriesAlreadyExisted: 0,
            repositoriesFailed: 0,
            templateCommitShas: {},
            completedAt: new Date().toISOString(),
          }
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Creating repositories through Git provider client.",
        })
        const batches = createRepositoryBatches(plannedWithTemplates.value)
        const created: Awaited<
          ReturnType<GitProviderClient["createRepositories"]>
        >["created"] = []
        const alreadyExisted: Awaited<
          ReturnType<GitProviderClient["createRepositories"]>
        >["alreadyExisted"] = []
        const failed: Awaited<
          ReturnType<GitProviderClient["createRepositories"]>
        >["failed"] = []

        for (const batch of batches) {
          const createResult = await ports.git.createRepositories(
            gitDraft,
            {
              organization,
              repositoryNames: batch.repositoryNames,
              visibility: batch.template?.visibility ?? "private",
              autoInit: batch.template === null,
            },
            options?.signal,
          )
          created.push(...createResult.created)
          alreadyExisted.push(...createResult.alreadyExisted)
          failed.push(...createResult.failed)
          options?.onOutput?.({
            channel: "info",
            message: `Create batch (${describeTemplate(batch.template)}): created ${createResult.created.length}, existing ${createResult.alreadyExisted.length}, failed ${createResult.failed.length}.`,
          })
        }

        for (const repository of alreadyExisted) {
          options?.onOutput?.({
            channel: "info",
            message: `Repository '${repository.repositoryName}' already exists.`,
          })
        }
        for (const repository of failed) {
          options?.onOutput?.({
            channel: "warn",
            message: `Repository '${repository.repositoryName}' failed: ${repository.reason}`,
          })
        }

        const successfulRepositoryNames = new Set(
          created
            .concat(alreadyExisted)
            .map((repository) => repository.repositoryName),
        )
        if (planned.value.length > 0 && successfulRepositoryNames.size === 0) {
          throw {
            type: "provider",
            message: "Repository creation failed for all planned repositories.",
            provider: providerForError,
            operation: "createRepositories",
            retryable: true,
          } satisfies AppError
        }

        // Step 4: Push template content to newly created repos.
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Pushing template content to repositories.",
        })

        const templateCommitShas: Record<string, string> = {}
        const templateBatches = batches.filter(
          (batch) => batch.template !== null,
        )

        const newlyCreatedNames = new Set(created.map((r) => r.repositoryName))
        const tmpDirsToCleanup: string[] = []

        for (const batch of templateBatches) {
          const template = batch.template
          if (template === null) continue
          const reposToPopulate = batch.repositoryNames.filter((name) =>
            newlyCreatedNames.has(name),
          )

          if (reposToPopulate.length === 0) {
            continue
          }

          let templateLocalPath: string

          if (template.kind === "local") {
            templateLocalPath = template.path
          } else {
            // Clone remote template to tmpdir.
            const tmpDir =
              await ports.fileSystem.createTempDirectory("repo-edu-template-")
            tmpDirsToCleanup.push(tmpDir)

            const templateAuthUrl = (
              await ports.git.resolveRepositoryCloneUrls(
                gitDraft,
                {
                  organization: template.owner,
                  repositoryNames: [template.name],
                },
                options?.signal,
              )
            ).resolved[0]?.cloneUrl

            if (!templateAuthUrl) {
              options?.onOutput?.({
                channel: "warn",
                message: `Could not resolve clone URL for template '${describeTemplate(template)}'.`,
              })
              continue
            }

            const cloned = await cloneRemoteTemplateToTmpdir(
              ports.gitCommand,
              templateAuthUrl,
              tmpDir,
              options?.signal,
            )
            if (!cloned) {
              options?.onOutput?.({
                channel: "warn",
                message: `Failed to clone template '${describeTemplate(template)}'.`,
              })
              continue
            }

            templateLocalPath = tmpDir
          }

          const defaultBranch = await resolveLocalDefaultBranch(
            ports.gitCommand,
            templateLocalPath,
            options?.signal,
          )

          // Resolve auth URLs for target repos.
          const targetUrls = await ports.git.resolveRepositoryCloneUrls(
            gitDraft,
            { organization, repositoryNames: reposToPopulate },
            options?.signal,
          )

          const pushItems = targetUrls.resolved.map((r) => ({
            repoName: r.repositoryName,
            authUrl: r.cloneUrl,
          }))

          const pushResults = await mapConcurrent(
            pushItems,
            async (item) => {
              const ok = await pushTemplateToRepo(
                ports.gitCommand,
                templateLocalPath,
                item.authUrl,
                defaultBranch,
                options?.signal,
              )
              if (!ok) {
                options?.onOutput?.({
                  channel: "warn",
                  message: `Failed to push template to '${item.repoName}'.`,
                })
              }
              return ok
            },
            8,
          )

          const pushSuccessCount = pushResults.filter(Boolean).length
          options?.onOutput?.({
            channel: "info",
            message: `Pushed template '${describeTemplate(template)}' to ${pushSuccessCount}/${pushItems.length} repositories.`,
          })

          // Capture template commit SHA.
          try {
            const sha = await resolveLocalTemplateSha(
              ports.gitCommand,
              templateLocalPath,
              options?.signal,
            )
            if (sha !== null) {
              for (const entry of plannedWithTemplates.value) {
                if (
                  entry.template !== null &&
                  templateKey(entry.template) === templateKey(template) &&
                  successfulRepositoryNames.has(entry.group.repoName)
                ) {
                  templateCommitShas[entry.group.assignmentId] = sha
                }
              }
            }
          } catch {
            // Best-effort: template commit tracking should not fail repo creation.
          }
        }

        // Cleanup temporary directories.
        for (const tmpDir of tmpDirsToCleanup) {
          try {
            await ports.fileSystem.applyBatch({
              operations: [{ kind: "delete-path", path: tmpDir }],
            })
          } catch {
            // Best-effort cleanup.
          }
        }

        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Creating teams and assigning members.",
        })
        const teams = planTeamSetup(planned.value)
        const teamSlugByGroupId = new Map<string, string>()
        for (const team of teams) {
          const usernames = resolveGitUsernames(course.roster, team.memberIds)
          for (const missingMemberId of usernames.missing) {
            options?.onOutput?.({
              channel: "warn",
              message: `Skipping member '${missingMemberId}' for team '${team.teamName}' (missing Git username).`,
            })
          }

          try {
            const result = await ports.git.createTeam(
              gitDraft,
              {
                organization,
                teamName: team.teamName,
                memberUsernames: usernames.resolved.map(
                  (resolved) => resolved.gitUsername,
                ),
                permission: "push",
              },
              options?.signal,
            )
            teamSlugByGroupId.set(team.groupId, result.teamSlug)
            if (result.membersNotFound.length > 0) {
              options?.onOutput?.({
                channel: "warn",
                message: `Team '${team.teamName}' missing members: ${result.membersNotFound.join(", ")}.`,
              })
            }
            options?.onOutput?.({
              channel: "info",
              message: `Team '${team.teamName}' ${result.created ? "created" : "reused"} with ${result.membersAdded.length} members added.`,
            })
          } catch (error) {
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to create team '${team.teamName}': ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 6,
          totalSteps,
          label: "Assigning repositories to teams.",
        })
        for (const team of teams) {
          const teamSlug = teamSlugByGroupId.get(team.groupId)
          if (teamSlug === undefined) {
            continue
          }
          const repositoryNames = team.repositoryNames.filter(
            (repositoryName) => successfulRepositoryNames.has(repositoryName),
          )
          if (repositoryNames.length === 0) {
            continue
          }
          try {
            await ports.git.assignRepositoriesToTeam(
              gitDraft,
              {
                organization,
                teamSlug,
                repositoryNames,
                permission: "push",
              },
              options?.signal,
            )
            options?.onOutput?.({
              channel: "info",
              message: `Assigned ${repositoryNames.length} repositories to team '${team.teamName}'.`,
            })
          } catch (error) {
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to assign repositories to team '${team.teamName}': ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 7,
          totalSteps,
          label: "Repository create workflow complete.",
        })

        options?.onOutput?.({
          channel: "info",
          message: `Repository create summary: planned ${planned.value.length}, created ${created.length}, existing ${alreadyExisted.length}, failed ${failed.length}.`,
        })

        return {
          repositoriesPlanned: planned.value.length,
          repositoriesCreated: created.length,
          repositoriesAlreadyExisted: alreadyExisted.length,
          repositoriesFailed: failed.length,
          templateCommitShas,
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "createRepositories",
        )
      }
    },
    "repo.clone": async (
      input: RepositoryBatchInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryCloneResult> => {
      const totalSteps = 5
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const gitDraft = resolveGitDraft(course, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Course does not reference a Git connection.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.clone")

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(
          course,
          input.assignmentId,
          input.groupIds,
        )
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        if (planned.value.length === 0) {
          options?.onProgress?.({
            step: 5,
            totalSteps,
            label: "Repository clone workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            repositoriesCloned: 0,
            repositoriesFailed: 0,
            completedAt: new Date().toISOString(),
          }
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Resolving repository clone URLs with provider.",
        })
        const repositoryNames = uniqueRepositoryNames(planned.value)
        const resolved = await ports.git.resolveRepositoryCloneUrls(
          gitDraft,
          {
            organization,
            repositoryNames,
          },
          options?.signal,
        )
        const cloneUrlByRepoName = new Map(
          resolved.resolved.map((entry) => [
            entry.repositoryName,
            entry.cloneUrl,
          ]),
        )

        const targetDirectory = normalizeTargetDirectory(input.targetDirectory)
        const layout = normalizeDirectoryLayout(input.directoryLayout)
        const tempCloneRoot = repositoryCloneTempRoot(targetDirectory)
        const parentDirectories = new Set<string>([
          targetDirectory,
          tempCloneRoot,
        ])
        const cloneTargets: Array<{
          repoName: string
          cloneUrl: string
          path: string
        }> = []
        for (const group of planned.value) {
          const cloneUrl = cloneUrlByRepoName.get(group.repoName)
          if (cloneUrl === undefined) {
            continue
          }
          const parentPath = repositoryCloneParentPath(
            targetDirectory,
            layout,
            group,
          )
          parentDirectories.add(parentPath)
          cloneTargets.push({
            repoName: group.repoName,
            cloneUrl,
            path: repositoryClonePath(targetDirectory, layout, group),
          })
        }

        try {
          await ports.fileSystem.applyBatch({
            operations: Array.from(parentDirectories).map((path) => ({
              kind: "ensure-directory" as const,
              path,
            })),
            signal: options?.signal,
          })
        } catch (error) {
          throw normalizeRepositoryExecutionError(error, "ensureDirectories")
        }

        let inspected: Awaited<ReturnType<FileSystemPort["inspect"]>> = []
        try {
          inspected = await ports.fileSystem.inspect({
            paths: cloneTargets.map((target) => target.path),
            signal: options?.signal,
          })
        } catch (error) {
          throw normalizeRepositoryExecutionError(error, "inspectCloneTargets")
        }
        const targetByPath = new Map(
          cloneTargets.map((target) => [target.path, target]),
        )
        const clashIssues: AppValidationIssue[] = []
        const existingDirectoryPaths: string[] = []
        for (const entry of inspected) {
          if (entry.kind === "missing") {
            continue
          }
          const target = targetByPath.get(entry.path)
          if (target === undefined) {
            continue
          }
          if (entry.kind === "file") {
            clashIssues.push({
              path: "targetDirectory",
              message: `Target path '${entry.path}' for repository '${target.repoName}' already exists as a file.`,
            })
            continue
          }
          existingDirectoryPaths.push(entry.path)
        }
        const existingGitRepoPaths = new Set<string>()
        const existingDirectoryChecks = await mapConcurrent(
          existingDirectoryPaths,
          async (path) => {
            const isGitRepo = await isGitRepositoryPath(
              ports.gitCommand,
              path,
              options?.signal,
            )
            return { path, isGitRepo }
          },
          8,
        )
        for (const check of existingDirectoryChecks) {
          const target = targetByPath.get(check.path)
          if (target === undefined) {
            continue
          }
          if (check.isGitRepo) {
            existingGitRepoPaths.add(check.path)
            continue
          }
          clashIssues.push({
            path: "targetDirectory",
            message: `Target path '${check.path}' for repository '${target.repoName}' already exists and is not a Git repository.`,
          })
        }
        if (clashIssues.length > 0) {
          throw createValidationAppError(
            "Repository clone target paths conflict with existing non-git entries.",
            clashIssues,
          )
        }

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Cloning repositories via system git.",
        })
        let cloned = 0
        let failed = 0
        const skippedExistingNames: string[] = []

        const toClone = cloneTargets.filter((target) => {
          if (existingGitRepoPaths.has(target.path)) {
            skippedExistingNames.push(target.repoName)
            return false
          }
          return true
        })
        const cloneItems = toClone.map((target, index) => ({
          ...target,
          tempPath: repositoryCloneTempPath(
            tempCloneRoot,
            target.repoName,
            index,
          ),
        }))

        const cloneResults = await mapConcurrent(
          cloneItems,
          async (target) => {
            const cleanupTempPath = async () => {
              try {
                await ports.fileSystem.applyBatch({
                  operations: [{ kind: "delete-path", path: target.tempPath }],
                  signal: options?.signal,
                })
              } catch {
                // Best effort cleanup.
              }
            }
            try {
              await cleanupTempPath()
              const ok = await initPullClone(
                ports.gitCommand,
                target.cloneUrl,
                target.tempPath,
                options?.signal,
              )
              if (ok) {
                await ports.fileSystem.applyBatch({
                  operations: [
                    {
                      kind: "copy-directory",
                      sourcePath: target.tempPath,
                      destinationPath: target.path,
                    },
                  ],
                  signal: options?.signal,
                })
                await cleanupTempPath()
                return "cloned" as const
              }
              await cleanupTempPath()
              options?.onOutput?.({
                channel: "warn",
                message: `git clone failed for '${target.repoName}': git pull returned non-zero exit code`,
              })
              return "failed" as const
            } catch (error) {
              await cleanupTempPath()
              options?.onOutput?.({
                channel: "warn",
                message: `git clone failed for '${target.repoName}': ${error instanceof Error ? error.message : String(error)}`,
              })
              return "failed" as const
            }
          },
          8,
        )
        for (const result of cloneResults) {
          if (result === "cloned") cloned += 1
          else failed += 1
        }
        options?.onOutput?.({
          channel: "info",
          message: `Repository clone summary: planned ${planned.value.length}, cloned ${cloned}, missing remote ${resolved.missing.length}, existing local ${skippedExistingNames.length}${skippedExistingNames.length > 0 ? ` (${skippedExistingNames.join(", ")})` : ""}, failed ${failed}.`,
        })

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Repository clone workflow complete.",
        })
        return {
          repositoriesPlanned: planned.value.length,
          repositoriesCloned: cloned,
          repositoriesFailed: failed + resolved.missing.length,
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "resolveRepositoryCloneUrls",
        )
      }
    },
    "repo.update": async (
      input: RepositoryUpdateInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryUpdateResult> => {
      const totalSteps = 6
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const gitDraft = resolveGitDraft(course, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Course does not reference a Git connection.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.update")
        const assignment = resolveRequiredAssignment(course, input.assignmentId)

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from assignment groups.",
        })
        const planned = collectRepositoryGroups(course, assignment.id)
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        const plannedRepositoryNames = uniqueRepositoryNames(planned.value)
        if (plannedRepositoryNames.length === 0) {
          options?.onProgress?.({
            step: totalSteps,
            totalSteps,
            label: "Repository update workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            prsCreated: 0,
            prsSkipped: 0,
            prsFailed: 0,
            templateCommitSha: assignment.templateCommitSha ?? null,
            completedAt: new Date().toISOString(),
          }
        }

        const template =
          input.templateOverride ??
          resolveAssignmentRepositoryTemplate(
            course,
            assignment.id,
            course.repositoryTemplate,
          )
        if (template === null) {
          throw createValidationAppError(
            "Repository update requires a template repository.",
            [
              {
                path: "course.repositoryTemplate",
                message:
                  "Configure an assignment template or a course-level template first.",
              },
            ],
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Resolving template head and changed files.",
        })

        let currentSha: string
        let diffFiles: PatchFile[]

        if (template.kind === "local") {
          // Local template: compute SHA and diff locally.
          const sha = await resolveLocalTemplateSha(
            ports.gitCommand,
            template.path,
            options?.signal,
          )
          if (sha === null) {
            throw createValidationAppError(
              `Local template at '${template.path}' is not a valid Git repository.`,
              [
                {
                  path: "template.path",
                  message: "Ensure the template path is a Git repository.",
                },
              ],
            )
          }
          currentSha = sha

          const fromSha = assignment.templateCommitSha ?? null
          if (fromSha === null || fromSha.trim() === "") {
            options?.onOutput?.({
              channel: "warn",
              message:
                "Template baseline SHA is missing for this assignment. Skipping PR creation and returning the current template SHA for persistence.",
            })
            options?.onProgress?.({
              step: totalSteps,
              totalSteps,
              label: "Repository update workflow complete.",
            })
            return {
              repositoriesPlanned: plannedRepositoryNames.length,
              prsCreated: 0,
              prsSkipped: plannedRepositoryNames.length,
              prsFailed: 0,
              templateCommitSha: currentSha,
              completedAt: new Date().toISOString(),
            }
          }

          if (fromSha === currentSha) {
            options?.onOutput?.({
              channel: "info",
              message: "Template unchanged since the stored baseline SHA.",
            })
            options?.onProgress?.({
              step: totalSteps,
              totalSteps,
              label: "Repository update workflow complete.",
            })
            return {
              repositoriesPlanned: plannedRepositoryNames.length,
              prsCreated: 0,
              prsSkipped: plannedRepositoryNames.length,
              prsFailed: 0,
              templateCommitSha: currentSha,
              completedAt: new Date().toISOString(),
            }
          }

          diffFiles = await computeLocalTemplateDiff(
            ports.gitCommand,
            template.path,
            fromSha,
            currentSha,
            options?.signal,
          )
        } else {
          // Remote template: use Git provider API.
          const templateHead = await ports.git.getRepositoryDefaultBranchHead(
            gitDraft,
            {
              owner: template.owner,
              repositoryName: template.name,
            },
            options?.signal,
          )
          if (templateHead === null) {
            throw {
              type: "provider",
              message: `Template repository '${template.owner}/${template.name}' was not found.`,
              provider: providerForError,
              operation: "getRepositoryDefaultBranchHead",
              retryable: true,
            } satisfies AppError
          }
          currentSha = templateHead.sha

          const fromSha = assignment.templateCommitSha ?? null
          if (fromSha === null || fromSha.trim() === "") {
            options?.onOutput?.({
              channel: "warn",
              message:
                "Template baseline SHA is missing for this assignment. Skipping PR creation and returning the current template SHA for persistence.",
            })
            options?.onProgress?.({
              step: totalSteps,
              totalSteps,
              label: "Repository update workflow complete.",
            })
            return {
              repositoriesPlanned: plannedRepositoryNames.length,
              prsCreated: 0,
              prsSkipped: plannedRepositoryNames.length,
              prsFailed: 0,
              templateCommitSha: currentSha,
              completedAt: new Date().toISOString(),
            }
          }

          if (fromSha === currentSha) {
            options?.onOutput?.({
              channel: "info",
              message: "Template unchanged since the stored baseline SHA.",
            })
            options?.onProgress?.({
              step: totalSteps,
              totalSteps,
              label: "Repository update workflow complete.",
            })
            return {
              repositoriesPlanned: plannedRepositoryNames.length,
              prsCreated: 0,
              prsSkipped: plannedRepositoryNames.length,
              prsFailed: 0,
              templateCommitSha: currentSha,
              completedAt: new Date().toISOString(),
            }
          }

          const templateDiff = await ports.git.getTemplateDiff(
            gitDraft,
            {
              owner: template.owner,
              repositoryName: template.name,
              fromSha,
              toSha: currentSha,
            },
            options?.signal,
          )
          if (templateDiff === null) {
            throw {
              type: "provider",
              message:
                "Template diff could not be resolved from the Git provider.",
              provider: providerForError,
              operation: "getTemplateDiff",
              retryable: true,
            } satisfies AppError
          }
          diffFiles = templateDiff.files
        }

        const fromSha = assignment.templateCommitSha ?? ""
        if (diffFiles.length === 0) {
          options?.onOutput?.({
            channel: "info",
            message:
              "Template compare reported no file changes; skipping pull request creation.",
          })
          options?.onProgress?.({
            step: totalSteps,
            totalSteps,
            label: "Repository update workflow complete.",
          })
          return {
            repositoriesPlanned: plannedRepositoryNames.length,
            prsCreated: 0,
            prsSkipped: plannedRepositoryNames.length,
            prsFailed: 0,
            templateCommitSha: currentSha,
            completedAt: new Date().toISOString(),
          }
        }

        const branchName = `template-update-${currentSha.slice(0, 7)}`
        const commitMessage = `Template update ${fromSha.slice(0, 7)} -> ${currentSha.slice(0, 7)}`
        const prTitle = "Template update"
        const prBody = formatTemplateUpdateBody(
          assignment.name,
          fromSha,
          currentSha,
          diffFiles,
        )

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Applying template updates to repository branches.",
        })
        const prCandidates: Array<{
          repositoryName: string
          baseBranch: string
        }> = []
        let prsFailed = 0
        for (const repositoryName of plannedRepositoryNames) {
          const head = await ports.git.getRepositoryDefaultBranchHead(
            gitDraft,
            {
              owner: organization,
              repositoryName,
            },
            options?.signal,
          )
          if (head === null) {
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Repository '${repositoryName}' was not found.`,
            })
            continue
          }

          try {
            await ports.git.createBranch(
              gitDraft,
              {
                owner: organization,
                repositoryName,
                branchName,
                baseSha: head.sha,
                commitMessage,
                files: diffFiles,
              },
              options?.signal,
            )
            prCandidates.push({
              repositoryName,
              baseBranch: head.branchName,
            })
          } catch (error) {
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to apply template patch for '${repositoryName}': ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }

        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Creating pull requests for updated repositories.",
        })
        let prsCreated = 0
        let prsSkipped = 0
        for (const candidate of prCandidates) {
          try {
            const pr = await ports.git.createPullRequest(
              gitDraft,
              {
                owner: organization,
                repositoryName: candidate.repositoryName,
                headBranch: branchName,
                baseBranch: candidate.baseBranch,
                title: prTitle,
                body: prBody,
              },
              options?.signal,
            )
            if (pr.created) {
              prsCreated += 1
              options?.onOutput?.({
                channel: "info",
                message: `Opened PR for '${candidate.repositoryName}': ${pr.url}`,
              })
            } else {
              prsSkipped += 1
              options?.onOutput?.({
                channel: "info",
                message: `Skipped PR for '${candidate.repositoryName}' (already exists or no changes).`,
              })
            }
          } catch (error) {
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to create PR for '${candidate.repositoryName}': ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }

        options?.onOutput?.({
          channel: "info",
          message: `Repository update summary: planned ${plannedRepositoryNames.length}, prs created ${prsCreated}, skipped ${prsSkipped}, failed ${prsFailed}.`,
        })
        options?.onProgress?.({
          step: 6,
          totalSteps,
          label: "Repository update workflow complete.",
        })
        return {
          repositoriesPlanned: plannedRepositoryNames.length,
          prsCreated,
          prsSkipped,
          prsFailed,
          templateCommitSha: currentSha,
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "createPullRequest",
        )
      }
    },
  }
}
function stripCredentials(url: string): string {
  const parsed = new URL(url)
  parsed.username = ""
  parsed.password = ""
  return parsed.toString()
}

function isMissingRemoteHeadError(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`.toLowerCase()
  return (
    text.includes("couldn't find remote ref head") ||
    text.includes("could not find remote ref head")
  )
}

async function isGitRepositoryPath(
  gitCommand: GitCommandPort,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await gitCommand.run({
    args: ["-C", path, "rev-parse", "--is-inside-work-tree"],
    signal,
  })
  return result.exitCode === 0
}

async function initPullClone(
  gitCommand: GitCommandPort,
  authUrl: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const init = await gitCommand.run({
    args: ["init", destPath],
    signal,
  })
  if (init.exitCode !== 0) return false

  const pull = await gitCommand.run({
    args: ["pull", authUrl],
    cwd: destPath,
    signal,
  })
  if (
    pull.exitCode !== 0 &&
    !isMissingRemoteHeadError(pull.stderr, pull.stdout)
  ) {
    return false
  }

  const cleanUrl = stripCredentials(authUrl)
  const addRemote = await gitCommand.run({
    args: ["remote", "add", "origin", cleanUrl],
    cwd: destPath,
    signal,
  })
  return addRemote.exitCode === 0
}

// ---------------------------------------------------------------------------
// Template push helpers — git push content to newly created empty repos
// ---------------------------------------------------------------------------

async function pushTemplateToRepo(
  gitCommand: GitCommandPort,
  templateLocalPath: string,
  authUrl: string,
  defaultBranch: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await gitCommand.run({
    args: ["push", authUrl, `HEAD:refs/heads/${defaultBranch}`, "--force"],
    cwd: templateLocalPath,
    signal,
  })
  return result.exitCode === 0
}

async function resolveLocalTemplateSha(
  gitCommand: GitCommandPort,
  templatePath: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await gitCommand.run({
    args: ["rev-parse", "HEAD"],
    cwd: templatePath,
    signal,
  })
  return result.exitCode === 0 ? result.stdout.trim() : null
}

async function resolveLocalDefaultBranch(
  gitCommand: GitCommandPort,
  templatePath: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await gitCommand.run({
    args: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: templatePath,
    signal,
  })
  return result.exitCode === 0 ? result.stdout.trim() : "main"
}

async function cloneRemoteTemplateToTmpdir(
  gitCommand: GitCommandPort,
  authUrl: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await gitCommand.run({
    args: ["clone", "--single-branch", authUrl, destPath],
    signal,
  })
  return result.exitCode === 0
}

function parseGitDiffNameStatus(
  output: string,
): { status: PatchFileStatus; path: string; previousPath: string | null }[] {
  const entries: {
    status: PatchFileStatus
    path: string
    previousPath: string | null
  }[] = []

  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    const statusChar = trimmed[0]
    const rest = trimmed.slice(1).trim()

    if (statusChar === "R") {
      const parts = rest.split("\t")
      entries.push({
        status: "renamed",
        path: parts[1] ?? parts[0],
        previousPath: parts[0],
      })
    } else {
      const path = rest.split("\t")[0] ?? rest
      let status: PatchFileStatus
      if (statusChar === "A") status = "added"
      else if (statusChar === "D") status = "removed"
      else status = "modified"
      entries.push({ status, path, previousPath: null })
    }
  }

  return entries
}

async function computeLocalTemplateDiff(
  gitCommand: GitCommandPort,
  templatePath: string,
  fromSha: string,
  toSha: string,
  signal?: AbortSignal,
): Promise<PatchFile[]> {
  const nameStatus = await gitCommand.run({
    args: ["diff", "--name-status", `${fromSha}..${toSha}`],
    cwd: templatePath,
    signal,
  })

  if (nameStatus.exitCode !== 0) {
    return []
  }

  const entries = parseGitDiffNameStatus(nameStatus.stdout)
  const files: PatchFile[] = []

  for (const entry of entries) {
    let contentBase64: string | null = null

    if (entry.status !== "removed") {
      const show = await gitCommand.run({
        args: ["show", `${toSha}:${entry.path}`],
        cwd: templatePath,
        signal,
      })
      if (show.exitCode === 0) {
        contentBase64 = Buffer.from(show.stdout).toString("base64")
      }
    }

    files.push({
      path: entry.path,
      previousPath: entry.previousPath,
      status: entry.status,
      contentBase64,
    })
  }

  return files
}

async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  )
  await Promise.all(workers)
  return results
}
