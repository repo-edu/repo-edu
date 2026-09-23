import assert from "node:assert/strict"
import { describe, it, type TestContext } from "node:test"
import type {
  AnalysisDiscoverReposResult,
  WorkflowClient,
  WorkflowId,
  WorkflowInput,
} from "@repo-edu/application-contract"
import type { PersistedActiveSurface } from "@repo-edu/domain/active-surface"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { TooltipProvider } from "@repo-edu/ui"
import { QueryClientProvider } from "@tanstack/react-query"
import { Window } from "happy-dom"
import React from "react"
import { createRoot } from "react-dom/client"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import {
  AnalysisCoordinatorProvider,
  selectCurrentAnalysisResult,
  selectCurrentBlameResult,
  useAnalysisAuthorView,
  useAnalysisBlameProgress,
  useAnalysisBlameResult,
  useAnalysisBlameStatus,
  useAnalysisDiscovery,
  useAnalysisFileView,
  useAnalysisResult,
  useAnalysisSelection,
} from "../analysis/analysis-query-coordinator.js"
import {
  analysisQueryKeys,
  analysisSourceKeyParts,
  analysisSourceScopeKey,
} from "../analysis/analysis-query-keys.js"
import { AnalysisSidebar } from "../components/tabs/analysis/AnalysisSidebar.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import {
  SessionControllerProvider,
  sessionCancellationControl,
} from "../session/session-controller-context.js"
import type { SessionOperationReservation } from "../session/session-operations.js"
import { analysisSourceKeyFromSurface } from "../session/session-reducer.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useToastStore } from "../stores/toast-store.js"
import {
  makeBaseResult,
  makeBlameResult,
  makeFileStatsWithBreakdown,
} from "./analysis.test-support.js"
import {
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
} from "./session-controller.test-support.js"

const repos = ["/repos/first", "/repos/second"]
const source = ["course", "course"] as const
const repoResults = (repoPath: string) =>
  [...analysisQueryKeys.repo(source, repoPath), "result"] as const
const flushQueries = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))

function useAnalysisTestView() {
  return {
    ...useAnalysisDiscovery(),
    ...useAnalysisSelection(),
    ...useAnalysisResult(),
    ...useAnalysisBlameResult(),
    ...useAnalysisBlameStatus(),
    ...useAnalysisBlameProgress(),
    ...useAnalysisAuthorView(),
    ...useAnalysisFileView(),
  }
}

type AnalysisTestView = ReturnType<typeof useAnalysisTestView>

