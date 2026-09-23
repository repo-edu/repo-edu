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
  type CloneAllListingState,
  type CloneAllPublishedListingInput,
  type CloneAllSafeListingInput,
  cloneAllInputIsCurrent,
  cloneAllListingIsReady,
  cloneAllListingReducer,
  cloneAllResultBelongsToCurrentCommand,
  createCloneAllListingQueryPolicy,
  createCloneAllSafeListingInput,
  extractSubgroupPath,
  fetchCloneAllListing,
  initialCloneAllListingState,
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

describe("clone-all listing requests", () => {
  const context = {
    connectionId: initialInput.connectionId,
    namespace: initialInput.namespace,
    credentials: firstCredentials,
  }
  const listedState: CloneAllListingState = {
    filter: initialInput.filter,
    includeArchived: false,
    publishedInput: initialPublishedInput,
  }

  it("publishes an initial listing with a credential-free query key", () => {
    const state = cloneAllListingReducer(initialCloneAllListingState, {
      type: "context",
      ...context,
    })
    assert.equal(state.publishedInput?.admissionId.filter, "")
    assert.equal(state.publishedInput?.admissionId.listingGeneration, 1)
    assert.equal(
      JSON.stringify(
        createCloneAllListingQueryPolicy(
          cloneAllListingIsReady(state.publishedInput)
            ? state.publishedInput.admissionId
            : null,
        ).queryKey,
      ).includes("secret-token"),
      false,
    )
  })

  it("keeps typing local until a search request publishes the current filter", () => {
    const draft = cloneAllListingReducer(listedState, {
      type: "filter",
      value: " lab-2* ",
    })
    assert.equal(draft.publishedInput, initialPublishedInput)
    const submitted = cloneAllListingReducer(draft, {
      type: "search",
      ...context,
    })
    assert.equal(submitted.publishedInput?.admissionId.filter, "lab-2*")
    assert.equal(submitted.publishedInput?.admissionId.listingGeneration, 2)
    const repeated = cloneAllListingReducer(submitted, {
      type: "search",
      ...context,
    })
    assert.equal(repeated.publishedInput?.admissionId.listingGeneration, 3)
  })

  it("publishes archived changes with the current filter immediately", () => {
    const draft = cloneAllListingReducer(listedState, {
      type: "filter",
      value: "lab-2*",
    })
    const state = cloneAllListingReducer(draft, {
      type: "include-archived",
      value: true,
      ...context,
    })
    assert.equal(state.includeArchived, true)
    assert.equal(state.publishedInput?.admissionId.includeArchived, true)
    assert.equal(state.publishedInput?.admissionId.filter, "lab-2*")
  })

  it("advances generation when the active credentials change", () => {
    const state = cloneAllListingReducer(listedState, {
      type: "context",
      ...context,
      credentials: secondCredentials,
    })
    assert.equal(state.publishedInput?.admissionId.listingGeneration, 2)
    assert.equal(state.publishedInput?.credentials, secondCredentials)
  })

  it("keeps unfinished drafts unpublished when unrelated credentials change", () => {
    const draft = cloneAllListingReducer(listedState, {
      type: "filter",
      value: "unfinished",
    })
    const credentials = {
      ...firstCredentials,
      gitConnections: [
        ...firstCredentials.gitConnections,
        { ...firstCredentials.gitConnections[0], id: "other-git" },
      ],
      lmsConnections: [
        {
          id: "lms",
          name: "LMS",
          provider: "canvas" as const,
          baseUrl: "https://canvas.example.edu",
          token: "example-token",
        },
      ],
      llmConnections: [
        {
          id: "llm",
          name: "Model",
          provider: "codex" as const,
          authMode: "api" as const,
          apiKey: "example-key",
        },
      ],
    }
    assert.equal(
      cloneAllListingReducer(draft, {
        type: "context",
        ...context,
        credentials,
      }),
      draft,
    )
  })

  it("requests a new listing when a connection becomes available again", () => {
    const disabled = cloneAllListingReducer(listedState, {
      type: "context",
      ...context,
      connectionId: null,
    })
    assert.equal(cloneAllListingIsReady(disabled.publishedInput), false)
    const restored = cloneAllListingReducer(disabled, {
      type: "context",
      ...context,
    })
    assert.equal(
      restored.publishedInput?.admissionId.connectionId,
      context.connectionId,
    )
    assert.equal(restored.publishedInput?.admissionId.listingGeneration, 3)
  })

  it("waits for Enter when typing a namespace, including an initially empty one", () => {
    for (const namespace of ["", context.namespace]) {
      const opened = cloneAllListingReducer(initialCloneAllListingState, {
        type: "context",
        ...context,
        namespace,
      })
      for (const draft of ["", "n", "ne", "new-org", namespace]) {
        assert.equal(
          cloneAllListingReducer(opened, {
            type: "context",
            ...context,
            namespace: draft,
          }),
          opened,
        )
      }
      const searched = cloneAllListingReducer(opened, {
        type: "search",
        ...context,
        namespace: "new-org",
      })
      assert.equal(searched.publishedInput?.admissionId.namespace, "new-org")
      assert.equal(cloneAllListingIsReady(searched.publishedInput), true)
    }
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
