import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"

export const noopGitCommand: GitCommandPort = {
  cancellation: "best-effort",
  run: async () => ({ exitCode: 0, signal: null, stdout: "", stderr: "" }),
}

export const noopFileSystem: FileSystemPort = {
  userHomeSystemDirectories: [],
  inspect: async () => [],
  stat: async () => ({ kind: "missing", size: null }),
  applyBatch: async () => ({ completed: [] }),
  createTempDirectory: async (prefix: string) => `/tmp/${prefix}`,
  listDirectory: async () => [],
  listFiles: async () => [],
  readFileInsideRoot: async () => {
    throw new Error("readFileInsideRoot not implemented")
  },
}
