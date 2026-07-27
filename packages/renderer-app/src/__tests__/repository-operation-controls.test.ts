import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  RepositoryCloneResult,
  RepositoryListNamespaceResult,
} from "@repo-edu/application-contract"
import {
  defaultAppCredentials,
  type PersistedAppCredentials,
} from "@repo-edu/domain/settings"
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query"
import {
  executeRegisteredCloneAllCommand,
  registerCloneAllCommand,
} from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-command.js"
import {
  buildCloneAllWorkflowInput,
  type CloneAllPublishedListingInput,
  type CloneAllSafeListingInput,
  type CloneAllScheduler,
  cloneAllInputIsCurrent,
  cloneAllListingQueryKeys,
  cloneAllMutationBelongsToCurrentInput,
  cloneAllMutationGcTimeMs,
  createCloneAllListingQueryPolicy,
  createCloneAllListingTransition,
  createCloneAllMutationPolicy,
  createCloneAllSafeListingInput,
  extractSubgroupPath,
  selectCloneAllCanClone,
} from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-repositories.js"

const firstCredentials: PersistedAppCredentials = {
  ...defaultAppCredentials,
  gitConnections: [
    {
      id: "connection-1",
      provider: "github",
      baseUrl: "https://github.com",
      token: "secret-token-1",
    },
  ],
}

const secondCredentials: PersistedAppCredentials = {
  ...firstCredentials,
  gitConnections: [
    {
      ...firstCredentials.gitConnections[0],
      token: "secret-token-2",
    },
  ],
}

const initialInput: CloneAllSafeListingInput = {
  connectionId: "connection-1",
  namespace: "course-org",
  filter: "lab-*",
  includeArchived: false,
}

const initialPublishedInput: CloneAllPublishedListingInput = {
  admissionId: {
    ...initialInput,
    listingGeneration: 1,
  },
  credentials: firstCredentials,
}

const listingResult: RepositoryListNamespaceResult = {
  repositories: [
    {
      name: "lab-1",
      identifier: "team-a/lab-1",
      archived: false,
    },
  ],
}

const cloneResult: RepositoryCloneResult = {
  repositoriesPlanned: 1,
  repositoriesCloned: 1,
  repositoriesFailed: 0,
  recordedRepositories: {},
  completedAt: "2026-07-26T20:00:00.000Z",
}

type ManualScheduler = {
  readonly schedule: CloneAllScheduler
  flush(): void
  readonly pendingCount: number
}

function createManualScheduler(): ManualScheduler {
  const pending = new Set<() => void>()
  return {
    schedule(callback) {
      pending.add(callback)
      return () => pending.delete(callback)
    },
    flush() {
      for (const callback of [...pending]) {
        pending.delete(callback)
        callback()
      }
    },
    get pendingCount() {
      return pending.size
    },
  }
}

