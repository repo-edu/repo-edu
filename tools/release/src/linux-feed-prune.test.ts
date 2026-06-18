import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { parse } from "yaml"
import { pruneLinuxFeedToDeb } from "./linux-feed-prune.js"

function feedWith(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`
}

describe("pruneLinuxFeedToDeb", () => {
  it("keeps only the deb and repoints path and sha512 at it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feed-prune-"))
    const feed = join(dir, "latest-linux-arm64.yml")
    await writeFile(
      feed,
      feedWith([
        "version: 0.0.19",
        "files:",
        "  - url: RepoEdu-0.0.19-linux-arm64.AppImage",
        "    sha512: APPIMAGESHA",
        "    size: 243033002",
        "    blockMapSize: 257782",
        "  - url: RepoEdu-0.0.19-linux-arm64.deb",
        "    sha512: DEBSHA",
        "    size: 168599812",
        "path: RepoEdu-0.0.19-linux-arm64.AppImage",
        "sha512: APPIMAGESHA",
        "releaseDate: '2026-06-16T07:30:21.128Z'",
      ]),
    )

    const pruned = await pruneLinuxFeedToDeb({ releaseDir: dir })
    assert.deepEqual(pruned, [feed])

    const result = parse(await readFile(feed, "utf8"))
    assert.equal(result.files.length, 1)
    assert.equal(result.files[0].url, "RepoEdu-0.0.19-linux-arm64.deb")
    assert.equal(result.files[0].sha512, "DEBSHA")
    assert.equal(result.path, "RepoEdu-0.0.19-linux-arm64.deb")
    assert.equal(result.sha512, "DEBSHA")
    assert.equal("blockMapSize" in result.files[0], false)
    assert.equal(result.version, "0.0.19")
    assert.equal(result.releaseDate, "2026-06-16T07:30:21.128Z")
  })

  it("throws when the feed lists no deb", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feed-prune-"))
    await writeFile(
      join(dir, "latest-linux.yml"),
      feedWith([
        "version: 0.0.19",
        "files:",
        "  - url: RepoEdu-0.0.19.AppImage",
        "    sha512: APPIMAGESHA",
        "    size: 1",
        "path: RepoEdu-0.0.19.AppImage",
        "sha512: APPIMAGESHA",
      ]),
    )

    await assert.rejects(() => pruneLinuxFeedToDeb({ releaseDir: dir }))
  })

  it("throws when no Linux feed is present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feed-prune-"))
    await assert.rejects(() => pruneLinuxFeedToDeb({ releaseDir: dir }))
  })
})