async function mountCoordinator(
  t: TestContext,
  analyse: (
    signal: AbortSignal,
    input: WorkflowInput<"analysis.run">,
  ) => Promise<unknown>,
  blame?: (
    signal: AbortSignal,
    input: WorkflowInput<"analysis.blame">,
  ) => Promise<unknown>,
  options: {
    discover?: (
      signal: AbortSignal,
      input: WorkflowInput<"analysis.discoverRepos">,
    ) => Promise<AnalysisDiscoverReposResult>
    startDiscovery?: boolean
    requestAnalysis?: boolean
    pickDirectory?: RendererHost["pickDirectory"]
    initialDiscovery?: AnalysisDiscoverReposResult
    sidebar?: boolean
    searchFolder?: string | null
    activeSurface?: PersistedActiveSurface
    strictEffects?: boolean
    repoParallelism?: number
  } = {},
) {
  const { discover, repoParallelism = 1 } = options
  resetStores()
  useAnalysisStore.getState().reset()
  const window = new Window()
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const descriptors = Object.getOwnPropertyDescriptors(globalThis)
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  }
  const course = makeCourse("course")
  course.searchFolder =
    options.searchFolder === undefined ? "/repos" : options.searchFolder
  const activeSurface = options.activeSurface ?? {
    kind: "course",
    courseId: course.id,
  }
  const mountedSource = analysisSourceKeyParts(
    analysisSourceKeyFromSurface(activeSurface),
  )
  course.analysisInputs = { blameSkip: blame === undefined }
  course.roster.students = [
    {
      id: "student",
      name: "Ada",
      email: "ada@example.edu",
      studentNumber: null,
      gitUsername: null,
      gitUsernameStatus: "unknown",
      status: "active",
      lmsStatus: null,
      lmsUserId: null,
      enrollmentType: "student",
      enrollmentDisplay: null,
      department: null,
      institution: null,
      source: "local",
    },
  ]
  course.roster.groups = [
    {
      id: "group",
      name: "Old",
      memberIds: [],
      origin: "local",
      lmsGroupId: null,
    },
  ]
  const controller = startController({
    workflowClient: {
      async run(
        id: WorkflowId,
        _input: unknown,
        options?: { signal?: AbortSignal },
      ) {
        if (id === "settings.loadApp")
          return makeSettings({
            activeSurface,
            analysisConcurrency: {
              repoParallelism,
              filesPerRepo: 1,
            },
          })
        if (id === "settings.savePreferences") return
        if (id === "course.load") return course
        if (id === "analysis.resolveSnapshotHead") return "head"
        if (id === "analysis.discoverRepos") {
          assert.ok(options?.signal)
          assert.ok(discover)
          return await discover(
            options.signal,
            _input as WorkflowInput<"analysis.discoverRepos">,
          )
        }
        if (id === "analysis.run") {
          assert.ok(options?.signal)
          return await analyse(
            options.signal,
            _input as WorkflowInput<"analysis.run">,
          )
        }
        if (id === "analysis.blame") {
          assert.ok(options?.signal)
          assert.ok(blame)
          return await blame(
            options.signal,
            _input as WorkflowInput<"analysis.blame">,
          )
        }
        if (id === "course.save")
          return { revision: 1, updatedAt: course.updatedAt }
        assert.fail(`Unexpected workflow: ${id}`)
      },
    } as WorkflowClient,
  })
  await controller.waitForIdle()
  assert.equal(controller.getSnapshot().bootstrap.status, "ready")
  assert.equal(controller.getSnapshot().lifecycle.kind, "live")
  const queryClient = createRendererQueryClient()
  if (!discover) {
    queryClient.setQueryData(
      analysisQueryKeys.discovery(mountedSource, "/repos", 5),
      options.initialDiscovery ?? {
        repos: repos.map((path) => ({ path, name: path })),
      },
    )
  }
  if (course.searchFolder !== null) {
    useAnalysisStore
      .getState()
      .setPendingRepoDiscoveryRequest(analysisSourceScopeKey(mountedSource), {
        folder: course.searchFolder,
        depth: 5,
      })
  }
  let value: AnalysisTestView | undefined
  function ReadAnalysis() {
    value = useAnalysisTestView()
    return null
  }
  // Happy DOM implements the DOM the renderer expects, so the container is
  // typed as the DOM element it stands in for.
  const container = window.document.createElement(
    "div",
  ) as unknown as HTMLElement
  const root = createRoot(container)
  t.after(async () => {
    await React.act(async () => root.unmount())
    controller.dispose()
    queryClient.clear()
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  // A search starts only from the click, so a test that supplies a search
  // presses Start once the tab is up.
  await React.act(async () => {
    const Mode = options.strictEffects ? React.StrictMode : React.Fragment
    root.render(
      <Mode>
        <SessionControllerProvider controller={controller}>
          <WorkflowClientProvider value={controller.operations}>
            <QueryClientProvider client={queryClient}>
              <AnalysisCoordinatorProvider>
                <ReadAnalysis />
                {(options.sidebar ?? blame !== undefined) && (
                  <RendererHostProvider
                    value={
                      { pickDirectory: options.pickDirectory } as RendererHost
                    }
                  >
                    <TooltipProvider>
                      <AnalysisSidebar />
                    </TooltipProvider>
                  </RendererHostProvider>
                )}
              </AnalysisCoordinatorProvider>
            </QueryClientProvider>
          </WorkflowClientProvider>
        </SessionControllerProvider>
      </Mode>,
    )
    await flushQueries()
  })
  if (
    discover &&
    course.searchFolder !== null &&
    options.startDiscovery !== false
  ) {
    const folder = course.searchFolder
    await React.act(async () => {
      value?.startAnalysis(folder)
      await flushQueries()
    })
  } else if (!discover && options.requestAnalysis !== false) {
    await React.act(async () => {
      value?.runAnalysis()
      await flushQueries()
    })
  }
  return {
    controller,
    queryClient,
    container,
    read: () => {
      assert.ok(value)
      return value
    },
  }
}

describe("analysis runner lifetime in React", () => {
  it("starts no work on mount or settings edits and displays matching cached results", {
    timeout: 3000,
  }, async (t) => {
    const inputs: WorkflowInput<"analysis.run">[] = []
    const { controller, read } = await mountCoordinator(
      t,
      async (_signal, input) => {
        inputs.push(input)
        return makeBaseResult()
      },
      undefined,
      { requestAnalysis: false, strictEffects: true },
    )
    assert.equal(inputs.length, 0)
    await React.act(async () => {
      read().selectRepository(repos[0])
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(inputs.length, 1)
    assert.deepEqual(read().result, makeBaseResult())
    await React.act(async () => {
      controller.setAnalysisInputs("course", { whitespace: true })
      await flushQueries()
    })
    assert.equal(read().result, null)
    await React.act(async () => {
      useAnalysisStore.getState().setBlameConfig({ copyMove: 4 })
      await flushQueries()
    })
    await React.act(async () => {
      controller.setDefaultExtensions(["rs"])
      await flushQueries()
    })
    assert.equal(inputs.length, 1)
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
    await React.act(async () => {
      read().selectRepository(repos[0])
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(inputs.length, 2)
    assert.equal(inputs[1].repositoryAbsolutePath, repos[0])
    assert.deepEqual(inputs[1].config.extensions, ["rs"])
    assert.equal(inputs[1].config.whitespace, true)
    await React.act(async () => {
      controller.setAnalysisInputs("course", { whitespace: undefined })
      controller.setDefaultExtensions(inputs[0].config.extensions ?? [])
      await flushQueries()
    })
    assert.equal(inputs.length, 2)
    assert.deepEqual(read().result, makeBaseResult())
  })

  for (const kind of ["course", "folder"] as const) {
    it(`returns to a ${kind} with unfinished analysis without starting a pass`, {
      timeout: 3000,
    }, async (t) => {
      const activeSurface: PersistedActiveSurface =
        kind === "course"
          ? { kind, courseId: "course" }
          : { kind, path: "/repos" }
      const analysed: string[] = []
      const { controller, read } = await mountCoordinator(
        t,
        async (_signal, input) => {
          analysed.push(input.repositoryAbsolutePath!)
          return makeBaseResult()
        },
        undefined,
        { activeSurface, requestAnalysis: false },
      )
      await React.act(async () => {
        read().selectRepository(repos[0])
        await controller.waitForIdle()
        await flushQueries()
      })
      assert.deepEqual(analysed, [repos[0]])
      assert.deepEqual(read().result, makeBaseResult())
      await React.act(async () => {
        await controller.activateSurface({ kind: "home" })
        await flushQueries()
      })
      await React.act(async () => {
        await controller.activateSurface(activeSurface)
        await flushQueries()
      })
      assert.deepEqual(analysed, [repos[0]])
      assert.deepEqual(read().result, makeBaseResult())
      await React.act(async () => {
        useAnalysisStore
          .getState()
          .setSelectedRepoPath(
            analysisSourceScopeKey(
              analysisSourceKeyParts(
                analysisSourceKeyFromSurface(activeSurface),
              ),
            ),
            repos[1],
          )
        await flushQueries()
      })
      assert.equal(read().result, null)
      assert.deepEqual(analysed, [repos[0]])
    })
  }

  it("keeps the completed search visible after opening the enclosing repository", {
    timeout: 3000,
  }, async (t) => {
    const folder = "/repos/first/src"
    const discoveredRepos = [{ name: "first", path: "/repos/first" }]
    let searchCalls = 0
    const { controller, read } = await mountCoordinator(
      t,
      async () => makeBaseResult(),
      undefined,
      {
        activeSurface: { kind: "folder", path: folder },
        searchFolder: folder,
        discover: async () => {
          searchCalls++
          return { repos: discoveredRepos }
        },
      },
    )
    await React.act(async () => {
      await flushQueries()
      await controller.waitForIdle()
      await flushQueries()
    })

    assert.equal(searchCalls, 1)
    assert.equal(read().discoveryError, null)
    assert.deepEqual(
      controller.getSnapshot().settings.preferences.activeSurface,
      {
        kind: "folder",
        path: "/repos/first",
      },
    )
    assert.equal(read().discoveryCompleted, true)
    assert.deepEqual(read().discoveredRepos, discoveredRepos)
    assert.equal(read().selectedRepoPath, "/repos/first")
    assert.deepEqual(read().result, makeBaseResult())
  })

  it("runs an explicit request after React repeats effect setup and cleanup", {
    timeout: 3000,
  }, async (t) => {
    const { controller, read } = await mountCoordinator(
      t,
      async () => makeBaseResult(),
      undefined,
      { strictEffects: true },
    )
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(read().analysisStatus, "idle")
    assert.deepEqual(read().result, makeBaseResult())
  })

  it("finishes line authorship without stopping the pending repositories", {
    timeout: 3000,
  }, async (t) => {
    const blameEntered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    const paths = [...repos, "/repos/third"]
    const analysed: string[] = []
    const signals: AbortSignal[] = []
    const result = {
      ...makeBaseResult(),
      fileStats: makeFileStatsWithBreakdown(),
    }
    const { controller, queryClient, read } = await mountCoordinator(
      t,
      async (signal, input) => {
        const path = input.repositoryAbsolutePath
        assert.ok(path)
        analysed.push(path)
        signals.push(signal)
        if (path !== paths[0]) await release.promise
        return result
      },
      async (signal, input) => {
        assert.equal(input.repositoryAbsolutePath, paths[0])
        assert.deepEqual(input.personDbBaseline, result.personDbBaseline)
        assert.deepEqual(
          input.files,
          result.fileStats.map((file) => file.path).sort(),
        )
        assert.equal(input.snapshotCommitOid, "head")
        blameEntered.resolve(signal)
        return makeBlameResult()
      },
      {
        repoParallelism: 2,
        sidebar: false,
        initialDiscovery: {
          repos: paths.map((path) => ({ path, name: path })),
        },
      },
    )
    const signal = await blameEntered.promise
    await React.act(flushQueries)
    assert.equal(signal.aborted, false)
    assert.ok(signals.every((entry) => entry === signal))
    assert.deepEqual(analysed, paths)
    assert.deepEqual(read().blameResult, makeBlameResult())
    await React.act(async () => {
      release.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    for (const path of paths) {
      assert.deepEqual(
        queryClient.getQueryCache().findAll({ queryKey: repoResults(path) })[0]
          ?.state.data,
        result,
      )
    }
  })

  for (const ending of ["completion", "cancel"] as const) {
    it(`runs a queued command after analysis ${ending} without restarting the pass`, {
      timeout: 3000,
    }, async (t) => {
      const entered = deferred<AbortSignal>()
      const release = deferred<void>()
      t.after(() => release.resolve())
      let calls = 0
      const { controller, read } = await mountCoordinator(t, async (signal) => {
        calls++
        entered.resolve(signal)
        await release.promise
        return makeBaseResult()
      })
      const signal = await entered.promise
      if (ending === "cancel") {
        await React.act(async () => {
          read().cancelAnalysis()
          await flushQueries()
        })
      }
      let command: Promise<unknown> | undefined
      await React.act(async () => {
        command = controller.operations.execute("groupSet.export", async () => {
          assert.equal(calls, ending === "cancel" ? 1 : repos.length)
        })
        await flushQueries()
      })
      assert.equal(signal.aborted, ending === "cancel")
      assert.equal(calls, 1)
      await React.act(async () => {
        release.resolve()
        await command
        await flushQueries()
      })
      // Command retirement and unrelated edits do not start another pass.
      await React.act(async () => {
        await controller.waitForIdle()
        controller.setDisplayName("course", "Renamed")
        await flushQueries()
      })
      assert.equal(calls, ending === "cancel" ? 1 : repos.length)
      assert.deepEqual(
        read().result,
        ending === "cancel" ? null : makeBaseResult(),
      )
      await React.act(async () => {
        read().runAnalysis()
        await controller.waitForIdle()
        await flushQueries()
      })
      assert.equal(calls, repos.length + 1)
      assert.deepEqual(read().result, makeBaseResult())
    })
  }

  it("keeps a cancelled search stopped after commands and completes an explicit new search", {
    timeout: 3000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    let calls = 0
    const { controller, read } = await mountCoordinator(
      t,
      async () => assert.fail("A cancelled search must not start analysis"),
      undefined,
      {
        discover: async (signal) => {
          calls++
          entered.resolve(signal)
          await release.promise
          return { repos: [] }
        },
      },
    )
    const signal = await entered.promise
    await React.act(async () => {
      read().cancelDiscovery()
      await flushQueries()
    })
    assert.equal(signal.aborted, true)
    let command: Promise<unknown> | undefined
    await React.act(async () => {
      command = controller.operations.execute("groupSet.export", async () => {})
      await flushQueries()
    })
    await React.act(async () => {
      release.resolve()
      await command
      await flushQueries()
    })
    assert.equal(calls, 1)
    assert.equal(read().discoveryCompleted, false)
    await React.act(async () => {
      read().runRepoDiscovery("/repos")
      await flushQueries()
    })
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(calls, 2)
    assert.equal(read().discoveryCompleted, true)
    assert.deepEqual(read().discoveredRepos, [])
  })

  for (const outcome of ["success", "error"] as const) {
    it(`does not reserve blame again after unrelated course edits with a ${outcome} result`, {
      timeout: 3000,
    }, async (t) => {
      let blameCalls = 0
      const { controller, read } = await mountCoordinator(
        t,
        async () => ({
          ...makeBaseResult(),
          fileStats: makeFileStatsWithBreakdown(),
        }),
        async () => {
          blameCalls++
          if (outcome === "error") throw new Error("Blame failed")
          return makeBlameResult()
        },
        { sidebar: false },
      )
      // The body includes line authorship, so its retirement settles both results.
      await React.act(async () => {
        await flushQueries()
        await controller.waitForIdle()
        await flushQueries()
      })
      assert.equal(blameCalls, 1)
      assert.equal(read().blameStatus, outcome === "error" ? "error" : "idle")
      const execute = t.mock.method(controller.operations, "execute")
      const identity = read().analysisIdentity
      await React.act(async () => {
        controller.setDisplayName("course", "Renamed")
        controller.updateGroup("course", "group", { name: "Renamed group" })
        controller.updateMember("course", "student", { studentNumber: "123" })
        await flushQueries()
      })
      assert.equal(read().analysisIdentity, identity)
      assert.equal(blameCalls, 1)
      assert.equal(
        execute.mock.calls.filter(
          ({ arguments: args }) => args[0] === "analysis.blame",
        ).length,
        0,
      )
    })
  }

  it("keeps a pending analysis through course and group edits", {
    timeout: 3000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    let calls = 0
    const result = makeBaseResult()
    const { controller, read } = await mountCoordinator(t, async (signal) => {
      calls++
      entered.resolve(signal)
      await release.promise
      return result
    })
    const signal = await entered.promise
    await React.act(async () => {
      controller.setDisplayName("course", "Renamed")
      controller.updateGroup("course", "group", { name: "Renamed group" })
      controller.updateMember("course", "student", { studentNumber: "123" })
      await flushQueries()
    })
    assert.equal(signal.aborted, false)
    assert.equal(read().analysisStatus, "running")
    await React.act(async () => {
      release.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(calls, repos.length)
    assert.deepEqual(read().result, result)
  })

  it("leaves new analysis inputs idle until an explicit request", {
    timeout: 3000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    const { controller, read } = await mountCoordinator(t, async (signal) => {
      entered.resolve(signal)
      await release.promise
      return makeBaseResult()
    })
    const signal = await entered.promise
    await React.act(async () => {
      controller.updateMember("course", "student", { email: "new@example.edu" })
      await flushQueries()
    })
    assert.equal(signal.aborted, false)
    await React.act(async () => {
      release.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(read().analysisIdentity?.roster[0]?.email, "new@example.edu")
    assert.equal(read().result, null)
    await React.act(async () => {
      read().selectRepository(repos[0])
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.ok(read().result)
  })

  it("waits for a repository request after cancelling a repeated search", {
    timeout: 3000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    const result = makeBaseResult()
    const discoveredRepos = repos.map((path) => ({ path, name: path }))
    let searches = 0
    const { controller, read } = await mountCoordinator(
      t,
      async () => result,
      undefined,
      {
        discover: async (signal) => {
          searches++
          if (searches > 1) {
            entered.resolve(signal)
            await release.promise
          }
          return { repos: discoveredRepos }
        },
      },
    )
    // Let cache notifications reach the disabled observers.
    async function waitForResult() {
      while (read().result === null) {
        t.signal.throwIfAborted()
        await React.act(flushQueries)
      }
      assert.deepEqual(read().result, result)
    }
    await waitForResult()
    await React.act(async () => {
      read().runRepoDiscovery("/repos")
      await flushQueries()
    })
    const signal = await entered.promise
    await React.act(flushQueries)
    assert.equal(read().discoveryStatus, "loading")
    assert.equal(read().result, null)
    await React.act(async () => {
      read().cancelDiscovery()
      await flushQueries()
    })
    assert.equal(signal.aborted, true)
    await React.act(async () => {
      release.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(searches, 2)
    assert.equal(read().discoveryStatus, "idle")
    assert.deepEqual(read().discoveredRepos, discoveredRepos)
    assert.equal(read().result, null)
    await React.act(async () => {
      read().selectRepository(repos[0])
      await controller.waitForIdle()
      await flushQueries()
    })
    await waitForResult()
  })

  for (const start of ["Start", "Run Analysis"] as const) {
    it(`refuses selection during ${start} and analyses only the selected repository after Cancel`, {
      timeout: 3000,
    }, async (t) => {
      const entered = deferred<AbortSignal>()
      const release = deferred<void>()
      t.after(() => release.resolve())
      const result = {
        ...makeBaseResult(),
        fileStats: makeFileStatsWithBreakdown(),
      }
      const paths = [...repos, "/repos/third"]
      const order: string[] = []
      const { controller, queryClient, read } = await mountCoordinator(
        t,
        async (signal, input) => {
          order.push(`analysis:${input.repositoryAbsolutePath}`)
          if (input.repositoryAbsolutePath === paths[0]) {
            entered.resolve(signal)
            await release.promise
          }
          return result
        },
        async (_signal, input) => {
          order.push(`blame:${input.repositoryAbsolutePath}`)
          return makeBlameResult()
        },
        {
          sidebar: false,
          discover:
            start === "Start"
              ? async () => ({
                  repos: paths.map((path) => ({ path, name: path })),
                })
              : undefined,
          initialDiscovery: {
            repos: paths.map((path) => ({ path, name: path })),
          },
        },
      )
      const signal = await entered.promise
      await React.act(async () => {
        read().selectRepository(paths[2])
        await flushQueries()
      })
      assert.equal(signal.aborted, false)
      assert.equal(read().selectedRepoPath, paths[0])
      assert.deepEqual(order, [`analysis:${paths[0]}`])
      await React.act(async () => {
        read().cancelAnalysis()
        release.resolve()
        await controller.waitForIdle()
        await flushQueries()
      })
      assert.equal(signal.aborted, true)
      await React.act(async () => {
        read().selectRepository(paths[2])
        await controller.waitForIdle()
        await flushQueries()
      })
      assert.deepEqual(order, [
        `analysis:${paths[0]}`,
        `analysis:${paths[2]}`,
        `blame:${paths[2]}`,
      ])
      assert.equal(
        queryClient.getQueryCache().findAll({ queryKey: repoResults(paths[1]) })
          .length,
        0,
      )
      assert.deepEqual(read().blameResult, makeBlameResult())
    })
  }

  it("waits for the selected repository request after line-authorship edits and reuses cached analysis", {
    timeout: 3000,
  }, async (t) => {
    let analysisCalls = 0
    const blameConfigs: WorkflowInput<"analysis.blame">["config"][] = []
    const { controller, read } = await mountCoordinator(
      t,
      async () => {
        analysisCalls++
        return { ...makeBaseResult(), fileStats: makeFileStatsWithBreakdown() }
      },
      async (_signal, input) => {
        blameConfigs.push(input.config)
        return makeBlameResult()
      },
      { sidebar: false },
    )
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    await React.act(async () => {
      useAnalysisStore.getState().setBlameConfig({ copyMove: 3 })
      await flushQueries()
    })
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.deepEqual(
      blameConfigs.map((config) => config.copyMove),
      [1],
    )
    assert.equal(read().blameResult, null)
    await React.act(async () => {
      read().selectRepository(repos[0])
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.deepEqual(
      blameConfigs.map((config) => config.copyMove),
      [1, 3],
    )
    await React.act(async () => {
      controller.setAnalysisInputs("course", { blameSkip: true })
      await flushQueries()
    })
    assert.equal(read().blameResult, null)
    await React.act(async () => {
      controller.setAnalysisInputs("course", { blameSkip: false })
      await flushQueries()
    })
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(analysisCalls, repos.length)
    assert.equal(blameConfigs.length, 2)
    assert.deepEqual(read().blameResult, makeBlameResult())
  })
})

describe("analysis sidebar admission", () => {
  // Happy DOM's :disabled selector checks only the element's own attribute.
  const isDisabled = (control: Element) =>
    control.matches(":disabled") ||
    control.closest("fieldset[disabled]") !== null

  it("chains Start's full pass before search retirement with separate Cancel targets", {
    timeout: 3000,
  }, async (t) => {
    const searchEntered = deferred<AbortSignal>()
    const analysisEntered = deferred<AbortSignal>()
    const releaseSearch = deferred<void>()
    const releaseAnalysis = deferred<void>()
    t.after(() => {
      releaseSearch.resolve()
      releaseAnalysis.resolve()
    })
    const analysed: string[] = []
    const { controller, container, read } = await mountCoordinator(
      t,
      async (signal, input) => {
        analysed.push(input.repositoryAbsolutePath!)
        analysisEntered.resolve(signal)
        await releaseAnalysis.promise
        return makeBaseResult()
      },
      undefined,
      {
        sidebar: true,
        startDiscovery: false,
        discover: async (signal) => {
          searchEntered.resolve(signal)
          await releaseSearch.promise
          return { repos: repos.map((path) => ({ path, name: path })) }
        },
      },
    )
    let chained = false
    const unsubscribe = controller.subscribe(() => {
      const { admitted, runningTurnId } = controller.getSnapshot().transactions
      const running =
        runningTurnId === null ? null : admitted.get(runningTurnId)
      if (
        running?.kind !== "operation" ||
        running.operation !== "analysis.discoverRepos"
      )
        return
      chained ||= [...admitted.values()].some(
        (entry) =>
          entry.kind === "operation" && entry.operation === "analysis.run",
      )
    })
    t.after(unsubscribe)
    const start = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Start",
    )
    assert.ok(start)
    await React.act(async () => {
      start.click()
      await flushQueries()
    })
    const searchSignal = await searchEntered.promise
    assert.ok(
      container.querySelector(
        `[${sessionCancellationControl}="analysis.discoverRepos"]`,
      ),
    )
    assert.equal(
      container.querySelector(`[${sessionCancellationControl}="analysis.run"]`),
      null,
    )
    await React.act(async () => {
      releaseSearch.resolve()
      await flushQueries()
    })
    const analysisSignal = await analysisEntered.promise
    assert.equal(chained, true)
    assert.notEqual(searchSignal, analysisSignal)
    assert.equal(searchSignal.aborted, false)
    const cancel = container.querySelector(
      `[${sessionCancellationControl}="analysis.run"]`,
    )
    assert.ok(cancel)
    assert.equal(isDisabled(cancel), false)
    assert.equal(
      container.querySelector(
        `[${sessionCancellationControl}="analysis.discoverRepos"]`,
      ),
      null,
    )
    await React.act(async () => {
      read().cancelDiscovery()
      releaseAnalysis.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(analysisSignal.aborted, false)
    assert.deepEqual(analysed, repos)
  })

  it("runs the full list from Run and Re-run Analysis", {
    timeout: 3000,
  }, async (t) => {
    const analysed: string[] = []
    const { controller, container } = await mountCoordinator(
      t,
      async (_signal, input) => {
        analysed.push(input.repositoryAbsolutePath!)
        if (analysed.length === 2) throw new Error("Analysis failed")
        return makeBaseResult()
      },
      undefined,
      { sidebar: true, requestAnalysis: false },
    )
    assert.equal(analysed.length, 0)
    for (const label of ["Run Analysis", "Re-run Analysis"]) {
      const button = Array.from(container.querySelectorAll("button")).find(
        (entry) => entry.textContent?.trim() === label,
      )
      assert.ok(button, label)
      await React.act(async () => {
        button.click()
        await controller.waitForIdle()
        await flushQueries()
      })
    }
    assert.deepEqual(analysed, [...repos, ...repos])
  })

  for (const singleRepo of [false, true]) {
    it(`requests the selected repository after a settings edit with ${singleRepo ? "a single repository" : "a repository list"}`, {
      timeout: 3000,
    }, async (t) => {
      const release = deferred<void>()
      t.after(() => release.resolve())
      const analysed: WorkflowInput<"analysis.run">[] = []
      const paths = singleRepo ? ["/repos"] : repos
      const { controller, container, read } = await mountCoordinator(
        t,
        async (_signal, input) => {
          analysed.push(input)
          await release.promise
          return makeBaseResult()
        },
        undefined,
        {
          sidebar: true,
          requestAnalysis: false,
          initialDiscovery: {
            repos: paths.map((path) => ({
              path,
              name: path.split("/").at(-1)!,
            })),
          },
        },
      )
      assert.equal(read().selectedRepoPath, paths[0])
      await React.act(async () => {
        controller.setAnalysisInputs("course", { extensions: ["rs"] })
        await flushQueries()
      })
      assert.equal(analysed.length, 0)
      const row = container.querySelector<HTMLButtonElement>(
        `button[title="${singleRepo ? "repos" : "first"}"]`,
      )
      assert.ok(row)
      await React.act(async () => {
        row.click()
        await flushQueries()
      })
      assert.equal(analysed.length, 1)
      assert.equal(analysed[0].repositoryAbsolutePath, paths[0])
      assert.deepEqual(analysed[0].config.extensions, ["rs"])
      const cancel = container.querySelector<HTMLButtonElement>(
        `[${sessionCancellationControl}="analysis.run"]`,
      )
      assert.ok(cancel)
      assert.equal(isDisabled(cancel), false)
      await React.act(async () => {
        cancel.click()
        release.resolve()
        await controller.waitForIdle()
        await flushQueries()
      })
      assert.equal(analysed.length, 1)
    })
  }

  it("keeps Browse, Re-search and restored selection free of analysis starts", {
    timeout: 3000,
  }, async (t) => {
    let searches = 0
    const { controller, container, read } = await mountCoordinator(
      t,
      async () =>
        assert.fail("Discovery and restored selection must not start analysis"),
      undefined,
      {
        sidebar: true,
        startDiscovery: false,
        pickDirectory: async () => "/repos",
        discover: async () => {
          searches++
          return { repos: repos.map((path) => ({ path, name: path })) }
        },
      },
    )
    const browse = container
      .querySelector(".lucide-folder-open")
      ?.closest("button")
    assert.ok(browse)
    await React.act(async () => {
      browse.click()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(searches, 1)
    const research = container
      .querySelector(".lucide-refresh-cw")
      ?.closest("button")
    assert.ok(research)
    await React.act(async () => {
      research.click()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(searches, 2)
    await React.act(async () => {
      useAnalysisStore
        .getState()
        .setSelectedRepoPath(analysisSourceScopeKey(source), repos[1])
      await flushQueries()
    })
    assert.equal(read().selectedRepoPath, repos[1])
    assert.equal(read().result, null)
  })

  it("refuses Browse during a pass and permits a cancellable search after Cancel", {
    timeout: 3000,
  }, async (t) => {
    const analysisEntered = deferred<void>()
    const releaseAnalysis = deferred<void>()
    const searchEntered = deferred<AbortSignal>()
    const releaseSearch = deferred<void>()
    t.after(() => {
      releaseAnalysis.resolve()
      releaseSearch.resolve()
    })
    let analysisCalls = 0
    const { controller, queryClient, container, read } = await mountCoordinator(
      t,
      async () => {
        analysisCalls++
        analysisEntered.resolve()
        await releaseAnalysis.promise
        return makeBaseResult()
      },
      undefined,
      {
        sidebar: true,
        startDiscovery: false,
        pickDirectory: async () => "/picked",
        discover: async (signal) => {
          searchEntered.resolve(signal)
          await releaseSearch.promise
          signal.throwIfAborted()
          return { repos: [] }
        },
      },
    )
    await React.act(async () => {
      queryClient.setQueryData(
        analysisQueryKeys.discovery(source, "/repos", 5),
        {
          repos: repos.map((path) => ({ path, name: path })),
        },
      )
      await flushQueries()
    })
    await React.act(async () => {
      read().runAnalysis()
      await flushQueries()
    })
    await analysisEntered.promise
    await React.act(flushQueries)
    const cancelLabel = (label: string) =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === label,
      )
    const cancelSource = cancelLabel("Cancel")
    assert.ok(cancelSource)
    assert.equal(isDisabled(cancelSource), false)
    const browse = container
      .querySelector(".lucide-folder-open")
      ?.closest("button")
    assert.ok(browse)
    assert.equal(isDisabled(browse), true)
    await React.act(async () => {
      browse.click()
      await flushQueries()
    })
    assert.equal(controller.getSnapshot().transactions.admitted.size, 1)
    assert.equal(cancelLabel("Cancel Search"), undefined)
    await React.act(async () => {
      cancelSource.click()
      releaseAnalysis.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    await React.act(async () => {
      browse.click()
      await flushQueries()
    })
    const signal = await searchEntered.promise
    await React.act(flushQueries)
    // The pass retired before the new input was admitted.
    assert.equal(cancelLabel("Cancel"), undefined)
    const cancelSearch = cancelLabel("Cancel Search")
    assert.ok(cancelSearch)
    assert.equal(isDisabled(cancelSearch), false)
    await React.act(async () => {
      cancelSearch.click()
      await flushQueries()
    })
    assert.equal(signal.aborted, true)
    await React.act(async () => {
      releaseSearch.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(analysisCalls, 1)
    assert.equal(read().discoveryError, null)
    assert.deepEqual(useToastStore.getState().toasts, [])
  })

  for (const kind of ["folder", "course"] as const) {
    for (const stage of ["refused", "open"] as const) {
      it(`handles ${stage} search-folder picks on a ${kind} surface and permits a later pick`, {
        timeout: 3000,
      }, async (t) => {
        const releaseEarlier = deferred<void>()
        const opened = deferred<void>()
        const picked = deferred<string | null>()
        t.after(() => {
          releaseEarlier.resolve()
          picked.resolve(null)
        })
        const activeSurface: PersistedActiveSurface =
          kind === "folder"
            ? { kind, path: "/repos" }
            : { kind, courseId: "course" }
        let pickerCalls = 0
        let searchCalls = 0
        const { controller, container } = await mountCoordinator(
          t,
          async () => assert.fail("An empty search must not start analysis"),
          undefined,
          {
            sidebar: true,
            activeSurface,
            startDiscovery: false,
            pickDirectory: async () => {
              pickerCalls++
              opened.resolve()
              return picked.promise
            },
            discover: async () => {
              searchCalls++
              return { repos: [] }
            },
          },
        )
        const browse = container
          .querySelector(".lucide-folder-open")
          ?.closest("button")
        assert.ok(browse)
        let earlier: Promise<unknown> | undefined
        await React.act(async () => {
          if (stage === "refused") {
            earlier = controller.operations.execute(
              "analysis.listFolderFiles",
              () => releaseEarlier.promise,
            )
          }
          browse.click()
          if (stage === "open") await opened.promise
          await flushQueries()
        })
        let followed = false
        let command: Promise<unknown> | undefined
        await React.act(async () => {
          command = controller.operations.execute("repo.clone", async () => {
            followed = true
            assert.deepEqual(
              controller.getSnapshot().settings.preferences.activeSurface,
              activeSurface,
            )
            if (kind === "course") {
              assert.equal(
                useCourseStore.getState().course?.searchFolder,
                "/repos",
              )
            }
            assert.equal(searchCalls, 0)
          })
          await flushQueries()
        })
        const cancelSearch = Array.from(
          container.querySelectorAll("button"),
        ).find((button) => button.textContent?.trim() === "Cancel Search")
        if (stage === "refused") {
          assert.equal(cancelSearch, undefined)
          assert.equal(pickerCalls, 0)
        } else {
          assert.ok(cancelSearch)
          assert.equal(isDisabled(cancelSearch), false)
          await React.act(async () => {
            cancelSearch.click()
            await flushQueries()
          })
        }
        assert.equal(followed, false)
        await React.act(async () => {
          releaseEarlier.resolve()
          picked.resolve("/picked")
          await earlier
          await command
          await controller.waitForIdle()
          await flushQueries()
        })
        assert.equal(followed, true)
        assert.equal(pickerCalls, stage === "refused" ? 0 : 1)
        assert.equal(searchCalls, 0)
        assert.deepEqual(useToastStore.getState().toasts, [])

        const retry = container
          .querySelector(".lucide-folder-open")
          ?.closest("button")
        assert.ok(retry)
        await React.act(async () => {
          retry.click()
          await controller.waitForIdle()
          await flushQueries()
        })
        assert.equal(pickerCalls, stage === "refused" ? 1 : 2)
        assert.equal(searchCalls, 1)
        assert.deepEqual(
          controller.getSnapshot().settings.preferences.activeSurface,
          kind === "folder" ? { kind, path: "/picked" } : activeSurface,
        )
        if (kind === "course") {
          assert.equal(
            useCourseStore.getState().course?.searchFolder,
            "/picked",
          )
        }
      })
    }

    for (const ending of ["completion", "cancellation", "failure"] as const) {
      it(`keeps the ${kind} picker search and ${ending} before a command queued during the picker`, {
        timeout: 3000,
      }, async (t) => {
        const opened = deferred<void>()
        const picked = deferred<string | null>()
        const entered = deferred<AbortSignal>()
        const release = deferred<void>()
        t.after(() => {
          picked.resolve(null)
          release.resolve()
        })
        const directory = "/picked/one/src"
        const repository = "/picked/one"
        const discovered = { repos: [{ name: "one", path: repository }] }
        const activeSurface: PersistedActiveSurface =
          kind === "folder"
            ? { kind, path: "/repos" }
            : { kind, courseId: "course" }
        const order: string[] = []
        const { controller, queryClient, container, read } =
          await mountCoordinator(t, async () => makeBaseResult(), undefined, {
            sidebar: true,
            activeSurface,
            startDiscovery: false,
            pickDirectory: async () => {
              order.push("picker")
              opened.resolve()
              return picked.promise
            },
            discover: async (signal, input) => {
              assert.deepEqual(input, { searchFolder: directory, maxDepth: 5 })
              order.push("search")
              entered.resolve(signal)
              await release.promise
              signal.throwIfAborted()
              if (ending === "failure") throw new Error("Search failed")
              return discovered
            },
          })
        assert.deepEqual([...order], [])
        const browse = container
          .querySelector(".lucide-folder-open")
          ?.closest("button")
        assert.ok(browse)
        await React.act(async () => {
          browse.click()
          await opened.promise
        })
        let command: Promise<unknown> | undefined
        const resultSource =
          kind === "folder" ? (["folder", repository] as const) : source
        const resultKey = analysisQueryKeys.discovery(
          resultSource,
          directory,
          5,
        )
        await React.act(async () => {
          command = controller.operations.execute("repo.clone", async () => {
            order.push("command")
            assert.deepEqual(
              queryClient.getQueryData(resultKey),
              ending === "completion" ? discovered : undefined,
            )
            if (ending === "completion") {
              assert.deepEqual(
                controller.getSnapshot().settings.preferences.activeSurface,
                kind === "folder" ? { kind, path: repository } : activeSurface,
              )
              if (kind === "course") {
                assert.equal(
                  useCourseStore.getState().course?.searchFolder,
                  repository,
                )
              }
            }
          })
          await flushQueries()
        })
        assert.deepEqual(order, ["picker"])
        await React.act(async () => {
          picked.resolve(directory)
          await flushQueries()
        })
        const signal = await entered.promise
        await React.act(flushQueries)
        assert.deepEqual(order, ["picker", "search"])
        assert.equal(read().discoveryStatus, "loading")
        const cancel = Array.from(container.querySelectorAll("button")).find(
          (button) => button.textContent?.trim() === "Cancel Search",
        )
        assert.ok(cancel)
        assert.equal(isDisabled(cancel), false)
        if (ending === "cancellation") {
          await React.act(async () => {
            cancel.click()
            await flushQueries()
          })
        }
        assert.equal(signal.aborted, ending === "cancellation")
        assert.deepEqual(order, ["picker", "search"])
        await React.act(async () => {
          release.resolve()
          await command
          await controller.waitForIdle()
          await flushQueries()
        })
        assert.deepEqual(order, ["picker", "search", "command"])
        assert.equal(read().discoveryCompleted, ending === "completion")
        assert.deepEqual(
          read().discoveredRepos,
          ending === "completion" ? discovered.repos : [],
        )
        assert.equal(
          read().discoveryError,
          ending === "failure" ? "Search failed" : null,
        )
        assert.deepEqual(useToastStore.getState().toasts, [])
      })
    }
  }

  it("orders an internal surface switch after the search body", {
    timeout: 3000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    const { controller, container } = await mountCoordinator(
      t,
      async () => assert.fail("An empty search must not start analysis"),
      undefined,
      {
        sidebar: true,
        discover: async (signal) => {
          entered.resolve(signal)
          await release.promise
          return { repos: [] }
        },
      },
    )
    const signal = await entered.promise
    assert.equal(container.querySelector('[role="status"]'), null)
    let transition: Promise<boolean> | undefined
    await React.act(async () => {
      transition = controller.activateSurface({ kind: "home" })
      await flushQueries()
    })
    assert.equal(signal.aborted, false)
    assert.deepEqual(
      controller.getSnapshot().settings.preferences.activeSurface,
      { kind: "course", courseId: "course" },
    )
    assert.equal(controller.getSnapshot().transactions.admitted.size, 2)
    await React.act(async () => {
      release.resolve()
      assert.equal(await transition, true)
      await flushQueries()
    })
    assert.deepEqual(
      controller.getSnapshot().settings.preferences.activeSurface,
      { kind: "home" },
    )
    assert.equal(container.querySelector('[role="status"]'), null)
  })

  for (const ending of ["completion", "cancellation"] as const) {
    it(`keeps search ${ending} reachable before a chained command body starts`, {
      timeout: 3000,
    }, async (t) => {
      const entered = deferred<AbortSignal>()
      const releaseSearch = deferred<void>()
      const releaseCommand = deferred<void>()
      t.after(() => {
        releaseSearch.resolve()
        releaseCommand.resolve()
      })
      let searchCalls = 0
      let commandStarted = false
      const { controller, container, read } = await mountCoordinator(
        t,
        async () => assert.fail("An empty search must not start analysis"),
        undefined,
        {
          sidebar: true,
          discover: async (signal) => {
            searchCalls++
            entered.resolve(signal)
            await releaseSearch.promise
            return { repos: [] }
          },
        },
      )
      const signal = await entered.promise
      assert.equal(container.querySelector('[role="status"]'), null)
      let reservation: SessionOperationReservation<void> | null | undefined
      await React.act(async () => {
        reservation = controller.operations.reserve<void>("repo.bulkClone")
        await flushQueries()
      })
      assert.ok(reservation)
      assert.equal(controller.getSnapshot().transactions.admitted.size, 2)
      assert.equal(signal.aborted, false)
      assert.equal(read().discoveryStatus, "loading")
      const button = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Cancel Search",
      )
      assert.ok(button)
      assert.equal(isDisabled(button), false)
      for (const control of container.querySelectorAll(
        "button, input, select, textarea",
      )) {
        if (control !== button) assert.equal(isDisabled(control), true)
      }
      const command = reservation.run(async () => {
        commandStarted = true
        await releaseCommand.promise
      })
      if (ending === "cancellation") {
        // A marker for a body that is not admitted cannot pass the input gate.
        button.setAttribute(sessionCancellationControl, "analysis.blame")
        await React.act(async () => {
          button.click()
          await flushQueries()
        })
        assert.equal(signal.aborted, false)
        button.setAttribute(
          sessionCancellationControl,
          "analysis.discoverRepos",
        )
        await React.act(async () => {
          // Exercise the capture path when the event comes from a child icon.
          const icon = button.querySelector("svg")
          const view = container.ownerDocument.defaultView
          assert.ok(icon)
          assert.ok(view)
          icon.dispatchEvent(
            new view.MouseEvent("click", {
              bubbles: true,
            }),
          )
          await flushQueries()
        })
        assert.equal(signal.aborted, true)
      }
      assert.equal(commandStarted, false)
      assert.equal(controller.getSnapshot().transactions.admitted.size, 2)
      await React.act(async () => {
        releaseSearch.resolve()
        await flushQueries()
      })
      assert.equal(commandStarted, true)
      assert.equal(container.querySelector('[role="status"]'), null)
      assert.equal(
        container.querySelector(`[${sessionCancellationControl}]`),
        null,
      )
      for (const control of container.querySelectorAll(
        "button, input, select, textarea",
      )) {
        assert.equal(isDisabled(control), true)
      }
      await React.act(async () => {
        releaseCommand.resolve()
        await command
        await controller.waitForIdle()
        await flushQueries()
      })
      assert.equal(searchCalls, 1)
      assert.equal(read().discoveryCompleted, ending === "completion")
    })
  }

  const cases = [
    { name: "repository list", searchFolder: "/repos", repos },
    { name: "empty search", searchFolder: "/repos", repos: [] },
    {
      name: "single repository folder",
      searchFolder: "/repos",
      repos: ["/repos"],
    },
    { name: "no search folder", searchFolder: null, repos: [] },
  ] as const

  for (const entry of cases) {
    it(`disables all sidebar controls during question generation with ${entry.name}`, {
      timeout: 3000,
    }, async (t) => {
      const { controller, container } = await mountCoordinator(
        t,
        async () => ({
          ...makeBaseResult(),
          fileStats: makeFileStatsWithBreakdown(),
        }),
        undefined,
        {
          sidebar: true,
          searchFolder: entry.searchFolder,
          initialDiscovery: {
            repos: entry.repos.map((path) => ({ path, name: path })),
          },
        },
      )
      await React.act(async () => {
        await controller.waitForIdle()
        await flushQueries()
      })
      const controls = Array.from(
        container.querySelectorAll("button, input, select, textarea"),
      )
      assert.ok(controls.length > 0)
      assert.ok(container.querySelector("input"))
      const wasDisabled = controls.map(isDisabled)
      const release = deferred<void>()
      t.after(() => release.resolve())
      let generation: Promise<unknown> | undefined
      await React.act(async () => {
        generation = controller.operations.execute(
          "examination.generateQuestions",
          () => release.promise,
        )
        await flushQueries()
      })
      for (const control of controls) {
        assert.equal(isDisabled(control), true, control.outerHTML)
      }
      await React.act(async () => {
        release.resolve()
        await generation
        await flushQueries()
      })
      assert.deepEqual(controls.map(isDisabled), wasDisabled)
    })
  }
})

describe("analysis query value projection", () => {
  it("hides previous analysis data while the current query is errored", () => {
    const result = makeBaseResult()

    assert.equal(
      selectCurrentAnalysisResult({
        snapshotCommitOid: "a".repeat(40),
        analysisIsFetching: false,
        analysisIsError: true,
        data: result,
      }),
      null,
    )
  })

  it("hides previous blame data while the current query is errored", () => {
    const blameResult = makeBlameResult()

    assert.equal(
      selectCurrentBlameResult({
        blameIsFetching: false,
        blameIsError: true,
        data: blameResult,
      }),
      null,
    )
  })
})
