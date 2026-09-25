import type { RepositoryListNamespaceResult } from "@repo-edu/application-contract"
import { normalizeGitNamespaceInput } from "@repo-edu/domain/repository-namespace"
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { useReducer, useState } from "react"
import { useWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useDirectoryPicker } from "../../../../hooks/use-picker.js"
import {
  selectCredentials,
  selectOperationIsAdmitted,
} from "../../../../session/selectors.js"
import { useSessionControllerSelector } from "../../../../session/session-controller-context.js"
import { canAdmitSessionInput } from "../../../../session/session-reducer.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../../../../session/session-start.js"
import { getErrorMessage } from "../../../../utils/error-message.js"
import {
  type CloneAllCommandState,
  type CloneAllCommandVariables,
  type CloneAllPublishedListingInput,
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

  const inputIsCurrent = cloneAllInputIsCurrent({
    input: rawListingInput,
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

  const handleBulkClone = bindSessionStart(
    "cloneAll",
    (start: SessionStart) => {
      if (!canClone || publishedListingInput === null) return
      const variables: CloneAllCommandVariables = {
        listingAdmissionId: publishedListingInput.admissionId,
        targetDirectory: targetDirectory.trim(),
      }
      void executeCloneAllCommand(
        start,
        client,
        queryClient,
        publishedListingInput,
        variables,
        setCloneCommand,
      ).catch(() => undefined)
    },
  )

  return {
    canStartQueries,
    filter,
    setFilter: (value: string) => {
      client.change(() => dispatchListing({ type: "filter", value }))
    },
    search: bindSessionStart("cloneAllSearch", (start) => {
      if (rawListingInput === null) return
      client.change(() => {
        const input: CloneAllPublishedListingInput = {
          admissionId: {
            ...rawListingInput,
            listingGeneration:
              (publishedListingInput?.admissionId.listingGeneration ?? 0) + 1,
          },
          credentials,
        }
        dispatchListing({ type: "search", input })
        void fetchCloneAllListing(start, client, queryClient, input).catch(
          () => {},
        )
      })
    }),
    includeArchived,
    setIncludeArchived: (value: boolean) => {
      client.change(() =>
        dispatchListing({
          type: "include-archived",
          value,
        }),
      )
    },
    targetDirectory,
    setTargetDirectory: (value: string) => {
      client.change(() => setTargetDirectory(value))
    },
    browseTargetDirectory: bindSessionStart("cloneAllBrowse", async (start) => {
      await pickDirectory(
        start,
        { title: "Select clone target folder" },
        (directory, scope) => {
          scope.publish(() => setTargetDirectory(directory))
        },
      )
    }),
    listResult:
      inputIsCurrent && !listingQuery.isPlaceholderData
        ? (listingQuery.data ?? null)
        : null,
    listError:
      inputIsCurrent && listingQuery.isError
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
