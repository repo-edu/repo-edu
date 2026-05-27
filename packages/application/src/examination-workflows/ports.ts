import type {
  FileSystemPort,
  LlmPort,
  TokenizerPort,
} from "@repo-edu/host-runtime-contract"
import type { ExaminationArchivePort } from "./archive-port.js"

export type ExaminationWorkflowPorts = {
  llm: LlmPort
  archive: ExaminationArchivePort
  tokenizer: TokenizerPort
  fileSystem: FileSystemPort
}
