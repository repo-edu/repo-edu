import * as path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
)

export function toRepoPath(root: string, filePath: string): string {
  return normalizeRepoPath(path.relative(root, filePath))
}

export function normalizeRepoPath(filePath: string): string {
  return filePath
    .split(path.sep)
    .join("/")
    .replace(/^\.\/+/, "")
}

export function repoPathToAbsolute(root: string, repoPath: string): string {
  return path.join(root, ...repoPath.split("/"))
}
