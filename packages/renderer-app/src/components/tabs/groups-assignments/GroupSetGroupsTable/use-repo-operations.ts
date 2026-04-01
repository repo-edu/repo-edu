import type {
  RepositoryCloneResult,
  RepositoryCreateResult,
  RepositoryUpdateResult,
} from "@repo-edu/application-contract"
import { useCallback, useState } from "react"
import { getWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../../../stores/app-settings-store.js"
import {
  selectGitConnectionId,
  selectOrganization,
  selectRepositoryCloneDirectoryLayout,
  selectRepositoryCloneTargetDirectory,
  selectRepositoryTemplate,
  useCourseStore,
} from "../../../../stores/course-store.js"
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseRepoOperationsParams = {
  effectiveAssignmentId: string | null
  nonEmptyCount: number
  disabled: boolean
}

export function useRepoOperations(params: UseRepoOperationsParams) {
  const { effectiveAssignmentId, nonEmptyCount, disabled } = params

  const course = useCourseStore((s) => s.course)
  const gitConnectionId = useCourseStore(selectGitConnectionId)
  const organization = useCourseStore(selectOrganization)
  const setOrganization = useCourseStore((s) => s.setOrganization)
  const repositoryTemplate = useCourseStore(selectRepositoryTemplate)
  const setRepositoryTemplate = useCourseStore((s) => s.setRepositoryTemplate)
  const repositoryCloneTargetDirectory = useCourseStore(
    selectRepositoryCloneTargetDirectory,
  )
  const setRepositoryCloneTargetDirectory = useCourseStore(
    (s) => s.setRepositoryCloneTargetDirectory,
  )
  const repositoryCloneDirectoryLayout = useCourseStore(
    selectRepositoryCloneDirectoryLayout,
  )
  const setRepositoryCloneDirectoryLayout = useCourseStore(
    (s) => s.setRepositoryCloneDirectoryLayout,
  )
  const updateAssignment = useCourseStore((s) => s.updateAssignment)

  const appSettings = useAppSettingsStore((s) => s.settings)

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

  const isRunning = operationStatus === "running"
  const hasBaseOperationInputs =
    !disabled &&
    !isRunning &&
    effectiveAssignmentId !== null &&
    gitConnectionId !== null &&
    nonEmptyCount > 0
  const hasUpdateOperationInputs =
    !disabled &&
    !isRunning &&
    effectiveAssignmentId !== null &&
    gitConnectionId !== null

  const setTemplateOwner = useCallback(
    (owner: string) => {
      setRepositoryTemplate({
        kind: "remote",
        owner,
        name:
          repositoryTemplate?.kind === "remote"
            ? (repositoryTemplate.name ?? "")
            : "",
        visibility: templateVisibility,
      })
    },
    [repositoryTemplate, setRepositoryTemplate, templateVisibility],
  )

  const setTemplateLocalPath = useCallback(
    (localPath: string) => {
      setRepositoryTemplate({
        kind: "local",
        path: localPath,
        visibility: templateVisibility,
      })
    },
    [setRepositoryTemplate, templateVisibility],
  )

  const setTemplateKind = useCallback(
    (kind: "remote" | "local") => {
      if (kind === "local") {
        setRepositoryTemplate({
          kind: "local",
          path: templateLocalPath,
          visibility: templateVisibility,
        })
      } else {
        setRepositoryTemplate({
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
      repositoryTemplate,
      setRepositoryTemplate,
      templateOwner,
      templateLocalPath,
      templateVisibility,
    ],
  )

  const handleRunOperation = useCallback(
    async (operation: RepositoryOperationMode) => {
      if (!course || !effectiveAssignmentId) {
        return
      }

      setOperationStatus("running")
      setRunningOperation(operation)
      setOperationError(null)
      setLastResult(null)

      const { workflowId, input } = buildRepositoryWorkflowRequest({
        course,
        appSettings,
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
          setLastResult({
            operation: "create",
            result: result as RepositoryCreateResult,
          })
        } else {
          if (operation === "update") {
            const typed = result as RepositoryUpdateResult
            setLastResult({
              operation: "update",
              result: typed,
            })
            if (effectiveAssignmentId && typed.templateCommitSha) {
              updateAssignment(effectiveAssignmentId, {
                templateCommitSha: typed.templateCommitSha,
              })
            }
            return
          }
          setLastResult({
            operation: "clone",
            result: result as RepositoryCloneResult,
          })
        }
      } catch (error) {
        setOperationStatus("error")
        setOperationError(getErrorMessage(error))
      } finally {
        setRunningOperation(null)
      }
    },
    [
      appSettings,
      cloneDirectoryLayout,
      cloneTargetDirectory,
      course,
      effectiveAssignmentId,
      repositoryTemplate,
      updateAssignment,
    ],
  )

  return {
    // Operation state
    operationStatus,
    runningOperation,
    operationError,
    lastResult,
    handleRunOperation,

    // Readiness flags
    gitConnectionId,
    hasBaseOperationInputs,
    hasUpdateOperationInputs,

    // Organization
    organization,
    setOrganization,

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
    setRepositoryCloneTargetDirectory,
    setRepositoryCloneDirectoryLayout,
  } as const
}
