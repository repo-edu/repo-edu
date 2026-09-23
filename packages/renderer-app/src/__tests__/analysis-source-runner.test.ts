import assert from "node:assert/strict"
import { beforeEach, describe, it, type TestContext } from "node:test"
import type { WorkflowClient, WorkflowId } from "@repo-edu/application-contract"
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
import {
  makeBaseResult,
  makeBlameResult,
  makeFileStatsWithBreakdown,
} from "./analysis.test-support.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
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
  host: (
    id: WorkflowId,
    repoPath: string,
    signal: AbortSignal | undefined,
  ) => Promise<unknown>,
  repoParallelism = 2,
) {
  const controller = startController({
    workflowClient: {
      async run(
        id: WorkflowId,
        input: unknown,
        options?: { signal?: AbortSignal },
      ) {
        if (id === "settings.loadApp") return makeSettings()
        return await host(
          id,
          (input as { repositoryAbsolutePath: string }).repositoryAbsolutePath,
          options?.signal,
        )
      },
    } as WorkflowClient,
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
    const { runner, client } = await setup(t, async (id, path) => {
      if (id === "analysis.resolveSnapshotHead") return "head"
      calls.push(path)
      if (calls.length === 2) entered.resolve()
      await release.promise
      return result
    })
    const running = runner.run(repos, repos[1], null)
    await entered.promise
    assert.deepEqual(calls, [repos[1], repos[0]])
    release.resolve()
    await running
    assert.deepEqual(calls, [repos[1], repos[0], repos[2]])
    for (const path of repos)
      assert.deepEqual(client.getQueryData(resultKey(path)), result)
  })

  for (const operation of ["analysis.listFolderFiles", "repo.clone"] as const) {
    it(`keeps the pass's turn when ${operation} enters behind it`, {
      timeout: 2000,
    }, async (t) => {
      const entered = deferred<AbortSignal>()
      const release = deferred<void>()
      t.after(() => release.resolve())
      const result = makeBaseResult()
      const calls: string[] = []
      const { runner, client, controller } = await setup(
        t,
        async (id, path, signal) => {
          if (id === "analysis.resolveSnapshotHead") return "head"
          calls.push(path)
          if (path === repos[0]) {
            assert.ok(signal)
            entered.resolve(signal)
            await release.promise
            signal.throwIfAborted()
          }
          return result
        },
        1,
      )
      const running = runner.run(repos, repos[0], null)
      const signal = await entered.promise
      let followed = false
      const next = controller.operations.execute(operation, async () => {
        followed = true
        assert.deepEqual(calls, repos)
        for (const path of repos)
          assert.deepEqual(client.getQueryData(resultKey(path)), result)
      })
      await tick()
      assert.equal(followed, false)
      assert.equal(signal.aborted, false)
      release.resolve()
      await Promise.all([running, next])
      assert.equal(followed, true)
      assert.equal(signal.aborted, false)
      // The completed pass remains cached for later explicit requests.
      await runner.run(repos, repos[0], null)
      assert.deepEqual(calls, repos)
    })
  }

  for (const stage of ["snapshot", "analysis"] as const) {
    it(`keeps the pending ${stage} when its last observer leaves`, {
      timeout: 2000,
    }, async (t) => {
      const entered = deferred<AbortSignal>()
      const release = deferred<void>()
      const result = makeBaseResult()
      const calls: WorkflowId[] = []
      const { runner, client } = await setup(t, async (id, _path, signal) => {
        calls.push(id)
        if (
          id ===
          (stage === "snapshot"
            ? "analysis.resolveSnapshotHead"
            : "analysis.run")
        ) {
          assert.ok(signal)
          entered.resolve(signal)
          await release.promise
          signal.throwIfAborted()
        }
        return id === "analysis.resolveSnapshotHead" ? "head" : result
      })
      const key =
        stage === "snapshot"
          ? analysisQueryKeys.snapshotHead({
              source,
              repoPath: repos[0],
              until: null,
            })
          : resultKey(repos[0])
      const selected = new QueryObserver(client, {
        queryKey: key,
        enabled: false,
      })
      const unsubscribe = selected.subscribe(() => {})
      t.after(unsubscribe)
      const running = runner.run([repos[0]], repos[0], null)
      const signal = await entered.promise
      unsubscribe()
      assert.equal(signal.aborted, false)
      assert.equal(client.getQueryState(key)?.fetchStatus, "fetching")
      release.resolve()
      await running
      assert.deepEqual(calls, ["analysis.resolveSnapshotHead", "analysis.run"])
      assert.deepEqual(client.getQueryData(resultKey(repos[0])), result)
    })
  }

  it("reverts an observed fetch the Cancel control stops", {
    timeout: 2000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    const calls: string[] = []
    const { runner, client, controller } = await setup(
      t,
      async (id, path, signal) => {
        if (id === "analysis.resolveSnapshotHead") return "head"
        calls.push(path)
        if (calls.length === 1) {
          assert.ok(signal)
          entered.resolve(signal)
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
    const running = runner.run(repos, repos[0], null).catch(() => {})
    const signal = await entered.promise
    controller.operations.stop("analysis.run")
    assert.equal(signal.aborted, true)
    assert.equal(selected.getCurrentResult().fetchStatus, "idle")
    assert.equal(selected.getCurrentResult().data, undefined)
    release.resolve()
    await running
    assert.deepEqual(calls, [repos[0]])
    await runner.run(repos, repos[0], null)
    assert.deepEqual(calls, [repos[0], ...repos])
    assert.ok(selected.getCurrentResult().data)
  })

  it("stops line authorship and pending repository work with the pass's one stop handle", {
    timeout: 2000,
  }, async (t) => {
    const releaseAnalysis = deferred<void>()
    const blameEntered = deferred<AbortSignal>()
    const releaseBlame = deferred<void>()
    t.after(() => {
      releaseAnalysis.resolve()
      releaseBlame.resolve()
    })
    const analysed: string[] = []
    const result = {
      ...makeBaseResult(),
      fileStats: makeFileStatsWithBreakdown(),
    }
    const signals: AbortSignal[] = []
    const { runner, controller } = await setup(
      t,
      async (id, path, signal) => {
        if (id === "analysis.resolveSnapshotHead") return "head"
        assert.ok(signal)
        signals.push(signal)
        if (id === "analysis.blame") {
          assert.ok(signal)
          blameEntered.resolve(signal)
          await releaseBlame.promise
          return makeBlameResult()
        }
        assert.equal(id, "analysis.run")
        analysed.push(path)
        if (path !== repos[0]) await releaseAnalysis.promise
        return result
      },
      2,
    )
    const running = runner.run(repos, repos[0], {}).catch(() => {})
    const signal = await blameEntered.promise
    assert.deepEqual(analysed, [repos[0], repos[1]])
    assert.equal(signal.aborted, false)
    assert.ok(signals.every((entry) => entry === signal))
    controller.operations.stop("analysis.run")
    assert.equal(signal.aborted, true)
    let followed = false
    const next = controller.operations.execute("repo.clone", async () => {
      followed = true
    })
    releaseBlame.resolve()
    await tick()
    assert.equal(followed, false)
    releaseAnalysis.resolve()
    await Promise.all([running, next])
    assert.equal(followed, true)
    assert.deepEqual(analysed, [repos[0], repos[1]])
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
    await runner.run([repos[0]], repos[0], null)
    assert.ok(selected.getCurrentResult().data)
    clearAnalysisQueries(client, {
      queryKey: analysisQueryKeys.repo(source, repos[0]),
    })
    assert.equal(selected.getCurrentResult().data, undefined)
    await runner.run([repos[0]], repos[0], null)
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
    await assert.rejects(runner.run(repos, repos[0], null), /Analysis failed/)
    assert.equal(client.getQueryState(resultKey(repos[0]))?.status, "error")
    assert.equal(client.getQueryState(resultKey(repos[1]))?.status, "success")
    await controller.waitForIdle()
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
  })
})
