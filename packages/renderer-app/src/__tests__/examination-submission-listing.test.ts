import assert from "node:assert/strict"
import { it } from "node:test"
import type { WorkflowInput } from "@repo-edu/application-contract"
import { openSubmissionFolder } from "../components/tabs/examination/submission-file-listing.js"
import { selectActiveSurface } from "../session/selectors.js"
import {
  clearSessionController,
  setSessionController,
} from "../session/session-controller-context.js"
import { useExaminationStore } from "../stores/examination-store.js"
import {
  makeSettings,
  resetStores,
  startController,
  testSessionStart,
  workflowClient,
} from "./session-controller.test-support.js"

it("recent submissions list on their first open and reuse matching stored listings", async (t) => {
  resetStores()
  useExaminationStore.getState().reset()
  const listings: WorkflowInput<"analysis.listFolderFiles">[] = []
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "settings.loadApp") return makeSettings()
      if (id === "course.list") return []
      if (id === "settings.savePreferences") return undefined
      if (id === "analysis.listFolderFiles") {
        const listing = input as WorkflowInput<"analysis.listFolderFiles">
        assert.deepEqual(selectActiveSurface(controller.getSnapshot()), {
          kind: "submission",
          path: listing.folderPath,
        })
        listings.push(listing)
        return { files: [{ relativePath: "main.ts", size: 20 }] }
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
  const open = (
    path: string,
    extensions: string[],
    route: "picker" | "recent",
  ) => {
    controller.setDefaultExtensions(extensions)
    return controller.operations.execute(
      testSessionStart(
        route === "picker" ? "openSubmission" : "recentSubmission",
      ),
      "analysis.listFolderFiles",
      (scope) => openSubmissionFolder(scope, { path }, route),
    )
  }

  await controller.activateSurface(testSessionStart("recentSubmission"), {
    kind: "submission",
    path: "/submission",
  })
  // An already open submission without a listing must still list.
  await open("/submission", [".ts", "py", "ts"], "recent")
  assert.equal(listings.length, 1)
  assert.deepEqual(listings[0]?.extensions, ["ts", "py"])
  const stored = useExaminationStore
    .getState()
    .submissionFileLists.get("/submission")
  assert.equal(stored?.status, "loaded")
  await controller.activateSurface(testSessionStart("home"), { kind: "home" })
  await open("/submission", ["py", "ts"], "recent")
  assert.equal(listings.length, 1)
  assert.equal(
    useExaminationStore.getState().submissionFileLists.get("/submission"),
    stored,
  )

  await open("/another-submission", ["ts"], "recent")
  assert.equal(listings.length, 2)
  await open("/submission", ["ts", "py"], "recent")
  assert.equal(listings.length, 2)
  await open("/submission", ["rs"], "recent")
  assert.equal(listings.length, 3)
  assert.deepEqual(listings[2]?.extensions, ["rs"])
  await open("/submission", ["rs"], "picker")
  assert.equal(listings.length, 4)
})