describe("clone-all listing transition", () => {
  it("publishes settled inputs with a new safe generation", () => {
    const scheduler = createManualScheduler()
    let publishedInput: CloneAllPublishedListingInput | null = null
    let cancellationCount = 0
    const transition = createCloneAllListingTransition({
      input: initialInput,
      credentials: firstCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
      cancelListingQueries: () => {
        cancellationCount++
      },
    })

    assert.equal(cancellationCount, 1)
    assert.equal(publishedInput, null)
    assert.equal(scheduler.pendingCount, 1)

    scheduler.flush()

    assert.deepEqual(publishedInput, initialPublishedInput)
    assert.equal(
      JSON.stringify(
        createCloneAllListingQueryPolicy(
          (publishedInput as CloneAllPublishedListingInput).admissionId,
        ).queryKey,
      ).includes("secret-token"),
      false,
    )

    transition.dispose()
    assert.equal(cancellationCount, 2)
  })

  it("advances generation when only the credentials snapshot changes", () => {
    const scheduler = createManualScheduler()
    let publishedInput: CloneAllPublishedListingInput | null =
      initialPublishedInput
    const transition = createCloneAllListingTransition({
      input: initialInput,
      credentials: secondCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
      cancelListingQueries: () => {},
    })

    scheduler.flush()

    assert.equal(publishedInput?.admissionId.listingGeneration, 2)
    assert.equal(publishedInput?.credentials, secondCredentials)
    transition.dispose()
  })

  it("reuses the admitted generation after a transient disable", () => {
    const scheduler = createManualScheduler()
    let publishedInput: CloneAllPublishedListingInput | null =
      initialPublishedInput
    const disabledTransition = createCloneAllListingTransition({
      input: null,
      credentials: firstCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
      cancelListingQueries: () => {},
    })

    assert.equal(publishedInput, initialPublishedInput)
    disabledTransition.dispose()

    const enabledTransition = createCloneAllListingTransition({
      input: initialInput,
      credentials: firstCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
      cancelListingQueries: () => {},
    })
    scheduler.flush()

    assert.equal(publishedInput, initialPublishedInput)
    enabledTransition.dispose()
  })

  it("cancels the active React Query request and scheduled publication on disposal", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const scheduler = createManualScheduler()
    let markStarted: () => void = () => {}
    let markAborted: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const aborted = new Promise<void>((resolve) => {
      markAborted = resolve
    })

    void queryClient
      .fetchQuery({
        ...createCloneAllListingQueryPolicy(initialPublishedInput.admissionId),
        queryFn: ({ signal }) =>
          new Promise<RepositoryListNamespaceResult>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              markAborted()
              reject(new Error("aborted"))
            })
            markStarted()
          }),
      })
      .catch(() => {})
    await started

    const transition = createCloneAllListingTransition({
      input: { ...initialInput, filter: "lab-2*" },
      credentials: firstCredentials,
      updatePublishedInput: () => {},
      schedule: scheduler.schedule,
      cancelListingQueries: () => {
        void queryClient.cancelQueries({
          queryKey: cloneAllListingQueryKeys.all,
        })
      },
    })

    await aborted
    assert.equal(scheduler.pendingCount, 1)

    transition.dispose()
    assert.equal(scheduler.pendingCount, 0)
  })

  it("cancels a replacement listing when a second edit arrives", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const replacementAdmission = {
      ...initialPublishedInput.admissionId,
      filter: "lab-2*",
      listingGeneration: 2,
    }
    let markStarted: () => void = () => {}
    let markAborted: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const aborted = new Promise<void>((resolve) => {
      markAborted = resolve
    })
    void queryClient
      .fetchQuery({
        ...createCloneAllListingQueryPolicy(replacementAdmission),
        queryFn: ({ signal }) =>
          new Promise<RepositoryListNamespaceResult>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              markAborted()
              reject(new Error("aborted"))
            })
            markStarted()
          }),
      })
      .catch(() => {})
    await started

    const transition = createCloneAllListingTransition({
      input: { ...initialInput, filter: "lab-3*" },
      credentials: firstCredentials,
      updatePublishedInput: () => {},
      schedule: createManualScheduler().schedule,
      cancelListingQueries: () => {
        void queryClient.cancelQueries({
          queryKey: cloneAllListingQueryKeys.all,
        })
      },
    })

    await aborted
    transition.dispose()
  })
})

