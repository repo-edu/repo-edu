import type {
  RecordedRepositoriesByAssignment,
  RepositoryCloneResult,
  RepositoryCreateResult,
  RepositoryUpdateResult,
} from "@repo-edu/application-contract"
import {
  gitNamespaceTerminology,
  normalizeGitNamespaceInput,
} from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { useCallback, useState } from "react"
import { getWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useSessionController } from "../../../../session/session-controller-context.js"
import {
  selectOrganization,
  selectRepositoryCloneDirectoryLayout,
  selectRepositoryCloneTargetDirectory,
  selectRepositoryTemplate,
  useCourseStore,
} from "../../../../stores/course-store.js"
import {
  selectActiveGitConnection,
  selectActiveGitConnectionId,
  selectGitConnections,
  useCredentialsStore,
} from "../../../../stores/credentials-store.js"
import { getErrorMessage } from "../../../../utils/error-message.js"
import {
  buildRepositoryWorkflowRequest,
  type CloneDirectoryLayout,
  type RepositoryOperationMode,
} from "../../../../utils/repository-workflow.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationResult =
  | { operation: "create"; result: RepositoryCreateResult }
  | { operation: "clone"; result: RepositoryCloneResult }
  | { operation: "update"; result: RepositoryUpdateResult }

export type OperationStatus = "idle" | "running" | "success" | "error"

