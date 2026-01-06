---
layout: home

hero:
  name: repo-edu
  text: Educational Repository Management
  tagline: Streamline student repository workflows with LMS integration
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/repo-edu/repo-edu

features:
  - title: LMS Import
    details: Fetch student rosters and group assignments from Canvas or Moodle. Export to YAML, CSV, or XLSX.
  - title: Repository Setup
    details: Batch create student repositories from templates. Support for GitHub, GitLab, Gitea, and local Git.
  - title: Cross-Platform
    details: Native desktop app for macOS, Windows, and Linux built with Tauri. CLI available for automation.
---

::: warning Pre-alpha Software This project is under active development and not yet ready for
production use. APIs and features may change without notice.:::

## Quick Links

- [Installation](./getting-started/installation.md) — Download and install repo-edu
- [Quick Start](./getting-started/quick-start.md) — Get up and running in minutes
- [User Guide](./user-guide/lms-import.md) — Detailed usage instructions

## CLI

- [CLI Overview](./cli/overview.md) — Command-line interface for automation
- [CLI Installation](./cli/installation.md) — Install the `redu` CLI

## For Developers

- [Architecture](./development/architecture.md) — Technical overview
- [Contributing](./development/contributing.md) — How to contribute
- [Building](./development/building.md) — Build from source
