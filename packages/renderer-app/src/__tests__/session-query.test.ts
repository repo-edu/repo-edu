import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import type {
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  WorkflowId,
} from "@repo-edu/application-contract"
import { defaultAppCredentials } from "@repo-edu/domain/settings"
import { MutationObserver, type QueryClient } from "@tanstack/react-query"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import {
  executeCloneAllCommand,
  executeRegisteredCloneAllCommand,
} from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-command.js"
import { cloneAllListingQueryKeys } from "../components/tabs/groups-assignments/GroupSetGroupsTable/clone-all-repositories.js"
import type { SessionController } from "../session/session-controller.js"
import { sessionQueryOptions } from "../session/session-query.js"
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
  it("captures clone input from the preceding Query publication and retains mutation settlement", async () => {
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
    const publishedInput = {
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
    const listing = client.fetchQuery({
      queryKey: key,
      staleTime: 0,
      ...sessionQueryOptions(
        controller.operations,
        "repo.listNamespace",
        async () => {
          entered.resolve()
          await release.promise
          return {
            repositories: [{ name: "new", identifier: "new", archived: false }],
          }
        },
      ),
    })
    await entered.promise
    const settling = deferred<void>()
    const settleRelease = deferred<void>()
    const observer = new MutationObserver(client, {
      mutationFn: executeRegisteredCloneAllCommand,
      onSettled: async () => {
        settling.resolve()
        await settleRelease.promise
      },
    })
    const cloning = executeCloneAllCommand(
      controller.operations,
      client,
      publishedInput,
      variables,
      (value) => observer.mutate(value),
    )
    assert.equal(captured.length, 0)
    release.resolve()
    await settling.promise
    assert.deepEqual(captured[0]?.repositories, [
      { name: "new", identifier: "new" },
    ])
    let closed = false
    const closing = controller
      .requestClose("close", commitPreparation)
      .then(() => {
        closed = true
      })
    await tick()
    assert.equal(closed, false)
    settleRelease.resolve()
    await Promise.all([listing, cloning, closing])
    assert.equal(observer.getCurrentResult().data, result)
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
            : controller.requestClose("close", commitPreparation).then(() => {
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
    const close = controller
      .requestClose("close", commitPreparation)
      .then(() => {
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
      const close = controller
        .requestClose("close", commitPreparation)
        .then(() => {
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
