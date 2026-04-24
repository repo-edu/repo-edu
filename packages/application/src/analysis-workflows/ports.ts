import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"
import type { AnalysisResultCache, BlameFileCache } from "./cache.js"

export type AnalysisWorkflowPorts = {
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
  cache?: AnalysisResultCache
  blameCache?: BlameFileCache
}
