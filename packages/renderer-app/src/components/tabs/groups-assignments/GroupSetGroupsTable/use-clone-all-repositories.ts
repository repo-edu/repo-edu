import type {
  RepositoryCloneResult,
  RepositoryListNamespaceResult,
} from "@repo-edu/application-contract"
import { normalizeGitNamespaceInput } from "@repo-edu/domain/repository-namespace"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useDirectoryPicker } from "../../../../hooks/use-picker.js"
import { selectCredentials } from "../../../../session/selectors.js"
import { useSessionControllerSelector } from "../../../../session/session-controller-context.js"
import { sessionQueryOptions } from "../../../../session/session-query.js"
import { canAdmitSessionChange } from "../../../../session/session-reducer.js"
import { getErrorMessage } from "../../../../utils/error-message.js"
import {
  executeCloneAllCommand,
  executeRegisteredCloneAllCommand,
} from "./clone-all-command.js"
import {
  type CloneAllMutationVariables,
  type CloneAllPublishedListingInput,
  type CloneAllSafeListingInput,
  type CloneAllScheduler,
  cloneAllInputIsCurrent,
  cloneAllListingQueryKeys,
  cloneAllMutationBelongsToCurrentCommand,
  createCloneAllListingQueryPolicy,
  createCloneAllListingTransition,
  createCloneAllMutationPolicy,
  createCloneAllSafeListingInput,
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
      cancelListingQueries: () => {
        void queryClient.cancelQueries({
          queryKey: cloneAllListingQueryKeys.all,
        })
      },
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
    queryClient,
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

  const cloneMutation = useMutation<
    RepositoryCloneResult,
    Error,
    CloneAllMutationVariables
  >({
    ...createCloneAllMutationPolicy(),
    mutationFn: executeRegisteredCloneAllCommand,
  })

  const canClone = selectCloneAllCanClone({
    inputIsCurrent,
    queryIsSuccess: listingQuery.isSuccess,
    queryIsPlaceholderData: listingQuery.isPlaceholderData,
    listResult: listingQuery.data,
    targetDirectory,
    mutationIsPending: cloneMutation.isPending,
  })
  const mutationBelongsToCurrentCommand =
    cloneAllMutationBelongsToCurrentCommand({
      inputIsCurrent,
      publishedInput: publishedListingInput,
      currentTargetDirectory: targetDirectory,
      mutationVariables: cloneMutation.variables,
    })
  const cloneError = cloneMutation.isError
    ? getErrorMessage(cloneMutation.error)
    : null
  const resultSummary = cloneMutation.isSuccess
    ? formatCloneAllResult(cloneMutation.data)
    : null

  const handleBulkClone = () => {
    if (!canClone || publishedListingInput === null) return
    const variables: CloneAllMutationVariables = {
      listingAdmissionId: publishedListingInput.admissionId,
      targetDirectory: targetDirectory.trim(),
    }
    void executeCloneAllCommand(
      client,
      queryClient,
      publishedListingInput,
      variables,
      cloneMutation.mutateAsync,
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
    isCloning: cloneMutation.isPending,
    mutationBelongsToCurrentCommand,
    hasConnection,
    hasNamespace,
    canClone,
    cloneError,
    resultSummary,
    handleBulkClone,
  } as const
}
