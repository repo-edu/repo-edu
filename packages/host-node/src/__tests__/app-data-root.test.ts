import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type ResolveRepoEduAppDataRootOptions,
  resolveRepoEduAppDataRoot,
} from "../app-data-root.js"

function resolveWithoutStorageOverride(
  options: ResolveRepoEduAppDataRootOptions,
): string {
  return resolveRepoEduAppDataRoot({
    ...options,
    storageRootOverride: null,
  })
}

describe("resolveRepoEduAppDataRoot", () => {
  it("resolves an explicit storage-root override", () => {
    assert.equal(
      resolveRepoEduAppDataRoot({
        platform: "linux",
        storageRootOverride: "relative-storage",
      }),
      `${process.cwd()}/relative-storage`,
    )
  })

  it("ignores an empty explicit storage-root override", () => {
    assert.equal(
      resolveRepoEduAppDataRoot({
        platform: "linux",
        homeDirectory: "/home/ada",
        storageRootOverride: "  ",
        xdgConfigHome: null,
        roamingAppDataDirectory: null,
      }),
      "/home/ada/.config/repo-edu",
    )
  })

  it("uses XDG config on Linux when supplied", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "linux",
        homeDirectory: "/home/ada",
        xdgConfigHome: "/tmp/xdg-config",
        roamingAppDataDirectory: null,
      }),
      "/tmp/xdg-config/repo-edu",
    )
  })

  it("ignores relative XDG config homes", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "linux",
        homeDirectory: "/home/ada",
        xdgConfigHome: "relative-config",
        roamingAppDataDirectory: null,
      }),
      "/home/ada/.config/repo-edu",
    )
  })

  it("falls back to the Linux home config directory", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "linux",
        homeDirectory: "/home/ada",
        xdgConfigHome: null,
        roamingAppDataDirectory: null,
      }),
      "/home/ada/.config/repo-edu",
    )
  })

  it("uses the macOS application-support directory", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "darwin",
        homeDirectory: "/Users/ada",
        xdgConfigHome: null,
        roamingAppDataDirectory: null,
      }),
      "/Users/ada/Library/Application Support/repo-edu",
    )
  })

  it("uses Windows roaming app data when supplied", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "win32",
        homeDirectory: "C:\\Users\\Ada",
        roamingAppDataDirectory: "C:\\Users\\Ada\\AppData\\Roaming",
        xdgConfigHome: null,
      }),
      "C:\\Users\\Ada\\AppData\\Roaming\\repo-edu",
    )
  })

  it("ignores relative Windows roaming app data", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "win32",
        homeDirectory: "C:\\Users\\Ada",
        roamingAppDataDirectory: "AppData\\Roaming",
        xdgConfigHome: null,
      }),
      "C:\\Users\\Ada\\AppData\\Roaming\\repo-edu",
    )
  })

  it("uses an injected platform app-data base for desktop", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "darwin",
        homeDirectory: "/unused",
        platformAppDataDirectory: "/electron/app-data",
        xdgConfigHome: null,
        roamingAppDataDirectory: null,
      }),
      "/electron/app-data/repo-edu",
    )
  })

  it("ignores a relative injected platform app-data base", () => {
    assert.equal(
      resolveWithoutStorageOverride({
        platform: "darwin",
        homeDirectory: "/Users/ada",
        platformAppDataDirectory: "relative-app-data",
        xdgConfigHome: null,
        roamingAppDataDirectory: null,
      }),
      "/Users/ada/Library/Application Support/repo-edu",
    )
  })
})
