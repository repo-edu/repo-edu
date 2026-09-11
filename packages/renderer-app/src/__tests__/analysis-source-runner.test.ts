import assert from "node:assert/strict"
import { beforeEach, describe, it, type TestContext } from "node:test"
import type { WorkflowId } from "@repo-edu/application-contract"
import { QueryObserver } from "@tanstack/react-query"
import {
  clearAnalysisQueries,
  createRendererQueryClient,
} from "../analysis/analysis-query-client.js"
import {
  analysisQueryKeys,
  buildAnalysisQueryIdentity,
} from "../analysis/analysis-query-keys.js"
import { AnalysisSourceRunner } from "../analysis/analysis-source-runner.js"
import { makeBaseResult } from "./analysis.test-support.js"
import {
  commitPreparation,
  deferred,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

const source = ["folder", "/repos"] as const
const repos = ["/repos/first", "/repos/second", "/repos/third"]
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
const resultKey = (repoPath: string) =>
  analysisQueryKeys.result(
    buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid: "head",
      config: {},
      rosterContext: undefined,
    }),
  )

beforeEach(resetStores)

async function setup(
  t: TestContext,
  host: (id: WorkflowId, repoPath: string) => Promise<unknown>,
  repoParallelism = 2,
) {
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "settings.loadApp") return makeSettings()
      return await host(
        id,
        (input as { repositoryAbsolutePath: string }).repositoryAbsolutePath,
      )
    }),
  })
  const client = createRendererQueryClient()
  t.after(() => {
    controller.dispose()
    client.clear()
  })
  await controller.waitForIdle()
  const runner = new AnalysisSourceRunner(controller.operations, client, {
    source,
    config: {},
    rosterContext: undefined,
    kind: "folder",
    repoParallelism,
  })
  return { controller, client, runner }
}

describe("source analysis ownership", () => {
  it("starts the selected repository first and honours the parallel bound", {
    timeout: 2000,
  }, async (t) => {
    const entered = deferred<void>()
    const release = deferred<void>()
    const calls: string[] = []
    const result = makeBaseResult()
    const { runner, client, controller } = await setup(t, async (id, path) => {
      if (id === "analysis.resolveSnapshotHead") return "head"
      calls.push(path)
      if (calls.length === 2) entered.resolve()
      await release.promise
      return result
    })
    const running = runner.run(repos, repos[1])
    await entered.promise
    assert.deepEqual(calls, [repos[1], repos[0]])
    let closed = false
    const closing = controller.requestClose(commitPreparation).then(() => {
      closed = true
    })
    await tick()
    assert.equal(closed, false)
    release.resolve()
    await Promise.all([running, closing])
    assert.deepEqual(calls, [repos[1], repos[0], repos[2]])
    for (const path of repos)
      assert.deepEqual(client.getQueryData(resultKey(path)), result)
  })

  it("allows selection during a pass without blocking the next session body", {
    timeout: 2000,
  }, async (t) => {
    const entered = deferred<void>()
    const release = deferred<void>()
    const result = makeBaseResult()
    const calls: string[] = []
    const { runner, client, controller } = await setup(
      t,
      async (id, path) => {
        if (id === "analysis.resolveSnapshotHead") return "head"
        calls.push(path)
        if (path === repos[0]) {
          entered.resolve()
          await release.promise
        }
        return result
      },
      1,
    )
    const running = runner.run(repos, repos[0])
    await entered.promise
    const selected = new QueryObserver(client, {
      queryKey: resultKey(repos[1]),
      enabled: false,
    })
    t.after(selected.subscribe(() => {}))
    const selection = runner.run(repos, repos[1])
    let commandStarted = false
    const command = controller.operations.execute("repo.clone", async () => {
      commandStarted = true
      assert.deepEqual(selected.getCurrentResult().data, result)
    })
    await tick()
    assert.equal(commandStarted, false)
    release.resolve()
    await Promise.all([running, selection, command])
    assert.equal(commandStarted, true)
    assert.deepEqual(calls, repos)
  })

  it("cancels observed work and retains its host before a queued command", {
    timeout: 2000,
  }, async (t) => {
    const entered = deferred<void>()
    const release = deferred<void>()
    const calls: string[] = []
    const { runner, client, controller } = await setup(
      t,
      async (id, path) => {
        if (id === "analysis.resolveSnapshotHead") return "head"
        calls.push(path)
        if (calls.length === 1) {
          entered.resolve()
          await release.promise
        }
        return makeBaseResult()
      },
      1,
    )
    const selected = new QueryObserver(client, {
      queryKey: resultKey(repos[0]),
      enabled: false,
    })
    t.after(selected.subscribe(() => {}))
    const running = runner.run(repos, repos[0])
    await entered.promise
    runner.cancel()
    assert.equal(selected.getCurrentResult().fetchStatus, "idle")
    assert.equal(selected.getCurrentResult().data, undefined)
    let commandStarted = false
    const command = controller.operations.execute("repo.clone", async () => {
      commandStarted = true
    })
    await tick()
    assert.equal(commandStarted, false)
    release.resolve()
    await Promise.all([running, command])
    assert.deepEqual(calls, [repos[0]])
    await runner.run(repos, repos[0])
    assert.deepEqual(calls, [repos[0], ...repos])
    assert.ok(selected.getCurrentResult().data)
  })

  it("clears mounted entries and publishes a rerun without observer refetch", {
    timeout: 2000,
  }, async (t) => {
    let runs = 0
    const { runner, client } = await setup(t, async (id) => {
      if (id === "analysis.resolveSnapshotHead") return "head"
      runs++
      return makeBaseResult()
    })
    const selected = new QueryObserver(client, {
      queryKey: resultKey(repos[0]),
      enabled: false,
    })
    t.after(selected.subscribe(() => {}))
    await runner.run([repos[0]], repos[0])
    assert.ok(selected.getCurrentResult().data)
    runner.cancel()
    clearAnalysisQueries(client, {
      queryKey: analysisQueryKeys.repo(source, repos[0]),
    })
    assert.equal(selected.getCurrentResult().data, undefined)
    await runner.run([repos[0]], repos[0])
    assert.equal(runs, 2)
    assert.ok(selected.getCurrentResult().data)
  })

  it("publishes one repository's error and completes the other repositories", {
    timeout: 2000,
  }, async (t) => {
    const { runner, client, controller } = await setup(t, async (id, path) => {
      if (id === "analysis.resolveSnapshotHead") return "head"
      if (path === repos[0]) throw new Error("Analysis failed")
      return makeBaseResult()
    })
    await assert.rejects(runner.run(repos, repos[0]), /Analysis failed/)
    assert.equal(client.getQueryState(resultKey(repos[0]))?.status, "error")
    assert.equal(client.getQueryState(resultKey(repos[1]))?.status, "success")
    await controller.waitForIdle()
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
  })
})
