import type {
  FileSystemPort,
  GitCommandPort,
  HttpPort,
  ProcessPort,
} from "@repo-edu/host-runtime-contract"
export declare const packageId = "@repo-edu/host-node"
export declare const workspaceDependencies: readonly [
  "@repo-edu/host-runtime-contract",
]
export declare function createNodeHttpPort(): HttpPort
export declare function createNodeProcessPort(): ProcessPort
export declare function createNodeGitCommandPort(
  processPort?: ProcessPort,
): GitCommandPort
export declare function createNodeFileSystemPort(): FileSystemPort
//# sourceMappingURL=index.d.ts.map