describe("clone-all query ownership", () => {
  it("keeps the disabled listing query idle", () => {
    const queryClient = new QueryClient()
    let fetchCount = 0
    const observer = new QueryObserver(queryClient, {
      ...createCloneAllListingQueryPolicy(null),
      enabled: false,
      queryFn: async () => {
        fetchCount++
        return listingResult
      },
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
      const result = observer.getCurrentResult()
      assert.equal(result.status, "pending")
      assert.equal(result.fetchStatus, "idle")
      assert.equal(result.data, undefined)
      assert.equal(fetchCount, 0)
    } finally {
      unsubscribe()
    }
  })

  it("retains previous data as a placeholder across an admission change", async () => {
    const queryClient = new QueryClient()
    const firstAdmission = initialPublishedInput.admissionId
    const secondAdmission = {
      ...firstAdmission,
      filter: "lab-2*",
      listingGeneration: 2,
    }
    let resolveSecond: (value: RepositoryListNamespaceResult) => void = () => {}
    const secondResult = new Promise<RepositoryListNamespaceResult>(
      (resolve) => {
        resolveSecond = resolve
      },
    )
    const observer = new QueryObserver(queryClient, {
      ...createCloneAllListingQueryPolicy(firstAdmission),
      queryFn: async () => listingResult,
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
      await observer.refetch()
      observer.setOptions({
        ...createCloneAllListingQueryPolicy(secondAdmission),
        queryFn: () => secondResult,
      })

      const transitional = observer.getCurrentResult()
      assert.equal(transitional.isPlaceholderData, true)
      assert.deepEqual(transitional.data, listingResult)
      assert.equal(
        selectCloneAllCanClone({
          inputIsCurrent: true,
          queryIsSuccess: transitional.isSuccess,
          queryIsPlaceholderData: transitional.isPlaceholderData,
          listResult: transitional.data,
          targetDirectory: "/tmp/repos",
          mutationIsPending: false,
        }),
        false,
      )

      resolveSecond({ repositories: [] })
      const settled = await observer.refetch()
      assert.equal(settled.isPlaceholderData, false)
      assert.deepEqual(settled.data, { repositories: [] })
    } finally {
      unsubscribe()
    }
  })

  it("uses panel-local query retention and bounded mutation retention", () => {
    const policy = createCloneAllListingQueryPolicy(
      initialPublishedInput.admissionId,
    )
    assert.equal(policy.staleTime, 0)
    assert.equal(policy.gcTime, 0)
    assert.equal(policy.refetchOnMount, "always")
    assert.equal(policy.retry, false)
    assert.equal(policy.refetchOnWindowFocus, false)
    assert.equal(policy.refetchOnReconnect, false)
    assert.deepEqual(createCloneAllMutationPolicy(), {
      gcTime: cloneAllMutationGcTimeMs,
      retry: false,
    })
    assert.ok(cloneAllMutationGcTimeMs > 0)
  })

  it("keeps an admitted command stable while React Query pauses it", async () => {
    const queryClient = new QueryClient()
    const scope = { id: "clone-all-command-test" }
    let markFirstStarted: () => void = () => {}
    let releaseFirst: () => void = () => {}
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const firstExecution = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstObserver = new MutationObserver(queryClient, {
      scope,
      mutationFn: () => {
        markFirstStarted()
        return firstExecution
      },
    })
    const firstMutation = firstObserver.mutate(undefined)
    await firstStarted

    const variables = {
      listingAdmissionId: initialPublishedInput.admissionId,
      targetDirectory: "/tmp/repos",
    }
    let executionCount = 0
    registerCloneAllCommand(variables, async () => {
      executionCount++
      return cloneResult
    })
    const secondOptions = {
      ...createCloneAllMutationPolicy(),
      scope,
      mutationFn: executeRegisteredCloneAllCommand,
    }
    const secondObserver = new MutationObserver(queryClient, secondOptions)
    const secondMutation = secondObserver.mutate(variables)

    assert.equal(secondObserver.getCurrentResult().isPaused, true)
    secondObserver.setOptions(secondOptions)
    releaseFirst()

    await firstMutation
    assert.equal(await secondMutation, cloneResult)
    assert.equal(executionCount, 1)
    assert.throws(
      () => executeRegisteredCloneAllCommand(variables),
      /not registered/,
    )
  })
})

describe("clone-all admission and clone inputs", () => {
  it("disables cloning immediately for raw input and credential divergence", () => {
    assert.equal(
      cloneAllInputIsCurrent({
        input: initialInput,
        credentials: firstCredentials,
        publishedInput: initialPublishedInput,
      }),
      true,
    )
    assert.equal(
      cloneAllInputIsCurrent({
        input: { ...initialInput, filter: "lab-2*" },
        credentials: firstCredentials,
        publishedInput: initialPublishedInput,
      }),
      false,
    )
    assert.equal(
      cloneAllInputIsCurrent({
        input: initialInput,
        credentials: secondCredentials,
        publishedInput: initialPublishedInput,
      }),
      false,
    )
    assert.equal(
      cloneAllMutationBelongsToCurrentInput({
        inputIsCurrent: true,
        publishedInput: initialPublishedInput,
        mutationAdmissionId: initialPublishedInput.admissionId,
      }),
      true,
    )
    assert.equal(
      cloneAllMutationBelongsToCurrentInput({
        inputIsCurrent: false,
        publishedInput: initialPublishedInput,
        mutationAdmissionId: initialPublishedInput.admissionId,
      }),
      false,
    )
  })

  it("builds the safe listing input through one production constructor", () => {
    assert.deepEqual(
      createCloneAllSafeListingInput({
        connectionId: "connection-1",
        namespace: "course-org",
        filter: "lab-*",
        includeArchived: false,
      }),
      initialInput,
    )
    assert.equal(
      createCloneAllSafeListingInput({
        connectionId: null,
        namespace: "course-org",
        filter: "lab-*",
        includeArchived: false,
      }),
      null,
    )
    assert.equal(
      createCloneAllSafeListingInput({
        connectionId: "connection-1",
        namespace: "",
        filter: "lab-*",
        includeArchived: false,
      }),
      null,
    )
  })

  it("requires current non-placeholder success data and a target folder", () => {
    const base = {
      inputIsCurrent: true,
      queryIsSuccess: true,
      queryIsPlaceholderData: false,
      listResult: listingResult,
      targetDirectory: "/tmp/repos",
      mutationIsPending: false,
    }
    assert.equal(selectCloneAllCanClone(base), true)
    assert.equal(
      selectCloneAllCanClone({ ...base, inputIsCurrent: false }),
      false,
    )
    assert.equal(
      selectCloneAllCanClone({ ...base, queryIsPlaceholderData: true }),
      false,
    )
    assert.equal(
      selectCloneAllCanClone({ ...base, targetDirectory: "  " }),
      false,
    )
    assert.equal(
      selectCloneAllCanClone({ ...base, mutationIsPending: true }),
      false,
    )
  })

  it("builds an atomic workflow input from the admitted listing", () => {
    const variables = {
      listingAdmissionId: initialPublishedInput.admissionId,
      targetDirectory: " /tmp/repos ",
    }

    const workflowInput = buildCloneAllWorkflowInput({
      variables,
      publishedInput: initialPublishedInput,
      listResult: listingResult,
    })

    assert.equal(workflowInput.credentials, firstCredentials)
    assert.equal(workflowInput.namespace, "course-org")
    assert.equal(workflowInput.targetDirectory, "/tmp/repos")
    assert.deepEqual(workflowInput.repositories, [
      { name: "lab-1", identifier: "team-a/lab-1" },
    ])
    assert.throws(
      () =>
        buildCloneAllWorkflowInput({
          variables: {
            ...variables,
            listingAdmissionId: {
              ...variables.listingAdmissionId,
              listingGeneration: 2,
            },
          },
          publishedInput: initialPublishedInput,
          listResult: listingResult,
        }),
      /no longer admitted/,
    )
  })

  it("extracts only valid subgroup prefixes", () => {
    assert.equal(extractSubgroupPath("team-a/lab-1", "lab-1"), "team-a")
    assert.equal(extractSubgroupPath("lab-1", "lab-1"), null)
    assert.equal(extractSubgroupPath("team-a/not-lab", "lab-1"), null)
  })
})
