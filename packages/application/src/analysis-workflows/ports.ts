import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"
import type { AnalysisResultCache } from "./cache.js"

export type AnalysisWorkflowPorts = {
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
  cache?: AnalysisResultCache
}
