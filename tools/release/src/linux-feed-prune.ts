import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parse, stringify } from "yaml"

export type PruneLinuxFeedOptions = {
  readonly releaseDir: string
}

type UpdateFileEntry = {
  readonly url: string
  readonly sha512: string
  readonly size?: number
  readonly blockMapSize?: number
}

type LinuxUpdateInfo = {
  version: string
  files: UpdateFileEntry[]
  path?: string
  sha512?: string
  releaseDate?: string
}

// electron-builder emits latest-linux.yml (x64) and latest-linux-arm64.yml
// (arm64). Both ride on the AppImage target, which we build but never ship.
function isLinuxFeedFile(name: string): boolean {
  return name.startsWith("latest-linux") && name.endsWith(".yml")
}

// The generated feed lists the AppImage as primary and the deb as a secondary
// entry. We distribute only the deb, so the feed must reference only the deb:
// drop every non-deb file and repoint the top-level path/sha512 at the deb.
export async function pruneLinuxFeedToDeb(
  options: PruneLinuxFeedOptions,
): Promise<readonly string[]> {
  const entries = await readdir(options.releaseDir)
  const feeds = entries.filter(isLinuxFeedFile)
  if (feeds.length === 0) {
    throw new Error(
      `No Linux update feed (latest-linux*.yml) found in ${options.releaseDir}`,
    )
  }

  const pruned: string[] = []
  for (const feed of feeds) {
    const feedPath = join(options.releaseDir, feed)
    const info = parse(await readFile(feedPath, "utf8")) as LinuxUpdateInfo
    const debFiles = (info.files ?? []).filter((file) =>
      file.url.endsWith(".deb"),
    )
    if (debFiles.length === 0) {
      throw new Error(
        `Linux update feed ${feed} lists no .deb artifact to update from`,
      )
    }

    const primary = debFiles[0]
    const next: LinuxUpdateInfo = {
      ...info,
      files: debFiles.map((file) => ({
        url: file.url,
        sha512: file.sha512,
        ...(file.size === undefined ? {} : { size: file.size }),
      })),
      path: primary.url,
      sha512: primary.sha512,
    }
    await writeFile(feedPath, stringify(next))
    pruned.push(feedPath)
  }
  return pruned
}
