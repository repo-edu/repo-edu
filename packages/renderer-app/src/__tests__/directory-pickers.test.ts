import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { WorkflowInput } from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { jsx } from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { useCloneAllRepositories } from "../components/tabs/groups-assignments/GroupSetGroupsTable/use-clone-all-repositories.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { useOpenRepositoriesFolder } from "../hooks/use-open-repositories-folder.js"
import { useOpenSubmissionFolder } from "../hooks/use-open-submission-folder.js"
import {
  clearSessionController,
  SessionControllerProvider,
  setSessionController,
} from "../session/session-controller-context.js"
import { useExaminationStore } from "../stores/examination-store.js"
import { useToastStore } from "../stores/toast-store.js"
import {
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  testSessionStart,
  workflowClient,
} from "./session-controller.test-support.js"

function useCloneTargetPicker() {
  return useCloneAllRepositories({
    activeConnectionId: null,
    organization: null,
    initialTargetDirectory: "/original",
  }).browseTargetDirectory
}

beforeEach(resetStores)

it("opens each submission folder with the course passed to the bound handler", async (t) => {
  const listings: WorkflowInput<"analysis.listFolderFiles">[] = []
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "settings.loadApp") return makeSettings()
      if (id === "course.list") return []
      if (id === "course.load") {
        return makeCourse((input as WorkflowInput<"course.load">).courseId)
      }
      if (id === "settings.savePreferences") return undefined
      if (id === "analysis.listFolderFiles") {
        listings.push(input as WorkflowInput<"analysis.listFolderFiles">)
        return { files: [] }
      }
      assert.fail(`Unexpected workflow: ${id}`)
    }),
  })
  t.after(() => {
    controller.dispose()
    clearSessionController(controller)
    useExaminationStore.getState().reset()
  })
  await controller.waitForIdle()
  setSessionController(controller)
  const host: Pick<RendererHost, "pickDirectory"> = {
    pickDirectory: async (options) => {
      assert.equal(options?.title, "Open student submission folder")
      return "/submission"
    },
  }
  let open: ReturnType<typeof useOpenSubmissionFolder> | undefined
  function Probe() {
    open = useOpenSubmissionFolder()
    return null
  }
  renderToStaticMarkup(
    jsx(WorkflowClientProvider, {
      value: controller.operations,
      children: jsx(RendererHostProvider, {
        value: host as RendererHost,
        children: jsx(Probe, {}),
      }),
    }),
  )
  assert.ok(open)
  for (const courseId of ["first", "second", undefined]) {
    await open(courseId)
    const recent =
      courseId === undefined
        ? { path: "/submission" }
        : { path: "/submission", courseId }
    const preferences = controller.getSnapshot().settings.preferences
    assert.deepEqual(preferences.activeSurface, {
      kind: "submission",
      ...recent,
    })
    assert.deepEqual(preferences.recentSubmissionFolders[0], recent)
  }
  assert.equal(listings.length, 3)
  assert.ok(listings.every((input) => input.folderPath === "/submission"))
})

describe("directory picker errors", () => {
  for (const [name, usePicker] of [
    ["repository folder", useOpenRepositoriesFolder],
    ["submission folder", useOpenSubmissionFolder],
    ["clone target", useCloneTargetPicker],
  ] as const) {
    for (const outcome of ["failure", "cancel"] as const) {
      it(`handles ${name} picker ${outcome} before its body retires`, async (t) => {
        const controller = startController({
          workflowClient: workflowClient(async (id) => {
            if (id === "course.list") return []
            assert.equal(id, "settings.loadApp")
            return makeSettings({ activeSurface: { kind: "home" } })
          }),
        })
        t.after(() => controller.dispose())
        await controller.waitForIdle()
        const queryClient = new QueryClient()
        t.after(() => queryClient.clear())
        const opened = deferred<void>()
        const picked = deferred<string | null>()
        const host: Pick<RendererHost, "pickDirectory"> = {
          pickDirectory: () => {
            opened.resolve()
            return picked.promise
          },
        }
        let open: (() => Promise<void>) | undefined
        function Probe() {
          open = usePicker()
          return null
        }
        renderToStaticMarkup(
          jsx(SessionControllerProvider, {
            controller,
            children: jsx(WorkflowClientProvider, {
              value: controller.operations,
              children: jsx(RendererHostProvider, {
                value: host as RendererHost,
                children: jsx(QueryClientProvider, {
                  client: queryClient,
                  children: jsx(Probe, {}),
                }),
              }),
            }),
          }),
        )
        assert.ok(open)
        const running = open()
        await opened.promise
        const [turnId] = controller.getSnapshot().transactions.admitted.keys()
        assert.notEqual(turnId, undefined)
        const descriptor = controller
          .getSnapshot()
          .transactions.admitted.get(turnId)
        assert.ok(descriptor && "start" in descriptor)
        assert.equal(
          descriptor.start.id,
          {
            "repository folder": "openRepositories",
            "submission folder": "openSubmission",
            "clone target": "cloneAllBrowse",
          }[name],
        )
        const reportedDuringBody: boolean[] = []
        const order: string[] = []
        t.after(
          useToastStore.subscribe(() => {
            reportedDuringBody.push(
              controller.getSnapshot().transactions.admitted.has(turnId),
            )
            order.push("error")
          }),
        )
        const next = controller.operations.execute(
          testSessionStart("repositoryClone"),
          "repo.clone",
          async () => {
            order.push("next")
          },
        )

        if (outcome === "failure") {
          picked.reject(new Error("Picker unavailable"))
        } else {
          picked.resolve(null)
        }
        await Promise.all([running, next])

        assert.deepEqual(
          useToastStore.getState().toasts.map(({ message, tone }) => ({
            message,
            tone,
          })),
          outcome === "failure"
            ? [{ message: "Picker unavailable", tone: "error" }]
            : [],
        )
        assert.deepEqual(
          reportedDuringBody,
          outcome === "failure" ? [true] : [],
        )
        assert.deepEqual(
          order,
          outcome === "failure" ? ["error", "next"] : ["next"],
        )
        assert.deepEqual(
          controller.getSnapshot().settings.preferences.activeSurface,
          { kind: "home" },
        )
        assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
      })
    }
  }
})
