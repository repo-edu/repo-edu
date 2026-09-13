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
import { SessionWaitingBanner } from "../components/SessionWaitingBanner.js"
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
const repoBlames = (repoPath: string) =>
  [...analysisQueryKeys.repo(source, repoPath), "blame"] as const
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
  analyse: (signal: AbortSignal) => Promise<unknown>,
  blame?: (signal: AbortSignal) => Promise<unknown>,
  options: {
    discover?: (
      signal: AbortSignal,
      input: WorkflowInput<"analysis.discoverRepos">,
    ) => Promise<AnalysisDiscoverReposResult>
    startDiscovery?: boolean
    pickDirectory?: RendererHost["pickDirectory"]
    initialDiscovery?: AnalysisDiscoverReposResult
    sidebar?: boolean
    searchFolder?: string | null
    activeSurface?: PersistedActiveSurface
    strictEffects?: boolean
  } = {},
) {
  const { discover } = options
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
            analysisConcurrency: { repoParallelism: 1, filesPerRepo: 1 },
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
          return await analyse(options.signal)
        }
        if (id === "analysis.blame") {
          assert.ok(options?.signal)
          assert.ok(blame)
          return await blame(options.signal)
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
          <SessionWaitingBanner />
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
      value?.runRepoDiscovery(folder)
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

  it("resumes after React repeats effect setup and cleanup", {
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

  it("cancels host blame from the Cancel button and holds the next command until settlement", {
    timeout: 3000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    let blameCalls = 0
    const { controller, queryClient, container, read } = await mountCoordinator(
      t,
      async () => ({
        ...makeBaseResult(),
        fileStats: makeFileStatsWithBreakdown(),
      }),
      async (signal) => {
        blameCalls++
        entered.resolve(signal)
        await release.promise
        return makeBlameResult()
      },
    )
    await React.act(flushQueries)
    const signal = await entered.promise
    await React.act(flushQueries)
    const button = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Cancel",
    )
    assert.ok(button)
    let commandStarted = false
    let command: Promise<unknown> | undefined
    await React.act(async () => {
      command = controller.operations.execute("repo.clone", async () => {
        commandStarted = true
        assert.equal(
          queryClient
            .getQueryCache()
            .findAll({
              queryKey: repoBlames(repos[0]),
            })
            .some((query) => query.state.data !== undefined),
          false,
        )
      })
      await flushQueries()
    })
    assert.equal(commandStarted, false)
    assert.equal(blameCalls, 1)
    assert.equal(button.closest("fieldset[disabled]"), null)
    await React.act(async () => {
      button.click()
      await flushQueries()
    })
    assert.equal(signal.aborted, true)
    assert.equal(read().blameStatus, "idle")
    assert.equal(read().blameResult, null)
    await React.act(async () => {
      release.resolve()
      await command
      await flushQueries()
    })
    assert.equal(commandStarted, true)
    await React.act(async () => {
      controller.setDisplayName("course", "Renamed after Cancel")
      await flushQueries()
    })
    assert.equal(blameCalls, 1)
    assert.equal(read().blameResult, null)

    await React.act(async () => {
      read().runAnalysis(repos[0])
      await controller.waitForIdle()
      await flushQueries()
    })
    await React.act(flushQueries)
    assert.equal(blameCalls, 2)
    assert.deepEqual(read().blameResult, makeBlameResult())
  })

  for (const ending of ["pause", "cancel"] as const) {
    it(`${ending === "pause" ? "resumes a paused" : "keeps a cancelled"} repository pass after command retirement`, {
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
        command = controller.operations.execute(
          "groupSet.export",
          async () => {},
        )
        await flushQueries()
      })
      assert.equal(signal.aborted, true)
      await React.act(async () => {
        release.resolve()
        await command
        await flushQueries()
      })
      await React.act(async () => {
        await controller.waitForIdle()
        controller.setDisplayName("course", "Renamed")
        await flushQueries()
      })
      assert.equal(calls, ending === "cancel" ? 1 : repos.length + 1)
      if (ending === "cancel") {
        await React.act(async () => {
          read().runAnalysis(repos[0])
          await controller.waitForIdle()
          await flushQueries()
        })
        assert.equal(calls, repos.length + 1)
      }
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
      // The analysis result lands first and its effect then queues the blame
      // body, so wait for that queue to drain before reading blame's outcome.
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

  it("replaces the pending runner when analysis inputs change", {
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
    assert.equal(signal.aborted, true)
    await React.act(async () => {
      release.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(read().analysisIdentity?.roster[0]?.email, "new@example.edu")
    assert.ok(read().result)
  })

  it("restores analysis after cancelling a repeated search of the same folder and depth", {
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
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.deepEqual(read().result, result)
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
    assert.deepEqual(read().result, result)
  })

  it("keeps a later analysis after discovery was cancelled and selection moves", {
    timeout: 3000,
  }, async (t) => {
    const entered = deferred<AbortSignal>()
    const release = deferred<void>()
    t.after(() => release.resolve())
    const result = makeBaseResult()
    let pause = false
    const { controller, queryClient, read } = await mountCoordinator(
      t,
      async (signal) => {
        if (pause) {
          entered.resolve(signal)
          await release.promise
        }
        return result
      },
    )
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    await React.act(async () => {
      read().cancelDiscovery()
      await flushQueries()
    })
    assert.equal(read().discoveryStatus, "idle")
    assert.equal(read().discoveredRepos.length, repos.length)
    pause = true
    await React.act(async () => {
      read().runAnalysis(repos[0])
      await flushQueries()
    })
    const signal = await entered.promise
    await React.act(async () => {
      read().selectRepository(repos[1])
      await flushQueries()
    })
    assert.equal(signal.aborted, false)
    await React.act(async () => {
      release.resolve()
      await controller.waitForIdle()
      await flushQueries()
    })
    const queries = queryClient
      .getQueryCache()
      .findAll({ queryKey: repoResults(repos[0]) })
    assert.equal(queries.length, 1)
    assert.deepEqual(queries[0]?.state.data, result)
  })
})

describe("analysis sidebar admission", () => {
  // Happy DOM's :disabled selector checks only the element's own attribute.
  const isDisabled = (control: Element) =>
    control.matches(":disabled") ||
    control.closest("fieldset[disabled]") !== null

  it("keeps search cancellation available while the remaining analysis waits behind the picker", {
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
    await analysisEntered.promise
    const browse = container
      .querySelector(".lucide-folder-open")
      ?.closest("button")
    assert.ok(browse)
    await React.act(async () => {
      browse.click()
      releaseAnalysis.resolve()
      await flushQueries()
    })
    const signal = await searchEntered.promise
    await React.act(flushQueries)
    const buttons = Array.from(container.querySelectorAll("button"))
    const cancelSource = buttons.find(
      (button) => button.textContent?.trim() === "Cancel",
    )
    const cancelSearch = buttons.find(
      (button) => button.textContent?.trim() === "Cancel Search",
    )
    assert.ok(cancelSource)
    assert.ok(cancelSearch)
    assert.equal(isDisabled(cancelSource), false)
    assert.equal(isDisabled(cancelSearch), false)
    await React.act(async () => {
      cancelSource.click()
      await flushQueries()
    })
    assert.equal(signal.aborted, false)
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
    for (const stage of ["queued", "open"] as const) {
      it(`cancels the search-folder pick on a ${kind} surface while ${stage} and permits a later pick`, {
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
          if (stage === "queued") {
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
        assert.ok(cancelSearch)
        assert.equal(isDisabled(cancelSearch), false)
        await React.act(async () => {
          cancelSearch.click()
          await flushQueries()
        })
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
        assert.equal(pickerCalls, stage === "queued" ? 0 : 1)
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
        assert.equal(pickerCalls, stage === "queued" ? 1 : 2)
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

  it("shows a surface switch waiting for a search and clears the banner when it starts", {
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
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /Waiting for current work to finish/,
    )
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
    it(`shows a reserved command and allows search ${ending} before its body starts`, {
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
      assert.match(
        container.querySelector('[role="status"]')?.textContent ?? "",
        /Waiting for current work to finish/,
      )
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
      assert.ok(container.querySelector('[role="status"]'))
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