export type OperationReadiness = {
  readonly canRun: boolean
  readonly blockers: readonly string[]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseRepoOperationsParams = {
  effectiveAssignmentId: string | null
  nonEmptyCount: number
  emptyCount: number
  disabled: boolean
}

export function useRepoOperations(params: UseRepoOperationsParams) {
  const { effectiveAssignmentId, nonEmptyCount, emptyCount, disabled } = params

  const course = useCourseStore((s) => s.course)
  const gitConnections = useCredentialsStore(selectGitConnections)
  const activeGitConnection = useCredentialsStore(selectActiveGitConnection)
  const activeGitConnectionId = useCredentialsStore(selectActiveGitConnectionId)
  const setActiveGitConnectionId = useCredentialsStore(
    (s) => s.setActiveGitConnectionId,
  )
  const organization = useCourseStore(selectOrganization)
  const repositoryTemplate = useCourseStore(selectRepositoryTemplate)
  const repositoryCloneTargetDirectory = useCourseStore(
    selectRepositoryCloneTargetDirectory,
  )
  const repositoryCloneDirectoryLayout = useCourseStore(
    selectRepositoryCloneDirectoryLayout,
  )
  const controller = useSessionController()
  const credentials = useCredentialsStore((s) => s.credentials)
  const courseId = course?.id ?? null

  const [operationStatus, setOperationStatus] =
    useState<OperationStatus>("idle")
  const [runningOperation, setRunningOperation] =
    useState<RepositoryOperationMode | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<OperationResult | null>(null)

  // Derived template state
  const cloneTargetDirectory = repositoryCloneTargetDirectory ?? ""
  const cloneDirectoryLayout = (repositoryCloneDirectoryLayout ??
    "flat") as CloneDirectoryLayout
  const templateKind = repositoryTemplate?.kind ?? "remote"
  const templateOwner =
    repositoryTemplate?.kind === "remote"
      ? (repositoryTemplate.owner ?? "")
      : ""
  const templateLocalPath =
    repositoryTemplate?.kind === "local" ? (repositoryTemplate.path ?? "") : ""
  const templateVisibility = repositoryTemplate?.visibility ?? "private"

  // Per-operation readiness
  const hasOrganization =
    organization !== null && normalizeGitNamespaceInput(organization) !== ""
  const hasTargetDirectory = cloneTargetDirectory.trim().length > 0
  const isRunning = operationStatus === "running"
  const { label: namespaceLabel } = gitNamespaceTerminology(
    activeGitConnection?.provider,
  )

  const computeReadiness = (
    operation: RepositoryOperationMode,
  ): OperationReadiness => {
    if (disabled) {
      return {
        canRun: false,
        blockers: ["This group set is not editable."],
      }
    }
    if (isRunning) {
      return {
        canRun: false,
        blockers: ["Wait for the current operation to finish."],
      }
    }

    const blockers: string[] = []

    if (effectiveAssignmentId === null) {
      blockers.push("Select an assignment.")
    }
    if (activeGitConnection === null) {
      blockers.push("Configure a Git connection in Settings.")
    }
    if (!hasOrganization) {
      blockers.push(`Enter the ${namespaceLabel.toLowerCase()} name or URL.`)
    }

    // Group-count is only meaningful once an assignment is chosen; otherwise
    // the planner short-circuits to zero and the message would be misleading.
    // The blocker applies to Create only: Update/Clone iterate stored records
    // and derive-by-roster fallbacks, so empty groups aren't a hard block.
    if (
      effectiveAssignmentId !== null &&
      operation === "create" &&
      nonEmptyCount === 0
    ) {
      blockers.push(
        emptyCount > 0
          ? `All ${emptyCount} group${emptyCount === 1 ? "" : "s"} in this set are empty — add members to at least one.`
          : "This set has no groups to operate on.",
      )
    }

    if (operation === "clone" && !hasTargetDirectory) {
      blockers.push("Enter a target folder.")
    }

    return { canRun: blockers.length === 0, blockers }
  }

  const readiness: Record<RepositoryOperationMode, OperationReadiness> = {
    create: computeReadiness("create"),
    update: computeReadiness("update"),
    clone: computeReadiness("clone"),
  }

  const setTemplateOwner = useCallback(
    (owner: string) => {
      if (courseId === null) return
      controller.setRepositoryTemplate(courseId, {
        kind: "remote",
        owner,
        name:
          repositoryTemplate?.kind === "remote"
            ? (repositoryTemplate.name ?? "")
            : "",
        visibility: templateVisibility,
      })
    },
    [controller, courseId, repositoryTemplate, templateVisibility],
  )

  const setTemplateLocalPath = useCallback(
    (localPath: string) => {
      if (courseId === null) return
      controller.setRepositoryTemplate(courseId, {
        kind: "local",
        path: localPath,
        visibility: templateVisibility,
      })
    },
    [controller, courseId, templateVisibility],
  )

  const setTemplateKind = useCallback(
    (kind: "remote" | "local") => {
      if (courseId === null) return
      if (kind === "local") {
        controller.setRepositoryTemplate(courseId, {
          kind: "local",
          path: templateLocalPath,
          visibility: templateVisibility,
        })
      } else {
        controller.setRepositoryTemplate(courseId, {
          kind: "remote",
          owner: templateOwner,
          name:
            repositoryTemplate?.kind === "remote"
              ? (repositoryTemplate.name ?? "")
              : "",
          visibility: templateVisibility,
        })
      }
    },
    [
      controller,
      courseId,
      repositoryTemplate,
      templateOwner,
      templateLocalPath,
      templateVisibility,
    ],
  )

  const applyRecordedRepositories = useCallback(
    (
      recorded: RecordedRepositoriesByAssignment,
      originatingCourseId: string,
      templateAssignmentUpdate?: {
        assignmentId: string
        templateCommitSha: string
      },
    ) => {
      controller.mutateCourse(originatingCourseId, (actions) => {
        const latestCourse = useCourseStore.getState().course
        if (!latestCourse || latestCourse.id !== originatingCourseId) return
        const assignmentsById = new Map(
          latestCourse.roster.assignments.map(
            (assignment) => [assignment.id, assignment] as const,
          ),
        )
        const groupSetsById = new Map(
          latestCourse.roster.groupSets.map(
            (groupSet) => [groupSet.id, groupSet] as const,
          ),
        )
        const updatedAssignmentIds = new Set<string>()

        for (const [assignmentId, groupMap] of Object.entries(recorded)) {
          const assignment = assignmentsById.get(assignmentId)
          if (!assignment) continue
          const groupSet = groupSetsById.get(assignment.groupSetId)
          const validGroupIds = new Set<string>(
            groupSet === undefined
              ? []
              : groupSet.nameMode === "named"
                ? groupSet.groupIds
                : groupSet.teams.map((team) => team.id),
          )
          const merged: Record<string, string> = {}
          for (const [groupId, repoName] of Object.entries(
            assignment.repositories ?? {},
          )) {
            if (validGroupIds.has(groupId)) {
              merged[groupId] = repoName
            }
          }
          for (const [groupId, repoName] of Object.entries(groupMap)) {
            if (validGroupIds.has(groupId)) {
              merged[groupId] = repoName
            }
          }
          actions.updateAssignment(assignmentId, {
            repositories: merged,
            ...(templateAssignmentUpdate?.assignmentId === assignmentId
              ? {
                  templateCommitSha: templateAssignmentUpdate.templateCommitSha,
                }
              : {}),
          })
          updatedAssignmentIds.add(assignmentId)
        }

        if (
          templateAssignmentUpdate !== undefined &&
          !updatedAssignmentIds.has(templateAssignmentUpdate.assignmentId)
        ) {
          actions.updateAssignment(templateAssignmentUpdate.assignmentId, {
            templateCommitSha: templateAssignmentUpdate.templateCommitSha,
          })
        }
      })
    },
    [controller],
  )

  const handleRunOperation = useCallback(
    async (operation: RepositoryOperationMode) => {
      if (!course || !effectiveAssignmentId) {
        return
      }
      const originatingCourseId = course.id

      setOperationStatus("running")
      setRunningOperation(operation)
      setOperationError(null)
      setLastResult(null)

      const { workflowId, input } = buildRepositoryWorkflowRequest({
        course,
        credentials,
        assignmentId: effectiveAssignmentId,
        operation,
        repositoryTemplate,
        targetDirectory: cloneTargetDirectory,
        directoryLayout: cloneDirectoryLayout,
      })

      try {
        const client = getWorkflowClient()
        const result = await client.run(workflowId, input)
        setOperationStatus("success")
        if (operation === "create") {
          const typed = result as RepositoryCreateResult
          setLastResult({ operation: "create", result: typed })
          applyRecordedRepositories(
            typed.recordedRepositories,
            originatingCourseId,
          )
        } else if (operation === "update") {
          const typed = result as RepositoryUpdateResult
          setLastResult({ operation: "update", result: typed })
          applyRecordedRepositories(
            typed.recordedRepositories,
            originatingCourseId,
            typed.templateCommitSha
              ? {
                  assignmentId: effectiveAssignmentId,
                  templateCommitSha: typed.templateCommitSha,
                }
              : undefined,
          )
        } else {
          const typed = result as RepositoryCloneResult
          setLastResult({ operation: "clone", result: typed })
          applyRecordedRepositories(
            typed.recordedRepositories,
            originatingCourseId,
          )
        }
      } catch (error) {
        setOperationStatus("error")
        setOperationError(getErrorMessage(error))
      } finally {
        setRunningOperation(null)
      }
    },
    [
      applyRecordedRepositories,
      cloneDirectoryLayout,
      cloneTargetDirectory,
      course,
      credentials,
      effectiveAssignmentId,
      repositoryTemplate,
    ],
  )

  const handleSelectActiveGitConnection = useCallback(
    (id: string | null) => {
      setActiveGitConnectionId(id)
    },
    [setActiveGitConnectionId],
  )

  const setOrganizationForCourse = useCallback(
    (value: string | null) => {
      if (courseId !== null) controller.setOrganization(courseId, value)
    },
    [controller, courseId],
  )

  const setRepositoryCloneTargetDirectoryForCourse = useCallback(
    (value: PersistedCourse["repositoryCloneTargetDirectory"]) => {
      if (courseId !== null) {
        controller.setRepositoryCloneTargetDirectory(courseId, value)
      }
    },
    [controller, courseId],
  )

  const setRepositoryCloneDirectoryLayoutForCourse = useCallback(
    (value: PersistedCourse["repositoryCloneDirectoryLayout"]) => {
      if (courseId !== null) {
        controller.setRepositoryCloneDirectoryLayout(courseId, value)
      }
    },
    [controller, courseId],
  )

  return {
    // Operation state
    operationStatus,
    runningOperation,
    operationError,
    lastResult,
    handleRunOperation,

    // Per-operation readiness (canRun + human-readable blockers)
    readiness,

    // Git connection binding (profile-level)
    gitConnections,
    activeGitConnection,
    activeGitConnectionId,
    handleSelectActiveGitConnection,

    // Organization
    organization,
    setOrganization: setOrganizationForCourse,

    // Template
    templateKind,
    templateOwner,
    templateLocalPath,
    setTemplateKind,
    setTemplateOwner,
    setTemplateLocalPath,

    // Clone settings
    cloneTargetDirectory,
    cloneDirectoryLayout,
    setRepositoryCloneTargetDirectory:
      setRepositoryCloneTargetDirectoryForCourse,
    setRepositoryCloneDirectoryLayout:
      setRepositoryCloneDirectoryLayoutForCourse,
  } as const
}
