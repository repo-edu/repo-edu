import { readGitTrackedPaths, type TrackedPathProvider } from "./git.js"

const SOURCE_ROOT_PATTERN = /^(apps|packages|tools)\/[^/]+\/src\/.+\.tsx?$/

const GENERATED_FIXTURE_PATTERN =
  /^apps\/docs\/src\/fixtures\/projects\/[^/]+\/generated\//

const GENERATED_OUTPUT_SEGMENT_PATTERN =
  /(^|\/)(dist|out|build|coverage|\.turbo|\.vite)\//

const DEPENDENCY_SEGMENT_PATTERN = /(^|\/)node_modules\//

const VENDORED_RUNTIME_PATTERN =
  /^tools\/release\/src\/license-gate\/runtime-notices\//

export type SourceInventory = {
  readonly files: readonly string[]
  readonly fileSet: ReadonlySet<string>
}

export function isSourceInventoryPath(filePath: string): boolean {
  return (
    SOURCE_ROOT_PATTERN.test(filePath) &&
    !GENERATED_FIXTURE_PATTERN.test(filePath) &&
    !GENERATED_OUTPUT_SEGMENT_PATTERN.test(filePath) &&
    !DEPENDENCY_SEGMENT_PATTERN.test(filePath) &&
    !VENDORED_RUNTIME_PATTERN.test(filePath)
  )
}

export function readSourceInventory(
  root: string,
  trackedPathProvider: TrackedPathProvider = readGitTrackedPaths,
): SourceInventory {
  const files = trackedPathProvider(root).filter(isSourceInventoryPath).sort()
  return {
    files,
    fileSet: new Set(files),
  }
}

export function sourceInventoryPathPattern(): string {
  return "^(?:apps|packages|tools)/[^/]+/src/.+\\.tsx?$"
}
