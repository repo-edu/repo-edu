---
title: GitHub Authentication
description: Wiring a fine-grained GitHub token into GH_TOKEN so both your terminal and GUI development tools can reach it on macOS
---

Development against GitHub needs a credential reachable from two places: your terminal, and the GUI tools you run while developing. On macOS those two environments are wired differently, which is the main thing this page sorts out. The recommended setup is a fine-grained personal access token exposed through `GH_TOKEN`.

## Put a fine-grained token in `GH_TOKEN`

Create a fine-grained personal access token on GitHub, scoped to the repositories and permissions you actually need (read-only is enough for browsing repository and pull request state). Export it as `GH_TOKEN` from `~/.zshenv`:

```bash
# ~/.zshenv
export GH_TOKEN=github_pat_xxx
```

Use `~/.zshenv`, not `~/.zshrc`. `~/.zshrc` is sourced only by interactive shells, so login and non-interactive shells skip it, and those are exactly the shells that tools and GUI apps spawn for their subprocesses. `~/.zshenv` is sourced by every `zsh` invocation, so the token reaches all of them. Keep the export beside the other environment exports (`PATH`, Homebrew, pnpm).

## Prefer `GH_TOKEN` over the gh keyring

The GitHub CLI can also store a credential in the system keyring via `gh auth login`. For a fine-grained token the GitHub CLI documentation steers you away from that: `gh auth login --with-token` is designed for classic tokens, and `gh` cannot read a fine-grained token's scopes once it is in the keyring, which produces confusing behaviour. Keep the token in `GH_TOKEN` and leave the keyring empty.

Two things follow from that choice:

- While `GH_TOKEN` is set, `gh auth login` and `gh auth logout` refuse to modify the keyring. Run any keyring command with the variable cleared for that invocation: `env -u GH_TOKEN gh auth status`.
- A leftover, invalid keyring entry makes `gh auth status` exit non-zero even when `GH_TOKEN` itself is valid, and some tools read that as an authentication failure. Clear stale entries with `env -u GH_TOKEN gh auth logout -h github.com -u <account>`.

Confirm the token is the one in use:

```bash
gh auth status      # shows "Logged in to github.com account <user> (GH_TOKEN)"
gh api user -q .login
```

## Let GUI apps see the token on macOS

An app launched from the Dock, Finder or Spotlight inherits the `launchd` session environment rather than your shell configuration. It does not see `GH_TOKEN` from `~/.zshenv`, so any `gh` or git-over-HTTPS call it makes falls back to the empty keyring. The visible symptom is a GUI tool reporting that GitHub authentication has expired, while the same `gh` command works fine in your terminal.

Push the token into the GUI session for the current login:

```bash
launchctl setenv GH_TOKEN "$GH_TOKEN"
```

then fully quit (Cmd+Q) and relaunch the app so it inherits the value.

To make that survive reboots, add a per-user LaunchAgent that re-runs the same command at every login. Save this as `~/Library/LaunchAgents/local.gh-token.plist` (the label is arbitrary; keep the filename and the `Label` in sync):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>local.gh-token</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/zsh</string>
		<string>-lc</string>
		<string>launchctl setenv GH_TOKEN "$GH_TOKEN"</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
</dict>
</plist>
```

The agent runs a login shell, which sources `~/.zshenv` and reads the token from the one place it already lives, so the plist stores no secret and rotating the token stays a single edit to `~/.zshenv`.

Load it without rebooting, and confirm the agent (not the earlier manual `setenv`) is what provides the value:

```bash
launchctl bootout gui/$(id -u)/local.gh-token 2>/dev/null
launchctl unsetenv GH_TOKEN
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.gh-token.plist
launchctl getenv GH_TOKEN     # prints the token
```

If an app is set to reopen automatically at login it can occasionally start before the agent runs; if the authentication warning shows right after a reboot, relaunch the app.

## Where repo-edu uses a GitHub token

The GitHub integration suite authenticates against the live API; see [Building](/repo-edu/development/building/) for its commands and token requirement. Those tests create and remove repositories, so they need write access to the target organisation, which a read-only browsing token does not grant. Use a separate token with the required scope for that work.
