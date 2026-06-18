---
title: CLI Distribution
description: Why the redu CLI ships on macOS and Linux only
---

The `redu` CLI is distributed as a self-contained Bun-compiled binary on macOS and Linux. The release pipeline does not build or attach a Windows CLI artifact.

## Distribution model

The CLI keeps horizontal consistency across its supported platforms: the same shell installer fetches a release binary, installs it on `PATH`, installs the matching third-party notices and leaves `redu update` to self-update later. This is the same broad shape used by CLI-first tools such as rustup, Deno and Bun.

Vertical consistency with desktop packaging was rejected. The desktop ships as a DMG on macOS, a deb on Linux and NSIS on Windows, but those wrappers are GUI-app distribution formats. A CLI belongs on `PATH`, and a DMG is not a useful CLI delivery mechanism.

## macOS

macOS keeps the Bun-compiled CLI binary. It is signed and notarized during the same release signing session as the desktop app, so keeping macOS CLI signing does not add a separate credential path.

## Linux

Linux keeps the Bun-compiled CLI binary. Bun's compiled binary has a glibc floor, but the supported Linux desktop audience is already modern Debian and Ubuntu because the desktop ships as deb only. Alpine and musl distributions are not release targets.

A deb-wrapped CLI was considered and rejected. A deb would be only a delivery wrapper, not a runtime solution. A Node-based deb would swap the Bun glibc floor for a Node version floor, and the CLI uses `node:sqlite`, which requires a newer Node than many distribution repositories provide.

## Windows

The Windows CLI is removed because its only artifact was a Bun `--compile` single-file `.exe`, and single-file executables that embed a language runtime are a poor fit for Windows Defender heuristics.

This is different from the Windows desktop problem. The desktop's unsigned NSIS installer primarily pays a SmartScreen first-install cost, and the auto-updater avoids browser Mark-of-the-Web for later updates. The CLI's single-file `.exe` risk is Defender AV, which is a separate engine. Signing is the cost being removed from the project, and winget addresses the SmartScreen download path rather than Defender scanning. See [Windows Distribution](/repo-edu/development/windows-distribution/) for the desktop side.

## Release enforcement

The release workflows build CLI artifacts only for `darwin-arm64`, `linux-arm64` and `linux-x64`. The release license gate also models CLI platforms separately from desktop platforms, so a Windows CLI build cannot reappear without changing the CLI platform contract.
