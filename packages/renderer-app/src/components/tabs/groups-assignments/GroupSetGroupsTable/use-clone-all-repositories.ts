import type {
  RepositoryCloneResult,
  RepositoryListNamespaceResult,
} from "@repo-edu/application-contract"
import { normalizeGitNamespaceInput } from "@repo-edu/domain/repository-namespace"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useWorkflowClient } from "../../../../contexts/workflow-client.js"
import { useCredentialsStore } from "../../../../stores/credentials-store.js"
import { getErrorMessage } from "../../../../utils/error-message.js"
import {
  buildCloneAllWorkflowInput,
  type CloneAllMutationVariables,
  type CloneAllPublishedListingInput,
  type CloneAllSafeListingInput,
  type CloneAllScheduler,
  cloneAllInputIsCurrent,
  cloneAllListingQueryKeys,
  cloneAllMutationBelongsToCurrentInput,
  createCloneAllListingQueryPolicy,
  createCloneAllListingTransition,
  createCloneAllMutationPolicy,
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
  const queryClient = useQueryClient()
  const credentials = useCredentialsStore((state) => state.credentials)
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
    activeConnectionId !== null && hasNamespace
      ? {
          connectionId: activeConnectionId,
          namespace,
          filter: normalizedFilter,
          includeArchived,
        }
      : null

  useEffect(() => {
    const transition = createCloneAllListingTransition({
      input:
        activeConnectionId !== null && namespace.length > 0
          ? {
              connectionId: activeConnectionId,
              namespace,
              filter: normalizedFilter,
              includeArchived,
            }
          : null,
      credentials,
      updatePublishedInput: setPublishedListingInput,
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
    enabled: inputIsCurrent,
    queryFn: async ({ signal }): Promise<RepositoryListNamespaceResult> => {
      if (publishedListingInput === null) {
        throw new Error("Repository listing ran without an admitted input.")
      }
      return client.run(
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
  })

  const cloneMutation = useMutation<
    RepositoryCloneResult,
    Error,
    CloneAllMutationVariables
  >({
    ...createCloneAllMutationPolicy(),
    mutationFn: async (variables) =>
      client.run(
        "repo.bulkClone",
        buildCloneAllWorkflowInput({
          variables,
          publishedInput: publishedListingInput,
          listResult: listingQuery.data,
        }),
      ),
  })

  const canClone = selectCloneAllCanClone({
    inputIsCurrent,
    queryIsSuccess: listingQuery.isSuccess,
    queryIsPlaceholderData: listingQuery.isPlaceholderData,
    listResult: listingQuery.data,
    targetDirectory,
    mutationIsPending: cloneMutation.isPending,
  })
  const mutationBelongsToCurrentInput = cloneAllMutationBelongsToCurrentInput({
    inputIsCurrent,
    publishedInput: publishedListingInput,
    mutationAdmissionId: cloneMutation.variables?.listingAdmissionId,
  })
  const cloneError =
    mutationBelongsToCurrentInput && cloneMutation.isError
      ? getErrorMessage(cloneMutation.error)
      : null
  const resultSummary =
    mutationBelongsToCurrentInput && cloneMutation.isSuccess
      ? formatCloneAllResult(cloneMutation.data)
      : null

  const handleBulkClone = () => {
    if (!canClone || publishedListingInput === null) return
    cloneMutation.mutate({
      listingAdmissionId: publishedListingInput.admissionId,
      targetDirectory: targetDirectory.trim(),
    })
  }

  return {
    filter,
    setFilter,
    includeArchived,
    setIncludeArchived,
    targetDirectory,
    setTargetDirectory,
    listResult: listingQuery.data ?? null,
    listError: listingQuery.isError
      ? getErrorMessage(listingQuery.error)
      : null,
    isListing: listingQuery.isFetching,
    isCloning: cloneMutation.isPending,
    hasConnection,
    hasNamespace,
    canClone,
    cloneError,
    resultSummary,
    handleBulkClone,
  } as const
}
