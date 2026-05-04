import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"
import type { BlameFileCache } from "./blame-cache.js"

export type AnalysisWorkflowPorts = {
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
  blameCache?: BlameFileCache
}
