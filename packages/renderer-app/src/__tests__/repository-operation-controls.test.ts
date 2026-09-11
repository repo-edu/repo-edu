import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { RepositoryListNamespaceResult } from "@repo-edu/application-contract"
import {
  defaultAppCredentials,
  type PersistedAppCredentials,
} from "@repo-edu/domain/settings"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import {
  buildCloneAllWorkflowInput,
  type CloneAllPublishedListingInput,
  type CloneAllSafeListingInput,
  type CloneAllScheduler,
  cloneAllInputIsCurrent,
  cloneAllResultBelongsToCurrentCommand,
  createCloneAllListingQueryPolicy,
  createCloneAllListingTransition,
  createCloneAllSafeListingInput,
  extractSubgroupPath,
  fetchCloneAllListing,
  selectCloneAllCanClone,
} from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-repositories.js"

import {
  commitPreparation,
  deferred,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

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
    const transition = createCloneAllListingTransition({
      canStartQueries: true,
      input: initialInput,
      credentials: firstCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
    })

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
  })

  it("advances generation when only the credentials snapshot changes", () => {
    const scheduler = createManualScheduler()
    let publishedInput: CloneAllPublishedListingInput | null =
      initialPublishedInput
    const transition = createCloneAllListingTransition({
      canStartQueries: true,
      input: initialInput,
      credentials: secondCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
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
      canStartQueries: true,
      input: null,
      credentials: firstCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
    })

    assert.equal(publishedInput, initialPublishedInput)
    disabledTransition.dispose()

    const enabledTransition = createCloneAllListingTransition({
      canStartQueries: true,
      input: initialInput,
      credentials: firstCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
    })
    scheduler.flush()

    assert.equal(publishedInput, initialPublishedInput)
    enabledTransition.dispose()
  })

  it("discards scheduled input publication on disposal", () => {
    const scheduler = createManualScheduler()
    let publishedInput: CloneAllPublishedListingInput | null =
      initialPublishedInput
    const transition = createCloneAllListingTransition({
      canStartQueries: true,
      input: { ...initialInput, filter: "lab-2*" },
      credentials: firstCredentials,
      updatePublishedInput: (update) => {
        publishedInput = update(publishedInput)
      },
      schedule: scheduler.schedule,
    })

    assert.equal(scheduler.pendingCount, 1)
    transition.dispose()
    assert.equal(scheduler.pendingCount, 0)
    scheduler.flush()
    assert.equal(publishedInput, initialPublishedInput)
  })
})

describe("clone-all query ownership", () => {
  for (const ending of ["input change", "panel closure"] as const) {
    it(`keeps the listing body on ${ending}`, async (t) => {
      resetStores()
      const entered = deferred<void>()
      const release = deferred<void>()
      const controller = startController({
        workflowClient: workflowClient(async (id) => {
          if (id === "settings.loadApp") return makeSettings()
          if (id === "repo.listNamespace") {
            entered.resolve()
            await release.promise
            return listingResult
          }
          assert.fail(id)
        }),
      })
      const queryClient = new QueryClient()
      t.after(() => {
        controller.dispose()
        queryClient.clear()
      })
      await controller.waitForIdle()
      const policy = createCloneAllListingQueryPolicy(
        initialPublishedInput.admissionId,
      )
      const observer = new QueryObserver<RepositoryListNamespaceResult>(
        queryClient,
        {
          ...policy,
          enabled: false,
        },
      )
      const unsubscribe = observer.subscribe(() => {})
      t.after(unsubscribe)
      const listing = fetchCloneAllListing(
        controller.operations,
        queryClient,
        initialPublishedInput,
      )
      await entered.promise
      if (ending === "input change") {
        observer.setOptions({
          ...createCloneAllListingQueryPolicy({
            ...initialPublishedInput.admissionId,
            filter: "lab-2*",
            listingGeneration: 2,
          }),
          enabled: false,
        })
      } else unsubscribe()
      assert.equal(
        queryClient.getQueryState(policy.queryKey)?.fetchStatus,
        "fetching",
      )
      let closed = false
      const closing = controller.requestClose(commitPreparation).then(() => {
        closed = true
        assert.deepEqual(
          queryClient.getQueryData(policy.queryKey),
          listingResult,
        )
      })
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(closed, false)
      release.resolve()
      await Promise.all([listing, closing])
      assert.equal(closed, true)
    })
  }

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
          canAdmitSessionChange: true,
          inputIsCurrent: true,
          queryIsSuccess: transitional.isSuccess,
          queryIsPlaceholderData: transitional.isPlaceholderData,
          listResult: transitional.data,
          targetDirectory: "/tmp/repos",
          commandIsPending: false,
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

  it("uses panel-local listing retention", () => {
    const policy = createCloneAllListingQueryPolicy(
      initialPublishedInput.admissionId,
    )
    assert.equal(policy.staleTime, 0)
    assert.equal(policy.gcTime, 0)
    assert.equal(policy.refetchOnMount, false)
    assert.equal(policy.retry, false)
    assert.equal(policy.refetchOnWindowFocus, false)
    assert.equal(policy.refetchOnReconnect, false)
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
      cloneAllResultBelongsToCurrentCommand({
        inputIsCurrent: true,
        publishedInput: initialPublishedInput,
        currentTargetDirectory: " /tmp/repos ",
        commandVariables: {
          listingAdmissionId: initialPublishedInput.admissionId,
          targetDirectory: "/tmp/repos",
        },
      }),
      true,
    )
    assert.equal(
      cloneAllResultBelongsToCurrentCommand({
        inputIsCurrent: false,
        publishedInput: initialPublishedInput,
        currentTargetDirectory: "/tmp/repos",
        commandVariables: {
          listingAdmissionId: initialPublishedInput.admissionId,
          targetDirectory: "/tmp/repos",
        },
      }),
      false,
    )
    assert.equal(
      cloneAllResultBelongsToCurrentCommand({
        inputIsCurrent: true,
        publishedInput: initialPublishedInput,
        currentTargetDirectory: "/tmp/other-repos",
        commandVariables: {
          listingAdmissionId: initialPublishedInput.admissionId,
          targetDirectory: "/tmp/repos",
        },
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
      canAdmitSessionChange: true,
      inputIsCurrent: true,
      queryIsSuccess: true,
      queryIsPlaceholderData: false,
      listResult: listingResult,
      targetDirectory: "/tmp/repos",
      commandIsPending: false,
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
      selectCloneAllCanClone({ ...base, commandIsPending: true }),
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
