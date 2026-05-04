import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"

export type AnalysisWorkflowPorts = {
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
}
