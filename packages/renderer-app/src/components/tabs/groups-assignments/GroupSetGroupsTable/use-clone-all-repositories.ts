import type { RepositoryListNamespaceResult } from "@repo-edu/application-contract"
import { normalizeGitNamespaceInput } from "@repo-edu/domain/repository-namespace"
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useReducer, useState } from "react"
import { useWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useDirectoryPicker } from "../../../../hooks/use-picker.js"
import {
  selectCredentials,
  selectOperationIsAdmitted,
} from "../../../../session/selectors.js"
import { useSessionControllerSelector } from "../../../../session/session-controller-context.js"
import {
  canAdmitSessionChange,
  canAdmitSessionInput,
} from "../../../../session/session-reducer.js"
import { getErrorMessage } from "../../../../utils/error-message.js"
import {
  type CloneAllCommandState,
  type CloneAllCommandVariables,
  type CloneAllSafeListingInput,
  cloneAllInputIsCurrent,
  cloneAllListingReducer,
  cloneAllResultBelongsToCurrentCommand,
  createCloneAllListingQueryPolicy,
  createCloneAllSafeListingInput,
  executeCloneAllCommand,
  fetchCloneAllListing,
  formatCloneAllResult,
  initialCloneAllListingState,
  selectCloneAllCanClone,
} from "./clone-all-repositories.js"

type UseCloneAllRepositoriesParams = {
  readonly activeConnectionId: string | null
  readonly organization: string | null
  readonly initialTargetDirectory: string
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
  const canStartQueries = useSessionControllerSelector(canAdmitSessionInput)
  const canStartListing = useSessionControllerSelector(canAdmitSessionChange)
  const isListing = useSessionControllerSelector((snapshot) =>
    selectOperationIsAdmitted(snapshot, "repo.listNamespace"),
  )
  const [
    { filter, includeArchived, publishedInput: publishedListingInput },
    dispatchListing,
  ] = useReducer(cloneAllListingReducer, initialCloneAllListingState)
  const [targetDirectory, setTargetDirectory] = useState(initialTargetDirectory)

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
    if (!canStartListing) return
    dispatchListing({
      type: "context",
      connectionId: activeConnectionId,
      namespace,
      credentials,
    })
  }, [activeConnectionId, canStartListing, credentials, namespace])

  const inputIsCurrent = cloneAllInputIsCurrent({
    input: rawListingInput,
    credentials,
    publishedInput: publishedListingInput,
  })
  const listingContextIsCurrent = cloneAllInputIsCurrent({
    input:
      publishedListingInput === null
        ? null
        : createCloneAllSafeListingInput({
            ...publishedListingInput.admissionId,
            connectionId: activeConnectionId,
            namespace,
          }),
    credentials,
    publishedInput: publishedListingInput,
  })
  const queryPolicy = createCloneAllListingQueryPolicy(
    publishedListingInput?.admissionId ?? null,
  )
  const listingQuery = useQuery<RepositoryListNamespaceResult>({
    ...queryPolicy,
    enabled: false,
    queryFn: skipToken,
  })

  useEffect(() => {
    if (
      !canStartListing ||
      !listingContextIsCurrent ||
      publishedListingInput === null
    )
      return
    void fetchCloneAllListing(client, queryClient, publishedListingInput).catch(
      () => {},
    )
  }, [
    canStartListing,
    listingContextIsCurrent,
    publishedListingInput,
    client,
    queryClient,
  ])

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
    canStartQueries,
    filter,
    setFilter: (value: string) => {
      client.change(() => dispatchListing({ type: "filter", value }))
    },
    search: () => {
      client.change(() =>
        dispatchListing({
          type: "search",
          connectionId: activeConnectionId,
          namespace,
          credentials,
        }),
      )
    },
    includeArchived,
    setIncludeArchived: (value: boolean) => {
      client.change(() =>
        dispatchListing({
          type: "include-archived",
          value,
          connectionId: activeConnectionId,
          namespace,
          credentials,
        }),
      )
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
    isListing,
    cancelListing: () => client.stop("repo.listNamespace"),
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
