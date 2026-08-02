import { type GitPathProvider, readGitWorktreePaths } from "./git.js"

const SOURCE_ROOT_PATTERN = /^(apps|packages|tools)\/[^/]+\/src\/.+\.tsx?$/

const GENERATED_OUTPUT_SEGMENT_PATTERN =
  /(^|\/)(dist|out|build|coverage|\.turbo|\.vite)\//

const DEPENDENCY_SEGMENT_PATTERN = /(^|\/)node_modules\//

const VENDORED_RUNTIME_PATTERN =
  /^tools\/release\/src\/license-gate\/runtime-notices\//

export type SourceInventory = {
  readonly files: readonly string[]
  readonly fileSet: ReadonlySet<string>
  // The unfiltered worktree listing the source files were selected from, for
  // checks that also cover manifests and non-source files.
  readonly worktreePaths: readonly string[]
}

export function isSourceInventoryPath(filePath: string): boolean {
  return (
    SOURCE_ROOT_PATTERN.test(filePath) &&
    !GENERATED_OUTPUT_SEGMENT_PATTERN.test(filePath) &&
    !DEPENDENCY_SEGMENT_PATTERN.test(filePath) &&
    !VENDORED_RUNTIME_PATTERN.test(filePath)
  )
}

export function readSourceInventory(
  root: string,
  pathProvider: GitPathProvider = readGitWorktreePaths,
): SourceInventory {
  const worktreePaths = pathProvider(root)
  const files = worktreePaths.filter(isSourceInventoryPath).sort()
  return {
    files,
    fileSet: new Set(files),
    worktreePaths,
  }
}

export function sourceInventoryPathPattern(): string {
  return "^(?:apps|packages|tools)/[^/]+/src/.+\\.tsx?$"
}
