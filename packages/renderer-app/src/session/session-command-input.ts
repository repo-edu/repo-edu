import type {
  ExclusiveCommandId,
  WorkflowInput,
} from "@repo-edu/application-contract"
import { useCourseStore } from "../stores/course-store.js"
import type { SessionControllerSnapshot } from "./session-reducer.js"

/** Draft arguments belong to the reserved body. Documents come from their live
 * owners after preparation has applied every returned stamp. */
export function captureSessionCommandInput<K extends ExclusiveCommandId>(
  command: K,
  input: WorkflowInput<K>,
  snapshot: SessionControllerSnapshot,
): WorkflowInput<K> {
  switch (command) {
    case "roster.importFromFile":
    case "roster.exportMembers":
    case "groupSet.connectFromLms":
    case "groupSet.syncFromLms":
    case "groupSet.importFromFile":
    case "groupSet.export":
    case "gitUsernames.import":
    case "repo.create":
    case "repo.clone":
    case "repo.update": {
      const documentInput = input as WorkflowInput<"repo.clone">
      const course = useCourseStore.getState().course
      if (!course || course.id !== documentInput.course.id)
        throw new Error("The command's course is no longer active.")
      return structuredClone({
        ...input,
        course,
        ...("credentials" in input
          ? { credentials: snapshot.settings.credentials }
          : {}),
      })
    }
    case "repo.bulkClone":
    case "userFile.exportPreview":
    case "examination.generateQuestions":
    case "examination.archive.export":
    case "examination.archive.import":
      return structuredClone(input)
  }
}
