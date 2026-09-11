import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import type {
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  WorkflowId,
} from "@repo-edu/application-contract"
import { defaultAppCredentials } from "@repo-edu/domain/settings"
import {
  CancelledError,
  MutationObserver,
  onlineManager,
  type QueryClient,
  QueryObserver,
} from "@tanstack/react-query"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import {
  abortCohortPrefetchRun,
  createCohortPrefetchRun,
} from "../analysis/analysis-query-coordinator.js"
import {
  executeCloneAllCommand,
  executeRegisteredCloneAllCommand,
} from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-command.js"
import {
  type CloneAllPublishedListingInput,
  cloneAllInputIsCurrent,
  cloneAllListingQueryKeys,
  createCloneAllListingQueryPolicy,
  createCloneAllListingTransition,
  createCloneAllMutationPolicy,
  selectCloneAllCanClone,
} from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-repositories.js"
import type { SessionController } from "../session/session-controller.js"
import { sessionQueryOptions } from "../session/session-query.js"
import { canAdmitSessionChange } from "../session/session-reducer.js"
import {
  commitPreparation,
  deferred,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

const controllers: SessionController[] = []
const clients: QueryClient[] = []
beforeEach(resetStores)
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose()
  for (const client of clients.splice(0)) client.clear()
})

async function session(
  run?: (id: WorkflowId, input: unknown) => Promise<unknown>,
) {
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "settings.loadApp") return makeSettings()
      if (run !== undefined) return await run(id, input)
      return "head"
    }),
  })
  controllers.push(controller)
  await controller.waitForIdle()
  const client = createRendererQueryClient()
  clients.push(client)
  return { controller, client }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe("session Query publication", () => {
  it("publishes delayed clone input after command release without another edit", async (t) => {
    const { controller, client } = await session()
    const input = {
      connectionId: "git",
      namespace: "org",
      filter: "lab-*",
      includeArchived: false,
    }
    const credentials = defaultAppCredentials
    let publishedInput: CloneAllPublishedListingInput | null = null
    const inputIsCurrent = () =>
      cloneAllInputIsCurrent({ input, credentials, publishedInput })
    const pending = new Set<() => void>()
    const flushTimers = () => {
      for (const callback of [...pending]) {
        pending.delete(callback)
        callback()
      }
    }
    let canStartQueries = canAdmitSessionChange(controller.getSnapshot())
    const queryOptions = () => ({
      ...createCloneAllListingQueryPolicy(publishedInput?.admissionId ?? null),
      enabled: canStartQueries && inputIsCurrent(),
      ...sessionQueryOptions(
        controller.operations,
        "repo.listNamespace",
        async () => ({
          repositories: [
            { name: "lab-1", identifier: "lab-1", archived: false },
          ],
        }),
      ),
    })
    const observer = new QueryObserver(client, queryOptions())
    t.after(observer.subscribe(() => {}))
    const startTransition = () =>
      createCloneAllListingTransition({
        canStartQueries,
        input,
        credentials,
        updatePublishedInput: (update) => {
          controller.operations.change(() => {
            publishedInput = update(publishedInput)
            observer.setOptions(queryOptions())
          })
        },
        schedule: (callback) => {
          pending.add(callback)
          return () => pending.delete(callback)
        },
      })
    let transition = startTransition()
    t.after(() => transition.dispose())
    t.after(
      controller.subscribe(() => {
        const next = canAdmitSessionChange(controller.getSnapshot())
        if (next === canStartQueries) return
        canStartQueries = next
        transition.dispose()
        transition = startTransition()
        observer.setOptions(queryOptions())
      }),
    )
    assert.equal(pending.size, 1)
    const commandRelease = deferred<void>()
    const command = controller.operations.execute("repo.clone", async () => {
      await commandRelease.promise
    })
    assert.equal(pending.size, 0)
    flushTimers()
    assert.equal(publishedInput, null)
    assert.equal(observer.getCurrentResult().fetchStatus, "idle")
    commandRelease.resolve()
    await command
    assert.equal(pending.size, 1)
    flushTimers()
    await controller.waitForIdle()
    const result = observer.getCurrentResult()
    assert.equal(inputIsCurrent(), true)
    assert.equal(
      selectCloneAllCanClone({
        inputIsCurrent: inputIsCurrent(),
        queryIsSuccess: result.isSuccess,
        queryIsPlaceholderData: result.isPlaceholderData,
        listResult: result.data,
        targetDirectory: "/repos",
        mutationIsPending: false,
      }),
      true,
    )
  })

  for (const online of [true, false]) {
    it(`keeps the listing through command freeze and mutation settlement while online is ${online}`, async (t) => {
      const previousOnline = onlineManager.isOnline()
      t.after(() => onlineManager.setOnline(previousOnline))
      const captured: RepositoryBulkCloneInput[] = []
      const result: RepositoryCloneResult = {
        repositoriesPlanned: 1,
        repositoriesCloned: 1,
        repositoriesFailed: 0,
        recordedRepositories: {},
        completedAt: "2026-09-07T00:00:00Z",
      }
      const { controller, client } = await session(async (id, input) => {
        assert.equal(id, "repo.bulkClone")
        captured.push(input as RepositoryBulkCloneInput)
        return result
      })
      let publishedInput: CloneAllPublishedListingInput = {
        admissionId: {
          connectionId: "git",
          namespace: "org",
          filter: "",
          includeArchived: false,
          listingGeneration: 1,
        },
        credentials: defaultAppCredentials,
      }
      const variables = {
        listingAdmissionId: publishedInput.admissionId,
        targetDirectory: "/repos",
      }
      const key = cloneAllListingQueryKeys.admission(publishedInput.admissionId)
      client.setQueryData(key, {
        repositories: [{ name: "old", identifier: "old", archived: false }],
      })
      const entered = deferred<void>()
      const release = deferred<void>()
      let canStartQueries = canAdmitSessionChange(controller.getSnapshot())
      const queryOptions = () => ({
        ...createCloneAllListingQueryPolicy(publishedInput.admissionId),
        enabled: canStartQueries,
        ...sessionQueryOptions(
          controller.operations,
          "repo.listNamespace",
          async () => {
            entered.resolve()
            await release.promise
            return {
              repositories: [
                { name: "new", identifier: "new", archived: false },
              ],
            }
          },
        ),
      })
      const listingObserver = new QueryObserver(client, queryOptions())
      const pending = new Set<() => void>()
      const startTransition = () =>
        createCloneAllListingTransition({
          canStartQueries,
          input: publishedInput.admissionId,
          credentials: publishedInput.credentials,
          updatePublishedInput: (update) => {
            controller.operations.change(() => {
              const next = update(publishedInput)
              assert.ok(next)
              publishedInput = next
              listingObserver.setOptions(queryOptions())
            })
          },
          schedule: (callback) => {
            pending.add(callback)
            return () => pending.delete(callback)
          },
        })
      let transition = startTransition()
      t.after(() => transition.dispose())
      t.after(listingObserver.subscribe(() => {}))
      t.after(
        controller.subscribe(() => {
          const next = canAdmitSessionChange(controller.getSnapshot())
          if (next === canStartQueries) return
          canStartQueries = next
          transition.dispose()
          transition = startTransition()
          listingObserver.setOptions(queryOptions())
        }),
      )
      await entered.promise
      const listing = listingObserver.refetch({ cancelRefetch: false })
      const listed = listingObserver.getCurrentResult()
      assert.equal(listed.isFetching, true)
      assert.equal(
        selectCloneAllCanClone({
          inputIsCurrent: true,
          queryIsSuccess: listed.isSuccess,
          queryIsPlaceholderData: listed.isPlaceholderData,
          listResult: listed.data,
          targetDirectory: variables.targetDirectory,
          mutationIsPending: false,
        }),
        true,
      )
      const settling = deferred<void>()
      const settleRelease = deferred<void>()
      const observer = new MutationObserver(client, {
        ...createCloneAllMutationPolicy(),
        mutationFn: executeRegisteredCloneAllCommand,
        onSettled: async () => {
          settling.resolve()
          await settleRelease.promise
        },
      })
      onlineManager.setOnline(online)
      const cloning = executeCloneAllCommand(
        controller.operations,
        client,
        publishedInput,
        variables,
        (value) => observer.mutate(value),
      )
      assert.equal(captured.length, 0)
      assert.equal(canStartQueries, false)
      assert.equal(pending.size, 0)
      release.resolve()
      await tick()
      assert.equal(observer.getCurrentResult().isPaused, false)
      await settling.promise
      assert.deepEqual(captured[0]?.repositories, [
        { name: "new", identifier: "new" },
      ])
      let closed = false
      const closing = controller.requestClose(commitPreparation).then(() => {
        closed = true
      })
      await tick()
      assert.equal(closed, false)
      settleRelease.resolve()
      await Promise.all([listing, cloning, closing])
      assert.equal(observer.getCurrentResult().data, result)
    })
  }

  it("starts a dependent query after a predecessor publishes during a command freeze", async (t) => {
    const { controller, client } = await session()
    const entered = deferred<void>()
    const release = deferred<string>()
    const commandRelease = deferred<void>()
    const order: string[] = []
    const predecessor = client.fetchQuery({
      queryKey: ["predecessor"],
      ...sessionQueryOptions(
        controller.operations,
        "analysis.run",
        async () => {
          entered.resolve()
          return await release.promise
        },
      ),
    })
    await entered.promise
    const dependentOptions = () => ({
      queryKey: ["dependent"],
      enabled:
        canAdmitSessionChange(controller.getSnapshot()) &&
        client.getQueryData(["predecessor"]) !== undefined,
      ...sessionQueryOptions(
        controller.operations,
        "analysis.blame",
        async () => {
          order.push("dependent")
          return "blame"
        },
      ),
    })
    const dependent = new QueryObserver(client, dependentOptions())
    t.after(dependent.subscribe(() => {}))
    const update = () => dependent.setOptions(dependentOptions())
    t.after(controller.subscribe(update))
    t.after(
      client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success")
          update()
      }),
    )
    const command = controller.operations.execute("repo.clone", async () => {
      order.push("command")
      await commandRelease.promise
    })
    release.resolve("analysis")
    await predecessor
    await tick()
    assert.deepEqual(order, ["command"])
    assert.equal(dependent.getCurrentResult().isError, false)
    assert.equal(dependent.getCurrentResult().fetchStatus, "idle")
    commandRelease.resolve()
    await command
    await controller.waitForIdle()
    assert.deepEqual(order, ["command", "dependent"])
    assert.equal(dependent.getCurrentResult().data, "blame")
  })

  it("cancels a query refused after eligibility was read and starts it on release", async (t) => {
    const { controller, client } = await session()
    const commandRelease = deferred<void>()
    let calls = 0
    const options = () => ({
      queryKey: ["admission-race"],
      enabled: canAdmitSessionChange(controller.getSnapshot()),
      ...sessionQueryOptions(
        controller.operations,
        "analysis.run",
        async () => {
          calls++
          return "result"
        },
      ),
    })
    const observer = new QueryObserver(client, options())
    const command = controller.operations.execute("repo.clone", async () => {
      await commandRelease.promise
    })
    // The observer still has the enabled value from before reservation.
    t.after(observer.subscribe(() => {}))
    const refused = client
      .getQueryCache()
      .find({ queryKey: ["admission-race"] })
    assert.ok(refused?.promise)
    await assert.rejects(refused.promise, CancelledError)
    assert.equal(calls, 0)
    assert.equal(observer.getCurrentResult().isError, false)
    assert.equal(observer.getCurrentResult().fetchStatus, "idle")
    assert.equal(observer.getCurrentResult().failureCount, 0)
    observer.setOptions(options())
    t.after(controller.subscribe(() => observer.setOptions(options())))
    commandRelease.resolve()
    await command
    await controller.waitForIdle()
    assert.equal(calls, 1)
    assert.equal(observer.getCurrentResult().data, "result")
  })

  it("preserves cached data when a refetch is refused during a command", async () => {
    const { controller, client } = await session()
    const key = ["cached-admission-race"]
    client.setQueryData(key, "cached")
    const commandRelease = deferred<void>()
    const command = controller.operations.execute("repo.clone", async () => {
      await commandRelease.promise
    })
    const data = await client.fetchQuery({
      queryKey: key,
      staleTime: 0,
      ...sessionQueryOptions(
        controller.operations,
        "analysis.run",
        async () => {
          assert.fail("Refused work must not start")
        },
      ),
    })
    assert.equal(data, "cached")
    assert.equal(client.getQueryState(key)?.status, "success")
    assert.equal(client.getQueryState(key)?.fetchStatus, "idle")
    commandRelease.resolve()
    await command
  })

  it("restarts cancelled background work after release while keeping completed repos cached", async () => {
    const { controller, client } = await session()
    const entered = deferred<void>()
    const hostRelease = deferred<void>()
    const calls: string[] = []
    const prefetch = async (
      run: ReturnType<typeof createCohortPrefetchRun>,
    ) => {
      for (const repo of ["first", "second"]) {
        const key = ["background", repo]
        run.queryKeys.add(key)
        await client.ensureQueryData({
          queryKey: key,
          ...sessionQueryOptions(
            controller.operations,
            "analysis.run",
            async () => {
              calls.push(repo)
              if (repo === "second" && calls.length === 2) {
                entered.resolve()
                await hostRelease.promise
              }
              return repo
            },
          ),
        })
      }
    }
    const run = createCohortPrefetchRun()
    const running = prefetch(run)
    await entered.promise
    let commandStarted = false
    const command = controller.operations.execute("repo.clone", async () => {
      commandStarted = true
    })
    abortCohortPrefetchRun(client, run)
    await assert.rejects(running, CancelledError)
    assert.equal(client.getQueryData(["background", "first"]), "first")
    assert.equal(commandStarted, false)
    hostRelease.resolve()
    await command
    await prefetch(createCohortPrefetchRun())
    await controller.waitForIdle()
    assert.deepEqual(calls, ["first", "second", "second"])
    assert.equal(client.getQueryData(["background", "second"]), "second")
  })

  for (const stage of ["fetch", "follow-up"] as const) {
    for (const successor of ["command", "close"] as const) {
      it(`holds ${successor} behind ${stage} and cache publication`, async () => {
        const { controller, client } = await session()
        const paused = deferred<void>()
        const release = deferred<void>()
        const order: string[] = []
        const pause = async () => {
          paused.resolve()
          await release.promise
        }
        const query = client.fetchQuery({
          queryKey: ["owned"],
          ...sessionQueryOptions(
            controller.operations,
            "analysis.resolveSnapshotHead",
            async (scope) => {
              if (stage === "fetch") await pause()
              return await scope.run("analysis.resolveSnapshotHead", {
                repositoryAbsolutePath: "/repo",
              })
            },
            async (scope, data) => {
              assert.equal(client.getQueryData(["owned"]), data)
              order.push("published")
              if (stage === "follow-up") await pause()
              scope.publish(() => order.push("follow-up"))
            },
          ),
        })
        await paused.promise
        const next =
          successor === "command"
            ? controller.operations.execute("repo.clone", async () => {
                order.push("command")
              })
            : controller.requestClose(commitPreparation).then(() => {
                order.push("close")
              })
        await tick()
        assert.equal(order.includes(successor), false)
        release.resolve()
        await Promise.all([query, next])
        assert.deepEqual(order, ["published", "follow-up", successor])
      })
    }
  }

  it("retains ownership while Query publishes to synchronous subscribers", async () => {
    const { controller, client } = await session()
    const order: string[] = []
    let next: Promise<unknown> | undefined
    client.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return
      assert.notEqual(controller.getSnapshot().transactions.runningTurnId, null)
      order.push("publication")
      next = controller.operations.execute("repo.clone", async () => {
        order.push("command")
      })
    })
    await client.fetchQuery({
      queryKey: ["publication"],
      ...sessionQueryOptions(
        controller.operations,
        "analysis.resolveSnapshotHead",
        async () => "head",
        async (scope) => {
          scope.publish(() => order.push("follow-up"))
        },
      ),
    })
    await next
    assert.deepEqual(order, ["publication", "follow-up", "command"])
  })

  it("ignores manual cache writes while the admitted fetch remains pending", async () => {
    const { controller, client } = await session()
    const host = deferred<string>()
    const entered = deferred<void>()
    const query = client.fetchQuery({
      queryKey: ["manual"],
      ...sessionQueryOptions(
        controller.operations,
        "analysis.resolveSnapshotHead",
        async () => {
          entered.resolve()
          return await host.promise
        },
      ),
    })
    await entered.promise
    client.setQueryData(["manual"], "old")
    let started = false
    const next = controller.operations.execute("repo.clone", async () => {
      started = true
    })
    await tick()
    assert.equal(started, false)
    host.resolve("new")
    await Promise.all([query, next])
    assert.equal(client.getQueryData(["manual"]), "new")
  })

  it("keeps cancelled host work owned after Query has reverted", async () => {
    const { controller, client } = await session()
    const host = deferred<string>()
    const entered = deferred<void>()
    let followed = false
    const query = client
      .fetchQuery({
        queryKey: ["cancel"],
        ...sessionQueryOptions(
          controller.operations,
          "analysis.resolveSnapshotHead",
          async () => {
            entered.resolve()
            return await host.promise
          },
          async () => {
            followed = true
          },
        ),
      })
      .catch(() => undefined)
    await entered.promise
    await client.cancelQueries({ queryKey: ["cancel"] })
    let closed = false
    const close = controller.requestClose(commitPreparation).then(() => {
      closed = true
    })
    await tick()
    assert.equal(closed, false)
    host.resolve("late")
    await Promise.all([query, close])
    assert.equal(followed, false)
    assert.equal(client.getQueryData(["cancel"]), undefined)
  })

  it("publishes fetch errors without leaving a reservation", async () => {
    const { controller, client } = await session()
    await assert.rejects(
      client.fetchQuery({
        queryKey: ["error"],
        ...sessionQueryOptions(
          controller.operations,
          "analysis.run",
          async () => {
            throw new Error("failed")
          },
        ),
      }),
      /failed/,
    )
    await controller.waitForIdle()
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
    assert.equal(client.getQueryState(["error"])?.status, "error")
  })

  for (const stage of ["mutation", "publication", "follow-up"] as const) {
    it(`holds close and refuses a competing command during mutation ${stage}`, async () => {
      const { controller, client } = await session()
      const paused = deferred<void>()
      const release = deferred<void>()
      const order: string[] = []
      const pause = async () => {
        paused.resolve()
        await release.promise
      }
      const mutation = new MutationObserver(client, {
        mutationFn: async (run: () => Promise<string>) => await run(),
        onSettled: async () => {
          if (stage === "publication") await pause()
        },
      })
      const running = controller.operations.execute(
        "repo.bulkClone",
        async (scope) => {
          await mutation.mutate(async () => {
            if (stage === "mutation") await pause()
            return await scope.run("analysis.resolveSnapshotHead", {
              repositoryAbsolutePath: "/repo",
            })
          })
          assert.equal(mutation.getCurrentResult().status, "success")
          order.push("published")
          if (stage === "follow-up") await pause()
          scope.publish(() => order.push("follow-up"))
        },
      )
      await paused.promise
      assert.equal(
        await controller.operations.execute("repo.clone", async () => {
          order.push("wrong")
        }),
        undefined,
      )
      const close = controller.requestClose(commitPreparation).then(() => {
        order.push("close")
      })
      await tick()
      assert.equal(order.includes("close"), false)
      release.resolve()
      await Promise.all([running, close])
      assert.deepEqual(order, ["published", "follow-up", "close"])
    })
  }
})
