---
title: Windows Distribution
description: Why the Windows desktop app ships as an unsigned NSIS installer attached to each GitHub Release
---

The Windows desktop app is distributed as an unsigned NSIS installer attached to the GitHub Release. The release pipeline builds x64 and arm64 installers, uploads their blockmaps and update feeds, and does not publish a Windows CLI artifact.

## Why unsigned NSIS

The Windows code-signing certificate is intentionally removed from the release path. Keeping it would preserve an expensive credential for only one platform, and signing after electron-builder creates the NSIS blockmap can invalidate the differential-update metadata.

Unsigned NSIS keeps the Windows desktop release path aligned with the existing GitHub Release attachment flow:

1. The platform workflow builds the installer with `CSC_IDENTITY_AUTO_DISCOVERY=false`.
2. The workflow uploads the installer, blockmap, update feed and notices as artifacts.
3. The `release-attach` job attaches those files to the GitHub Release.

No release environment secret is needed for Windows desktop packaging.

## Why winget is not used

winget was evaluated because it can avoid the browser download path that creates the first-install SmartScreen prompt. It was rejected because automated winget submission requires cross-repository write access to `microsoft/winget-pkgs`.

The `wingetcreate` token documentation requires a personal access token classic with the `public_repo` scope and says fine-grained tokens are not supported. GitHub's token documentation explains the relevant limitation: only classic tokens can write to public repositories that the user does not own, and a classic token grants access across the user's public repositories.

That leaves three submission paths, all rejected:

1. A tokenless manual web PR for every release, which adds release work.
2. A personal classic PAT, which gives the release automation account-wide public-repo write scope.
3. A dedicated bot account plus classic PAT, which contains the blast radius but adds another identity to operate.

The project does not take on any of those costs for the current Windows desktop distribution path.

## SmartScreen and Defender

The residual SmartScreen cost is bounded to first install. A browser download receives Mark-of-the-Web metadata, so an unsigned installer downloaded from the GitHub Release can prompt on first run. The desktop auto-updater downloads updates out-of-band, so those update installers are not browser downloads and do not receive the same Mark-of-the-Web metadata.

Windows Defender is separate from SmartScreen and is not bypassed by avoiding Mark-of-the-Web. The residual Defender risk is acceptable for a plain Electron NSIS installer; it is not acceptable for the old single-file Windows CLI binary. See [CLI Distribution](/repo-edu/development/cli-distribution/) for that split.

## Future winget path

If first-install SmartScreen prompts become a real user complaint, winget can be added with a dedicated bot account. That is the only automated winget path that contains the credential blast radius. The reserved package identity is `RepoEdu.RepoEdu` with the `repoedu` moniker.

## References

- [winget-create token command](https://github.com/microsoft/winget-create/blob/main/doc/token.md)
- [GitHub personal access token limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Downloads and the Mark-of-the-Web](https://textslashplain.com/2016/04/04/downloads-and-the-mark-of-the-web/)
