import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import type {
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  WorkflowId,
} from "@repo-edu/application-contract"
import { defaultAppCredentials } from "@repo-edu/domain/settings"
import { type QueryClient, QueryObserver } from "@tanstack/react-query"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import {
  type CloneAllCommandState,
  type CloneAllPublishedListingInput,
  cloneAllListingQueryKeys,
  executeCloneAllCommand,
  fetchCloneAllListing,
} from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-repositories.js"
import type { SessionController } from "../session/session-controller.js"
import { scopedSessionQueryOptions } from "../session/session-query.js"
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
      return run ? await run(id, input) : "head"
    }),
  })
  controllers.push(controller)
  await controller.waitForIdle()
  const client = createRendererQueryClient()
  clients.push(client)
  return { controller, client }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe("session Query bodies", () => {
  it("publishes clone failure inside the command body", async () => {
    const failure = new Error("Clone failed")
    const { controller, client } = await session(async () => {
      throw failure
    })
    const publishedInput: CloneAllPublishedListingInput = {
      admissionId: {
        connectionId: "git",
        namespace: "org",
        filter: "",
        includeArchived: false,
        listingGeneration: 1,
      },
      credentials: defaultAppCredentials,
    }
    client.setQueryData(
      cloneAllListingQueryKeys.admission(publishedInput.admissionId),
      {
        repositories: [{ name: "repo", identifier: "repo", archived: false }],
      },
    )
    const variables = {
      listingAdmissionId: publishedInput.admissionId,
      targetDirectory: "/repos",
    }
    const states: CloneAllCommandState[] = []
    await executeCloneAllCommand(
      controller.operations,
      client,
      publishedInput,
      variables,
      (state) => {
        assert.notEqual(
          controller.getSnapshot().transactions.runningTurnId,
          null,
        )
        states.push(state)
      },
    )
    assert.deepEqual(states, [
      { status: "pending", variables },
      { status: "error", variables, error: failure },
    ])
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
  })

  it("keeps clone listing and command results inside their ordered bodies", async () => {
    const listed = deferred<void>()
    const releaseListing = deferred<void>()
    const cloned = deferred<void>()
    const releaseClone = deferred<void>()
    const result: RepositoryCloneResult = {
      repositoriesPlanned: 1,
      repositoriesCloned: 1,
      repositoriesFailed: 0,
      recordedRepositories: {},
      completedAt: "2026-09-11T00:00:00Z",
    }
    const captured: RepositoryBulkCloneInput[] = []
    const { controller, client } = await session(async (id, input) => {
      if (id === "repo.listNamespace") {
        listed.resolve()
        await releaseListing.promise
        return {
          repositories: [{ name: "new", identifier: "new", archived: false }],
        }
      }
      assert.equal(id, "repo.bulkClone")
      captured.push(input as RepositoryBulkCloneInput)
      cloned.resolve()
      await releaseClone.promise
      return result
    })
    const publishedInput: CloneAllPublishedListingInput = {
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
    client.setQueryData(
      cloneAllListingQueryKeys.admission(publishedInput.admissionId),
      {
        repositories: [{ name: "old", identifier: "old", archived: false }],
      },
    )
    const listing = fetchCloneAllListing(
      controller.operations,
      client,
      publishedInput,
    )
    await listed.promise
    const states: CloneAllCommandState[] = []
    const cloning = executeCloneAllCommand(
      controller.operations,
      client,
      publishedInput,
      variables,
      (state) => {
        assert.notEqual(
          controller.getSnapshot().transactions.runningTurnId,
          null,
        )
        states.push(state)
      },
    )
    assert.equal(captured.length, 0)
    releaseListing.resolve()
    await cloned.promise
    assert.deepEqual(captured[0].repositories, [
      { name: "new", identifier: "new" },
    ])
    assert.equal(states.at(-1)?.status, "pending")
    let closed = false
    const closing = controller.requestClose(commitPreparation).then(() => {
      closed = true
    })
    await tick()
    assert.equal(closed, false)
    releaseClone.resolve()
    await Promise.all([listing, cloning, closing])
    assert.deepEqual(states.at(-1), {
      status: "success",
      variables,
      data: result,
    })
  })

  for (const stage of ["fetch", "follow-up"] as const) {
    for (const successor of ["command", "close"] as const) {
      it(`holds ${successor} behind ${stage} after the watcher leaves`, async (t) => {
        const { controller, client } = await session()
        const paused = deferred<void>()
        const release = deferred<void>()
        const order: string[] = []
        const observer = new QueryObserver(client, {
          queryKey: ["owned"],
          enabled: false,
        })
        const unsubscribe = observer.subscribe(() => {})
        t.after(unsubscribe)
        const { signal } = new AbortController()
        const pause = async () => {
          paused.resolve()
          await release.promise
        }
        const query = controller.operations.execute(
          "analysis.resolveSnapshotHead",
          async (scope) => {
            const result = await client.fetchQuery({
              queryKey: ["owned"],
              ...scopedSessionQueryOptions(scope, signal, async () => {
                if (stage === "fetch") await pause()
                return await scope.run(
                  "analysis.resolveSnapshotHead",
                  { repositoryAbsolutePath: "/repo" },
                  { signal },
                )
              }),
            })
            assert.equal(client.getQueryData(["owned"]), result)
            order.push("published")
            await scope.follow(async () => {
              if (stage === "follow-up") await pause()
              scope.publish(() => order.push("follow-up"))
            })
          },
        )
        await paused.promise
        unsubscribe()
        assert.equal(signal.aborted, false)
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

  it("retains cancelled host work until it settles", async () => {
    const { controller, client } = await session()
    const entered = deferred<void>()
    const host = deferred<string>()
    const abort = new AbortController()
    const query = controller.operations
      .execute("analysis.resolveSnapshotHead", async (scope) => {
        await client.fetchQuery({
          queryKey: ["cancel"],
          ...scopedSessionQueryOptions(scope, abort.signal, async () => {
            entered.resolve()
            return await host.promise
          }),
        })
      })
      .catch(() => {})
    await entered.promise
    abort.abort()
    await client.cancelQueries({ queryKey: ["cancel"] })
    let closed = false
    const close = controller.requestClose(commitPreparation).then(() => {
      closed = true
    })
    await tick()
    assert.equal(closed, false)
    host.resolve("late")
    await Promise.all([query, close])
    assert.equal(client.getQueryData(["cancel"]), undefined)
  })

  it("publishes fetch errors and retires its body", async () => {
    const { controller, client } = await session()
    await assert.rejects(
      controller.operations.execute("analysis.run", async (scope) => {
        await client.fetchQuery({
          queryKey: ["error"],
          ...scopedSessionQueryOptions(
            scope,
            new AbortController().signal,
            async () => {
              throw new Error("failed")
            },
          ),
        })
      }),
      /failed/,
    )
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
    assert.equal(client.getQueryState(["error"])?.status, "error")
  })
})
