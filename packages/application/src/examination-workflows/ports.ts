import type { LlmPort } from "@repo-edu/host-runtime-contract"
import type { ExaminationArchivePort } from "./archive-port.js"

export type ExaminationWorkflowPorts = {
  llm: LlmPort
  archive: ExaminationArchivePort
}
