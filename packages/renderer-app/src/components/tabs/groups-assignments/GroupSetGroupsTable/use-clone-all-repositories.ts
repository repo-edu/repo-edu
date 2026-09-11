import type { RepositoryListNamespaceResult } from "@repo-edu/application-contract"
import { normalizeGitNamespaceInput } from "@repo-edu/domain/repository-namespace"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useDirectoryPicker } from "../../../../hooks/use-picker.js"
import { selectCredentials } from "../../../../session/selectors.js"
import { useSessionControllerSelector } from "../../../../session/session-controller-context.js"
import { sessionQueryOptions } from "../../../../session/session-query.js"
import { canAdmitSessionChange } from "../../../../session/session-reducer.js"
import { getErrorMessage } from "../../../../utils/error-message.js"
import {
  type CloneAllCommandState,
  type CloneAllCommandVariables,
  type CloneAllPublishedListingInput,
  type CloneAllSafeListingInput,
  type CloneAllScheduler,
  cloneAllInputIsCurrent,
  cloneAllResultBelongsToCurrentCommand,
  createCloneAllListingQueryPolicy,
  createCloneAllListingTransition,
  createCloneAllSafeListingInput,
  executeCloneAllCommand,
  formatCloneAllResult,
  selectCloneAllCanClone,
} from "./clone-all-repositories.js"

type UseCloneAllRepositoriesParams = {
  readonly activeConnectionId: string | null
  readonly organization: string | null
  readonly initialTargetDirectory: string
}

const scheduleCloneAllTransition: CloneAllScheduler = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

export function useCloneAllRepositories({
  activeConnectionId,
  organization,
  initialTargetDirectory,
}: UseCloneAllRepositoriesParams) {
  const client = useWorkflowClient()
  const pickDirectory = useDirectoryPicker()
  const queryClient = useQueryClient()
  const credentials = useSessionControllerSelector(selectCredentials)
  const canStartQueries = useSessionControllerSelector(canAdmitSessionChange)
  const [filter, setFilter] = useState("")
  const [includeArchived, setIncludeArchived] = useState(false)
  const [targetDirectory, setTargetDirectory] = useState(initialTargetDirectory)
  const [publishedListingInput, setPublishedListingInput] =
    useState<CloneAllPublishedListingInput | null>(null)

  const namespace =
    organization === null ? "" : normalizeGitNamespaceInput(organization)
  const normalizedFilter = filter.trim()
  const hasConnection = activeConnectionId !== null
  const hasNamespace = namespace.length > 0
  const rawListingInput: CloneAllSafeListingInput | null =
    createCloneAllSafeListingInput({
      connectionId: activeConnectionId,
      namespace,
      filter: normalizedFilter,
      includeArchived,
    })

  useEffect(() => {
    const transition = createCloneAllListingTransition({
      canStartQueries,
      input: createCloneAllSafeListingInput({
        connectionId: activeConnectionId,
        namespace,
        filter: normalizedFilter,
        includeArchived,
      }),
      credentials,
      updatePublishedInput: (updater) => {
        client.change(() => setPublishedListingInput(updater))
      },
      schedule: scheduleCloneAllTransition,
    })
    return () => transition.dispose()
  }, [
    activeConnectionId,
    canStartQueries,
    client,
    credentials,
    includeArchived,
    namespace,
    normalizedFilter,
  ])

  const inputIsCurrent = cloneAllInputIsCurrent({
    input: rawListingInput,
    credentials,
    publishedInput: publishedListingInput,
  })
  const queryPolicy = createCloneAllListingQueryPolicy(
    publishedListingInput?.admissionId ?? null,
  )
  const listingQuery = useQuery({
    ...queryPolicy,
    enabled: canStartQueries && inputIsCurrent,
    ...sessionQueryOptions(
      client,
      "repo.listNamespace",
      async (scope, { signal }): Promise<RepositoryListNamespaceResult> => {
        if (publishedListingInput === null) {
          throw new Error("Repository listing ran without an admitted input.")
        }
        return scope.run(
          "repo.listNamespace",
          {
            credentials: publishedListingInput.credentials,
            namespace: publishedListingInput.admissionId.namespace,
            filter: publishedListingInput.admissionId.filter || undefined,
            includeArchived: publishedListingInput.admissionId.includeArchived,
          },
          { signal },
        )
      },
    ),
  })

  const [cloneCommand, setCloneCommand] = useState<CloneAllCommandState>({
    status: "idle",
  })

  const canClone = selectCloneAllCanClone({
    inputIsCurrent,
    queryIsSuccess: listingQuery.isSuccess,
    queryIsPlaceholderData: listingQuery.isPlaceholderData,
    listResult: listingQuery.data,
    targetDirectory,
    commandIsPending: cloneCommand.status === "pending",
  })
  const resultBelongsToCurrentCommand = cloneAllResultBelongsToCurrentCommand({
    inputIsCurrent,
    publishedInput: publishedListingInput,
    currentTargetDirectory: targetDirectory,
    commandVariables: cloneCommand.variables,
  })
  const cloneError =
    cloneCommand.status === "error" ? getErrorMessage(cloneCommand.error) : null
  const resultSummary =
    cloneCommand.status === "success"
      ? formatCloneAllResult(cloneCommand.data)
      : null

  const handleBulkClone = () => {
    if (!canClone || publishedListingInput === null) return
    const variables: CloneAllCommandVariables = {
      listingAdmissionId: publishedListingInput.admissionId,
      targetDirectory: targetDirectory.trim(),
    }
    void executeCloneAllCommand(
      client,
      queryClient,
      publishedListingInput,
      variables,
      setCloneCommand,
    ).catch(() => undefined)
  }

  return {
    filter,
    setFilter: (value: string) => {
      client.change(() => setFilter(value))
    },
    includeArchived,
    setIncludeArchived: (value: boolean) => {
      client.change(() => setIncludeArchived(value))
    },
    targetDirectory,
    setTargetDirectory: (value: string) => {
      client.change(() => setTargetDirectory(value))
    },
    browseTargetDirectory: async () => {
      await pickDirectory(
        { title: "Select clone target folder" },
        (directory, scope) => {
          scope.publish(() => setTargetDirectory(directory))
        },
      )
    },
    listResult: listingQuery.data ?? null,
    listError: listingQuery.isError
      ? getErrorMessage(listingQuery.error)
      : null,
    isListing: listingQuery.isFetching,
    isCloning: cloneCommand.status === "pending",
    resultBelongsToCurrentCommand,
    hasConnection,
    hasNamespace,
    canClone,
    cloneError,
    resultSummary,
    handleBulkClone,
  } as const
}
