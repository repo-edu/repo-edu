import type {
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  RepositoryListNamespaceResult,
} from "@repo-edu/application-contract"
import type { PersistedAppCredentials } from "@repo-edu/domain/settings"
import { keepPreviousData, type QueryClient } from "@tanstack/react-query"
import type { SessionOperationGateway } from "../../../../session/session-operations.js"
import { scopedSessionQueryOptions } from "../../../../session/session-query.js"

export const cloneAllListingDebounceMs = 350

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

export type CloneAllCommandVariables = {
  readonly listingAdmissionId: CloneAllListingAdmissionId
  readonly targetDirectory: string
}

export type CloneAllCommandState =
  | { status: "idle"; variables?: never }
  | { status: "pending"; variables: CloneAllCommandVariables }
  | {
      status: "success"
      variables: CloneAllCommandVariables
      data: RepositoryCloneResult
    }
  | { status: "error"; variables: CloneAllCommandVariables; error: unknown }

export function fetchCloneAllListing(
  operations: SessionOperationGateway,
  queryClient: QueryClient,
  input: CloneAllPublishedListingInput,
): Promise<RepositoryListNamespaceResult | undefined> {
  return operations.execute("repo.listNamespace", async (scope) => {
    // Listings are not cancellable, including when newer input is published.
    return await queryClient.fetchQuery({
      ...createCloneAllListingQueryPolicy(input.admissionId),
      ...scopedSessionQueryOptions(scope, () =>
        scope.run("repo.listNamespace", {
          credentials: input.credentials,
          namespace: input.admissionId.namespace,
          filter: input.admissionId.filter || undefined,
          includeArchived: input.admissionId.includeArchived,
        }),
      ),
    })
  })
}

export function executeCloneAllCommand(
  operations: SessionOperationGateway,
  queryClient: QueryClient,
  publishedInput: CloneAllPublishedListingInput,
  variables: CloneAllCommandVariables,
  publish: (state: CloneAllCommandState) => void,
): Promise<void> {
  return operations.execute("repo.bulkClone", async (scope) => {
    scope.publish(() => publish({ status: "pending", variables }))
    try {
      const listing = queryClient.getQueryState<RepositoryListNamespaceResult>(
        cloneAllListingQueryKeys.admission(variables.listingAdmissionId),
      )
      const input = buildCloneAllWorkflowInput({
        variables,
        publishedInput,
        listResult: listing?.status === "success" ? listing.data : undefined,
      })
      const data = await scope.run("repo.bulkClone", input)
      scope.publish(() => publish({ status: "success", variables, data }))
    } catch (error) {
      scope.publish(() => publish({ status: "error", variables, error }))
    }
  })
}

export type CloneAllScheduler = (
  callback: () => void,
  delayMs: number,
) => () => void

type PublishedListingUpdater = (
  previous: CloneAllPublishedListingInput | null,
) => CloneAllPublishedListingInput | null

type CloneAllListingTransitionOptions = {
  readonly canStartQueries: boolean
  readonly input: CloneAllSafeListingInput | null
  readonly credentials: PersistedAppCredentials
  readonly updatePublishedInput: (updater: PublishedListingUpdater) => void
  readonly schedule: CloneAllScheduler
}

export type CloneAllListingTransition = {
  dispose(): void
}

export function createCloneAllListingTransition({
  canStartQueries,
  input,
  credentials,
  updatePublishedInput,
  schedule,
}: CloneAllListingTransitionOptions): CloneAllListingTransition {
  let disposed = false
  let cancelScheduledPublication: (() => void) | null = null

  if (canStartQueries && input !== null) {
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
    },
  }
}

export const cloneAllListingQueryKeys = {
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
    refetchOnMount: false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: keepPreviousData,
  }
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
  readonly canAdmitSessionChange: boolean
  readonly inputIsCurrent: boolean
  readonly queryIsSuccess: boolean
  readonly queryIsPlaceholderData: boolean
  readonly listResult: RepositoryListNamespaceResult | undefined
  readonly targetDirectory: string
  readonly commandIsPending: boolean
}): boolean {
  return (
    params.canAdmitSessionChange &&
    params.inputIsCurrent &&
    params.queryIsSuccess &&
    !params.queryIsPlaceholderData &&
    params.listResult !== undefined &&
    params.listResult.repositories.length > 0 &&
    params.targetDirectory.trim().length > 0 &&
    !params.commandIsPending
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

export function cloneAllResultBelongsToCurrentCommand(params: {
  readonly inputIsCurrent: boolean
  readonly publishedInput: CloneAllPublishedListingInput | null
  readonly currentTargetDirectory: string
  readonly commandVariables: CloneAllCommandVariables | undefined
}): boolean {
  return (
    params.inputIsCurrent &&
    params.publishedInput !== null &&
    params.commandVariables !== undefined &&
    params.currentTargetDirectory.trim() ===
      params.commandVariables.targetDirectory &&
    cloneAllAdmissionIdsEqual(
      params.commandVariables.listingAdmissionId,
      params.publishedInput.admissionId,
    )
  )
}

export function buildCloneAllWorkflowInput(params: {
  readonly variables: CloneAllCommandVariables
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
