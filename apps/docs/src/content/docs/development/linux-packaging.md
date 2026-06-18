---
title: Linux Packaging
description: Why the Linux desktop app ships as a deb only, and how its auto-update feed is produced
---

The Linux desktop app is distributed as a single `.deb` package per architecture (x64 and arm64). The release pipeline does not build or publish an AppImage.

## Why deb only

AppImage was dropped as a distributed artifact for two concrete reasons, both of which only bite users who actually run the AppImage:

- **glibc floor.** An AppImage does not bundle glibc, and glibc is forward compatible only, so an AppImage runs on systems with the same or newer glibc but not older ones. Our CI builds on `ubuntu-latest`, which pins a recent glibc, so a shipped AppImage would fail to launch on older distributions with a `version GLIBC_... not found` error. A deb instead declares a `libc6` dependency that apt resolves at install time with a readable message.
- **Child-process environment contamination.** AppImage's `AppRun` sets `LD_LIBRARY_PATH` so the bundled app finds its own libraries. That variable leaks into child processes, so spawning system tools (the app shells out to git, codex and claude code) can make those tools load the AppImage's bundled libraries and crash. A deb runs from a normal install path with a clean environment.

A deb covers the Debian family (Ubuntu, Mint, Debian and derivatives). Fedora, RHEL, openSUSE and Arch are not Debian-family and are not a supported desktop target. The CLI (`redu`) is a self-contained binary that already runs across those distributions for users who need it.

## How the update feed is produced

electron-builder treats deb as an auto-update-capable Linux target. A deb-only build writes the Linux update feed (`latest-linux.yml` for x64, `latest-linux-arm64.yml` for arm64) with the deb as the update artifact.

The release workflows upload only the deb, the matching update feed and the generated third-party notices to the GitHub Release.

## How Linux updates work

The desktop app embeds electron-updater. On a deb install it uses `DebUpdater`, which:

1. Reads the update feed from the latest GitHub Release.
2. Downloads the new `.deb` in full (deb updates are not blockmap deltas).
3. Installs it through a graphical privilege prompt (`pkexec` then `dpkg -i`).

This needs a graphical sudo helper (`pkexec`, `gksudo`, `kdesudo` or `beesu`) to be present, which is standard on desktop Ubuntu.

## Release outputs

The Linux release jobs build with `--linux deb`, upload `apps/desktop/release/*.deb` and upload the matching `latest-linux*.yml` feed. They intentionally do not build AppImage or upload Linux blockmap artifacts.
