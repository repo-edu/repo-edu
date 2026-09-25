import assert from "node:assert/strict"
import { testSessionStart } from "../../../../packages/renderer-app/src/__tests__/session-controller.test-support"
import type { SessionController } from "../../../../packages/renderer-app/src/session/session-controller"
import {
  type SessionOperationId,
  sessionDirectClasses,
  sessionWorkflowClasses,
} from "../../../../packages/renderer-app/src/session/session-operation-inventory"
import { canStartPersistenceWorker } from "../../../../packages/renderer-app/src/session/session-reducer"
import { useCourseStore } from "../../../../packages/renderer-app/src/stores/course-store"
import { useUiStore } from "../../../../packages/renderer-app/src/stores/ui-store"

/** Exercise each admission route while a real command owns its reservation. */
export async function assertCommandFreeze(controller: SessionController) {
  const settings = controller.getSnapshot().settings
  const course = useCourseStore.getState()
  const ui = useUiStore.getState()
  assert.equal(canStartPersistenceWorker(controller.getSnapshot()), false)

  for (const [id, classification] of [
    ...Object.entries(sessionWorkflowClasses),
    ...Object.entries(sessionDirectClasses),
  ]) {
    if (classification === "session-changing" || classification === "command")
      assert.equal(
        controller.operations.reserve(
          testSessionStart(),
          id as SessionOperationId,
        ),
        null,
        id,
      )
  }
  assert.equal(
    controller.operations.change(() => assert.fail("Unowned write")),
    false,
  )
  controller.setTheme(
    settings.preferences.appearance.theme === "dark" ? "light" : "dark",
  )
  controller.setActiveTab("analysis")
  controller.setActiveGitConnectionId("blocked")
  controller.pushRecentFolder("/blocked")
  if (course.course) {
    assert.equal(
      controller.applyLmsPreview(course.course.id, course.admissionNumber, {
        roster: course.course.roster,
        idSequences: course.course.idSequences,
      }),
      false,
    )
    controller.setDisplayName(course.course.id, "Blocked")
    controller.setSearchFolder(course.course.id, "/blocked")
    controller.mutateCourse(course.course.id, () =>
      assert.fail("Course mutation"),
    )
    assert.equal(controller.undo(course.course.id), null)
    assert.equal(controller.redo(course.course.id), null)
  }

  for (const attempt of [
    () =>
      controller.activateSurface(testSessionStart("recentRepositories"), {
        kind: "folder",
        path: "/blocked",
      }),
    () =>
      controller.createCourse(testSessionStart("courseNew"), {
        backing: "lms",
        displayName: "Blocked",
      }),
    () =>
      controller.duplicateCourse(
        testSessionStart("courseDuplicate"),
        "course",
        "Blocked",
      ),
    () =>
      controller.renameCourse(
        testSessionStart("courseRename"),
        "course",
        "Blocked",
      ),
    () => controller.deleteCourse(testSessionStart("courseDelete"), "course"),
  ]) {
    await assert.rejects(attempt(), /not accepting/)
  }
  assert.equal(controller.getSnapshot().settings, settings)
  assert.equal(useCourseStore.getState(), course)
  assert.equal(useUiStore.getState(), ui)
}
