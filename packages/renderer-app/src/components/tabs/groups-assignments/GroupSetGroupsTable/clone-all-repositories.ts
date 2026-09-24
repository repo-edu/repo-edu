import type {
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  RepositoryListNamespaceResult,
} from "@repo-edu/application-contract"
import type { PersistedAppCredentials } from "@repo-edu/domain/settings"
import { keepPreviousData, type QueryClient } from "@tanstack/react-query"
import type { SessionOperationGateway } from "../../../../session/session-operations.js"
import { scopedSessionQueryOptions } from "../../../../session/session-query.js"

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

type CloneAllListingRequest = {
  readonly admissionId: Omit<CloneAllListingAdmissionId, "connectionId"> & {
    readonly connectionId: string | null
  }
  readonly credentials: PersistedAppCredentials
}

export function cloneAllListingIsReady(
  request: CloneAllListingRequest | null,
): request is CloneAllPublishedListingInput {
  return (
    request !== null &&
    request.admissionId.connectionId !== null &&
    request.admissionId.namespace.length > 0
  )
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
    // Input changes do not cancel a listing; its Cancel control does.
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

type CloneAllListingContext = {
  readonly connectionId: string | null
  readonly namespace: string
  readonly credentials: PersistedAppCredentials
}

export type CloneAllListingState = {
  readonly filter: string
  readonly includeArchived: boolean
  readonly publishedInput: CloneAllListingRequest | null
}

type CloneAllListingEvent =
  | { type: "filter"; value: string }
  | ({ type: "context" | "search" } & CloneAllListingContext)
  | ({ type: "include-archived"; value: boolean } & CloneAllListingContext)

export const initialCloneAllListingState: CloneAllListingState = {
  filter: "",
  includeArchived: false,
  publishedInput: null,
}

export function cloneAllListingReducer(
  state: CloneAllListingState,
  event: CloneAllListingEvent,
): CloneAllListingState {
  if (event.type === "filter") return { ...state, filter: event.value }
  if (event.type === "context" && state.publishedInput !== null) {
    // Only opening the panel requests a listing from context. Later text and
    // connection changes wait for Enter, keeping Settings free of remote work.
    return state
  }
  const includeArchived =
    event.type === "include-archived" ? event.value : state.includeArchived
  const input = {
    connectionId: event.connectionId,
    namespace: event.namespace,
    filter: state.filter.trim(),
    includeArchived,
  }
  return {
    ...state,
    includeArchived,
    // Keep even incomplete requests, so typing the first namespace does not
    // turn an earlier panel-open event into a new listing request.
    publishedInput: {
      admissionId: {
        ...input,
        listingGeneration:
          (state.publishedInput?.admissionId.listingGeneration ?? 0) + 1,
      },
      credentials: event.credentials,
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
  const connectionId = params.input?.connectionId
  return (
    params.publishedInput !== null &&
    cloneAllSafeInputMatchesAdmission(
      params.input,
      params.publishedInput.admissionId,
    ) &&
    params.credentials.gitConnections.find(
      (connection) => connection.id === connectionId,
    ) ===
      params.publishedInput.credentials.gitConnections.find(
        (connection) => connection.id === connectionId,
      )
  )
}

export function selectCloneAllCanClone(params: {
  readonly inputIsCurrent: boolean
  readonly queryIsSuccess: boolean
  readonly queryIsPlaceholderData: boolean
  readonly listResult: RepositoryListNamespaceResult | undefined
  readonly targetDirectory: string
  readonly commandIsPending: boolean
}): boolean {
  return (
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
