import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { jsx } from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { useCloneAllRepositories } from "../components/tabs/groups-assignments/GroupSetGroupsTable/use-clone-all-repositories.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { useOpenRepositoriesFolder } from "../hooks/use-open-repositories-folder.js"
import { useOpenSubmissionFolder } from "../hooks/use-open-submission-folder.js"
import { SessionControllerProvider } from "../session/session-controller-context.js"
import { useToastStore } from "../stores/toast-store.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
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
        const next = controller.operations.execute("repo.clone", async () => {
          order.push("next")
        })

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
