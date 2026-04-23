# CLAUDE.md

Node.js implementations of the runtime ports defined in `@repo-edu/host-runtime-contract`.

## Purpose

Concrete side-effect layer for desktop and CLI hosts. Each factory returns a plain object satisfying its port interface.

- `createNodeHttpPort()` — `globalThis.fetch`-based `HttpPort`
- `createNodeProcessPort()` — `child_process.spawn`-based `ProcessPort` with SIGTERM cancellation
- `createNodeGitCommandPort(processPort?)` — `GitCommandPort` wrapping `ProcessPort`, calls system `git`
- `createNodeFileSystemPort()` — `FileSystemPort` using `node:fs/promises` (inspect, batch operations, temp directories)
- `createNodeLlmPort()` — `LlmPort` backed by `@anthropic-ai/claude-agent-sdk`; API key sourced from the SDK's environment/OAuth resolution

## Rules

- Node-only package — never import from browser-safe packages (`renderer-app`, `docs`).
- Side effects belong here, not in domain or application.
- `createNodeGitCommandPort` accepts an optional `processPort` for testability.
