import assert from "node:assert/strict"
import { describe, it, type TestContext } from "node:test"
import type {
  AnalysisDiscoverReposResult,
  WorkflowClient,
  WorkflowId,
} from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { TooltipProvider } from "@repo-edu/ui"
import { QueryClientProvider } from "@tanstack/react-query"
import { Window } from "happy-dom"
import React from "react"
import { createRoot } from "react-dom/client"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import {
  AnalysisCoordinatorProvider,
  type AnalysisCoordinatorValue,
  selectCurrentAnalysisResult,
  selectCurrentBlameResult,
  selectEffectiveDiscoveryOutcome,
  useAnalysisCoordinator,
} from "../analysis/analysis-query-coordinator.js"
import { analysisQueryKeys } from "../analysis/analysis-query-keys.js"
import { AnalysisSidebar } from "../components/tabs/analysis/AnalysisSidebar.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { SessionControllerProvider } from "../session/session-controller-context.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
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
const flushQueries = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))

async function mountCoordinator(
  t: TestContext,
  analyse: (signal: AbortSignal) => Promise<unknown>,
  blame?: (signal: AbortSignal) => Promise<unknown>,
  options: {
    discover?: (signal: AbortSignal) => Promise<AnalysisDiscoverReposResult>
    initialDiscovery?: AnalysisDiscoverReposResult
    sidebar?: boolean
    searchFolder?: string | null
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
            activeSurface: { kind: "course", courseId: course.id },
            analysisConcurrency: { repoParallelism: 1, filesPerRepo: 1 },
          })
        if (id === "course.load") return course
        if (id === "analysis.resolveSnapshotHead") return "head"
        if (id === "analysis.discoverRepos") {
          assert.ok(options?.signal)
          assert.ok(discover)
          return await discover(options.signal)
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
  const queryClient = createRendererQueryClient()
  if (!discover) {
    queryClient.setQueryData(
      analysisQueryKeys.discovery(source, "/repos", 5),
      options.initialDiscovery ?? {
        repos: repos.map((path) => ({ path, name: path })),
      },
    )
  }
  if (course.searchFolder !== null) {
    useAnalysisStore
      .getState()
      .setPendingRepoDiscoveryRequest(JSON.stringify(source), {
        folder: course.searchFolder,
        depth: 5,
      })
  }
  let value: AnalysisCoordinatorValue | undefined
  function ReadAnalysis() {
    value = useAnalysisCoordinator()
    return null
  }
  const container = window.document.createElement("div")
  const root = createRoot(container as unknown as HTMLElement)
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
                  <RendererHostProvider value={{} as RendererHost}>
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
    await React.act(async () => {
      button.click()
      await flushQueries()
    })
    assert.equal(signal.aborted, true)
    assert.equal(read().blameStatus, "idle")
    assert.equal(read().blameResult, null)
    assert.equal(blameCalls, 1)
    let commandStarted = false
    let command: Promise<unknown> | undefined
    await React.act(async () => {
      command = controller.operations.execute("repo.clone", async () => {
        commandStarted = true
        assert.equal(
          queryClient
            .getQueryCache()
            .findAll({
              queryKey: analysisQueryKeys.repoBlames(source, repos[0]),
            })
            .some((query) => query.state.data !== undefined),
          false,
        )
      })
      await flushQueries()
    })
    assert.equal(commandStarted, false)
    assert.equal(blameCalls, 1)
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
    assert.equal(read().lastDiscoveryOutcome, "cancelled")
    await React.act(async () => {
      read().runRepoDiscovery("/repos")
      await flushQueries()
    })
    await React.act(async () => {
      await controller.waitForIdle()
      await flushQueries()
    })
    assert.equal(calls, 2)
    assert.equal(read().lastDiscoveryOutcome, "completed")
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
      await React.act(flushQueries)
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
    assert.equal(read().lastDiscoveryOutcome, "cancelled")
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
    assert.equal(read().lastDiscoveryOutcome, "cancelled")
    const queries = queryClient
      .getQueryCache()
      .findAll({ queryKey: analysisQueryKeys.repoResults(source, repos[0]) })
    assert.equal(queries.length, 1)
    assert.deepEqual(queries[0]?.state.data, result)
  })
})

describe("analysis sidebar admission", () => {
  // Happy DOM's :disabled selector checks only the element's own attribute.
  const isDisabled = (control: Element) =>
    control.matches(":disabled") ||
    control.closest("fieldset[disabled]") !== null
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
  it("derives discovery completion unless cancellation masks query success", () => {
    assert.equal(
      selectEffectiveDiscoveryOutcome({
        commandOutcome: "none",
        discoveryIsSuccess: false,
      }),
      "none",
    )
    assert.equal(
      selectEffectiveDiscoveryOutcome({
        commandOutcome: "none",
        discoveryIsSuccess: true,
      }),
      "completed",
    )
    assert.equal(
      selectEffectiveDiscoveryOutcome({
        commandOutcome: "cancelled",
        discoveryIsSuccess: true,
      }),
      "cancelled",
    )
  })

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
