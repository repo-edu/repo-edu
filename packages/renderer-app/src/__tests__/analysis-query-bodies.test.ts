import assert from "node:assert/strict"
import { beforeEach, describe, it, type TestContext } from "node:test"
import type { WorkflowClient, WorkflowId } from "@repo-edu/application-contract"
import { QueryObserver, skipToken } from "@tanstack/react-query"
import { AnalysisDiscoveryRunner } from "../analysis/analysis-query-bodies.js"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import {
  analysisQueryKeys,
  buildAnalysisQueryIdentity,
  buildBlameQueryIdentity,
} from "../analysis/analysis-query-keys.js"
import { AnalysisSourceRunner } from "../analysis/analysis-source-runner.js"
import { useCourseStore } from "../stores/course-store.js"
import { makeBaseResult, makeBlameResult } from "./analysis.test-support.js"
import {
  commitPreparation,
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
} from "./session-controller.test-support.js"

const source = ["course", "course"] as const
const surface = { kind: "course", courseId: "course" } as const
const folder = "/repos/one/src"
const discoveryResult = { repos: [{ path: "/repos/one", name: "one" }] }
const analysis = buildAnalysisQueryIdentity({
  source,
  repoPath: "/repos/one",
  snapshotCommitOid: "head",
  config: {},
  rosterContext: undefined,
})
const identity = buildBlameQueryIdentity({
  source,
  repoPath: "/repos/one",
  analysis,
  config: {},
})
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(resetStores)

async function setup(
  t: TestContext,
  host: (id: WorkflowId, signal: AbortSignal) => Promise<unknown>,
) {
  const course = makeCourse("course")
  course.searchFolder = folder
  const controller = startController({
    workflowClient: {
      async run(
        id: WorkflowId,
        _input: unknown,
        options?: { signal?: AbortSignal },
      ) {
        if (id === "settings.loadApp")
          return makeSettings({ activeSurface: surface })
        if (id === "course.load") return course
        if (id === "course.save")
          return { revision: 1, updatedAt: course.updatedAt }
        assert.ok(options?.signal)
        return await host(id, options.signal)
      },
    } as WorkflowClient,
  })
  await controller.waitForIdle()
  const client = createRendererQueryClient()
  t.after(() => {
    controller.dispose()
    client.clear()
  })
  return { controller, client }
}

describe("discovery and blame bodies", () => {
  for (const kind of ["discovery", "blame"] as const) {
    for (const ending of ["key change", "observer removal"] as const) {
      it(`keeps ${kind} through ${ending} and publishes before the next body`, async (t) => {
        const entered = deferred<AbortSignal>()
        const release = deferred<void>()
        const result =
          kind === "discovery" ? discoveryResult : makeBlameResult()
        const { controller, client } = await setup(t, async (_id, signal) => {
          entered.resolve(signal)
          await release.promise
          signal.throwIfAborted()
          return result
        })
        const key =
          kind === "discovery"
            ? analysisQueryKeys.discovery(source, folder, 5)
            : analysisQueryKeys.blame(identity)
        const observer = new QueryObserver(client, {
          queryKey: key,
          enabled: false,
          queryFn: skipToken,
        })
        const unsubscribe = observer.subscribe(() => {})
        t.after(unsubscribe)
        const running =
          kind === "discovery"
            ? new AnalysisDiscoveryRunner(controller.operations, client).run(
                source,
                surface,
                { folder, depth: 5 },
              )
            : new AnalysisSourceRunner(controller.operations, client, {
                source,
                config: {},
                rosterContext: undefined,
                kind: "course",
                repoParallelism: 1,
              }).fetchBlame(identity, {
                repositoryAbsolutePath: "/repos/one",
                config: {},
                personDbBaseline: makeBaseResult().personDbBaseline,
                files: ["a.ts"],
                snapshotCommitOid: "head",
              })
        const signal = await entered.promise
        if (ending === "key change")
          observer.setOptions({
            queryKey:
              kind === "discovery"
                ? analysisQueryKeys.discovery(source, "/another", 5)
                : analysisQueryKeys.blame({
                    ...identity,
                    repoPath: "/another",
                  }),
            enabled: false,
            queryFn: skipToken,
          })
        else unsubscribe()
        assert.equal(signal.aborted, false)
        let followed = false
        const next = controller.operations.execute(
          "analysis.listFolderFiles",
          async () => {
            followed = true
            assert.deepEqual(client.getQueryData(key), result)
            if (kind === "discovery")
              assert.equal(
                useCourseStore.getState().course?.searchFolder,
                "/repos/one",
              )
          },
        )
        await tick()
        assert.equal(followed, false)
        release.resolve()
        await Promise.all([running, next])
        assert.equal(followed, true)
      })
    }
  }

  it("cancels discovery explicitly and retains its host before close", async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    const { controller, client } = await setup(t, async (_id, signal) => {
      entered.resolve(signal)
      await release.promise
      return discoveryResult
    })
    const runner = new AnalysisDiscoveryRunner(controller.operations, client)
    const running = runner
      .run(source, surface, { folder, depth: 5 })
      .catch(() => {})
    const signal = await entered.promise
    runner.cancel()
    assert.equal(signal.aborted, true)
    let closed = false
    const closing = controller.requestClose(commitPreparation).then(() => {
      closed = true
    })
    await tick()
    assert.equal(closed, false)
    release.resolve()
    await Promise.all([running, closing])
    assert.equal(useCourseStore.getState().course?.searchFolder, folder)
    assert.equal(
      client.getQueryData(analysisQueryKeys.discovery(source, folder, 5)),
      undefined,
    )
  })
})
