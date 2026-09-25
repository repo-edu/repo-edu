import assert from "node:assert/strict"
import { it } from "node:test"
import type { WorkflowInput } from "@repo-edu/application-contract"
import {
  normalizeConfiguredExtensions,
  openSubmissionFolder,
} from "../components/tabs/examination/submission-file-listing.js"
import { selectActiveSurface } from "../session/selectors.js"
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
    useExaminationStore.getState().reset()
  })
  await controller.waitForIdle()
  const open = (path: string, extensions: string[], reuseListing: boolean) =>
    controller.operations.execute(
      testSessionStart("submissionRefresh"),
      "analysis.listFolderFiles",
      (scope) =>
        openSubmissionFolder(
          scope,
          { path },
          normalizeConfiguredExtensions(extensions),
          reuseListing,
        ),
    )

  await open("/submission", [".ts", "py", "ts"], true)
  assert.equal(listings.length, 1)
  const stored = useExaminationStore
    .getState()
    .submissionFileLists.get("/submission")
  assert.equal(stored?.status, "loaded")
  await controller.activateSurface(testSessionStart("home"), { kind: "home" })
  await open("/submission", ["py", "ts"], true)
  assert.equal(listings.length, 1)
  assert.equal(
    useExaminationStore.getState().submissionFileLists.get("/submission"),
    stored,
  )

  await open("/another-submission", ["ts"], true)
  assert.equal(listings.length, 2)
  await open("/submission", ["ts", "py"], true)
  assert.equal(listings.length, 2)
  await open("/submission", ["rs"], true)
  assert.equal(listings.length, 3)
  assert.deepEqual(listings[2]?.extensions, ["rs"])
  await open("/submission", ["rs"], false)
  assert.equal(listings.length, 4)
})
