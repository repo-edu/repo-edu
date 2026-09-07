import type { WorkflowInput } from "./workflow-client.js"
import type { CourseSaveStamp } from "./workflow-payloads.js"

/** One request can claim only the session's three canonical documents. */
export type PersistencePreparationBundle = {
  course?: WorkflowInput<"course.save">
  credentials?: WorkflowInput<"settings.saveCredentials">
  preferences?: WorkflowInput<"settings.savePreferences">
}

export type PersistencePreparationResult = {
  course?: CourseSaveStamp & { courseId: string }
}

/** Resolves only after the accepted request has committed its whole bundle. */
export type CommitPersistencePreparation = (
  bundle: PersistencePreparationBundle,
) => Promise<PersistencePreparationResult>

export class HostAdmissionRefusedError extends Error {
  constructor() {
    super("The desktop is not accepting ordinary work.")
    this.name = "HostAdmissionRefusedError"
  }
}
