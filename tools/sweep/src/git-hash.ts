import { spawnSync } from "node:child_process"

/**
 * Blob hash per path, computed from the working-tree content (no staging
 * required), in one `git hash-object` process. The hash is the file's content
 * identity: it changes the moment the bytes change, which is what re-surfaces a
 * judged file once it grows.
 */
export function gitHashObject(
  root: string,
  repoPaths: readonly string[],
): Map<string, string> {
  const hashByPath = new Map<string, string>()
  if (repoPaths.length === 0) return hashByPath

  const result = spawnSync("git", ["hash-object", "--stdin-paths"], {
    cwd: root,
    input: `${repoPaths.join("\n")}\n`,
    encoding: "utf8",
  })

  if (result.status !== 0) {
    const stderr = result.stderr.trim()
    throw new Error(
      `Unable to hash files with git hash-object: ${stderr || "unknown error"}`,
    )
  }

  const hashes = result.stdout.split("\n").filter((line) => line.length > 0)
  if (hashes.length !== repoPaths.length) {
    throw new Error(
      `git hash-object returned ${hashes.length} hashes for ${repoPaths.length} paths`,
    )
  }

  for (const [index, repoPath] of repoPaths.entries()) {
    hashByPath.set(repoPath, hashes[index])
  }
  return hashByPath
}
