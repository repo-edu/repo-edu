import type {
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  RepositoryListNamespaceResult,
} from "@repo-edu/application-contract"
import type { PersistedAppCredentials } from "@repo-edu/domain/settings"
import { keepPreviousData } from "@tanstack/react-query"

export const cloneAllListingDebounceMs = 350
// TanStack re-arms garbage collection while an unobserved mutation is pending.
// A bounded non-zero interval avoids a hot timer loop during background clones.
export const cloneAllMutationGcTimeMs = 5 * 60 * 1000

export type CloneAllSafeListingInput = {
  readonly connectionId: string
  readonly namespace: string
  readonly filter: string
  readonly includeArchived: boolean
}

export function createCloneAllSafeListingInput(params: {
  readonly connectionId: string | null
  readonly namespace: string
  readonly filter: string
  readonly includeArchived: boolean
}): CloneAllSafeListingInput | null {
  if (params.connectionId === null || params.namespace.length === 0) {
    return null
  }
  return {
    connectionId: params.connectionId,
    namespace: params.namespace,
    filter: params.filter,
    includeArchived: params.includeArchived,
  }
}

export type CloneAllListingAdmissionId = CloneAllSafeListingInput & {
  readonly listingGeneration: number
}

export type CloneAllPublishedListingInput = {
  readonly admissionId: CloneAllListingAdmissionId
  readonly credentials: PersistedAppCredentials
}

export type CloneAllMutationVariables = {
  readonly listingAdmissionId: CloneAllListingAdmissionId
  readonly targetDirectory: string
}

export type CloneAllScheduler = (
  callback: () => void,
  delayMs: number,
) => () => void

type PublishedListingUpdater = (
  previous: CloneAllPublishedListingInput | null,
) => CloneAllPublishedListingInput | null

type CloneAllListingTransitionOptions = {
  readonly input: CloneAllSafeListingInput | null
  readonly credentials: PersistedAppCredentials
  readonly updatePublishedInput: (updater: PublishedListingUpdater) => void
  readonly schedule: CloneAllScheduler
  readonly cancelListingQueries: () => void
}

export type CloneAllListingTransition = {
  dispose(): void
}

export function createCloneAllListingTransition({
  input,
  credentials,
  updatePublishedInput,
  schedule,
  cancelListingQueries,
}: CloneAllListingTransitionOptions): CloneAllListingTransition {
  let disposed = false
  let cancelScheduledPublication: (() => void) | null = null

  void cancelListingQueries()

  if (input !== null) {
    cancelScheduledPublication = schedule(() => {
      if (disposed) return
      updatePublishedInput((previous) => {
        if (
          cloneAllInputIsCurrent({
            input,
            credentials,
            publishedInput: previous,
          })
        ) {
          return previous
        }
        return {
          admissionId: {
            ...input,
            listingGeneration:
              (previous?.admissionId.listingGeneration ?? 0) + 1,
          },
          credentials,
        }
      })
    }, cloneAllListingDebounceMs)
  }

  return {
    dispose() {
      if (disposed) return
      disposed = true
      cancelScheduledPublication?.()
      void cancelListingQueries()
    },
  }
}

export const cloneAllListingQueryKeys = {
  all: ["repository-operations", "clone-all", "listing"] as const,
  disabled: [
    "repository-operations",
    "clone-all",
    "listing",
    "disabled",
  ] as const,
  admission: (admissionId: CloneAllListingAdmissionId) =>
    ["repository-operations", "clone-all", "listing", admissionId] as const,
}

export function createCloneAllListingQueryPolicy(
  admissionId: CloneAllListingAdmissionId | null,
) {
  return {
    queryKey:
      admissionId === null
        ? cloneAllListingQueryKeys.disabled
        : cloneAllListingQueryKeys.admission(admissionId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always" as const,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: keepPreviousData,
  }
}

export function createCloneAllMutationPolicy() {
  return {
    gcTime: cloneAllMutationGcTimeMs,
    retry: false,
  } as const
}

export function cloneAllSafeInputMatchesAdmission(
  input: CloneAllSafeListingInput | null,
  admissionId: CloneAllListingAdmissionId | null,
): boolean {
  return (
    input !== null &&
    admissionId !== null &&
    input.connectionId === admissionId.connectionId &&
    input.namespace === admissionId.namespace &&
    input.filter === admissionId.filter &&
    input.includeArchived === admissionId.includeArchived
  )
}

export function cloneAllInputIsCurrent(params: {
  readonly input: CloneAllSafeListingInput | null
  readonly credentials: PersistedAppCredentials
  readonly publishedInput: CloneAllPublishedListingInput | null
}): boolean {
  return (
    params.publishedInput !== null &&
    params.credentials === params.publishedInput.credentials &&
    cloneAllSafeInputMatchesAdmission(
      params.input,
      params.publishedInput.admissionId,
    )
  )
}

export function selectCloneAllCanClone(params: {
  readonly inputIsCurrent: boolean
  readonly queryIsSuccess: boolean
  readonly queryIsPlaceholderData: boolean
  readonly listResult: RepositoryListNamespaceResult | undefined
  readonly targetDirectory: string
  readonly mutationIsPending: boolean
}): boolean {
  return (
    params.inputIsCurrent &&
    params.queryIsSuccess &&
    !params.queryIsPlaceholderData &&
    params.listResult !== undefined &&
    params.listResult.repositories.length > 0 &&
    params.targetDirectory.trim().length > 0 &&
    !params.mutationIsPending
  )
}

export function cloneAllAdmissionIdsEqual(
  left: CloneAllListingAdmissionId,
  right: CloneAllListingAdmissionId,
): boolean {
  return (
    left.connectionId === right.connectionId &&
    left.namespace === right.namespace &&
    left.filter === right.filter &&
    left.includeArchived === right.includeArchived &&
    left.listingGeneration === right.listingGeneration
  )
}

export function cloneAllMutationBelongsToCurrentCommand(params: {
  readonly inputIsCurrent: boolean
  readonly publishedInput: CloneAllPublishedListingInput | null
  readonly currentTargetDirectory: string
  readonly mutationVariables: CloneAllMutationVariables | undefined
}): boolean {
  return (
    params.inputIsCurrent &&
    params.publishedInput !== null &&
    params.mutationVariables !== undefined &&
    params.currentTargetDirectory.trim() ===
      params.mutationVariables.targetDirectory &&
    cloneAllAdmissionIdsEqual(
      params.mutationVariables.listingAdmissionId,
      params.publishedInput.admissionId,
    )
  )
}

export function buildCloneAllWorkflowInput(params: {
  readonly variables: CloneAllMutationVariables
  readonly publishedInput: CloneAllPublishedListingInput | null
  readonly listResult: RepositoryListNamespaceResult | undefined
}): RepositoryBulkCloneInput {
  if (
    params.publishedInput === null ||
    !cloneAllAdmissionIdsEqual(
      params.variables.listingAdmissionId,
      params.publishedInput.admissionId,
    ) ||
    params.listResult === undefined
  ) {
    throw new Error("Clone-all input is no longer admitted.")
  }

  return {
    credentials: params.publishedInput.credentials,
    namespace: params.publishedInput.admissionId.namespace,
    repositories: params.listResult.repositories.map(
      ({ name, identifier }) => ({
        name,
        identifier,
      }),
    ),
    targetDirectory: params.variables.targetDirectory.trim(),
  }
}

export function formatCloneAllResult(result: RepositoryCloneResult): string {
  const time = new Date(result.completedAt).toLocaleTimeString()
  return `${result.repositoriesCloned} cloned / ${result.repositoriesFailed} failed at ${time}.`
}

export function extractSubgroupPath(
  identifier: string,
  name: string,
): string | null {
  if (identifier === name) return null
  const suffix = `/${name}`
  if (!identifier.endsWith(suffix)) return null
  const subgroup = identifier.slice(0, identifier.length - suffix.length)
  return subgroup.length > 0 ? subgroup : null
}
