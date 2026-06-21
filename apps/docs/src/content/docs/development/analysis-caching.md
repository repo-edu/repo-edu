---
title: Analysis Execution
description: Current analysis and blame execution behavior, snapshot pinning, and why there is no persistent analysis cache
---

The analysis workflows currently run directly against `GitCommandPort` and `FileSystemPort`. There is no application-level persistent cache for `analysis.run` or `analysis.blame`.

Persistent analysis and blame caching was removed after measurement showed recomputation was fast enough on representative student-repo cohorts. Reintroducing a cache would require a measured stress case and a full correctness plan for key normalization, schema versioning, and invalidation.

## Workflow behavior

`analysis.resolveSnapshotHead` resolves the canonical snapshot OID. `analysis.run` computes log-based repository statistics and a PersonDB baseline from that fixed OID. `analysis.blame` computes per-file blame output from the same fixed OID and applies the PersonDB overlay. `analysis.discoverRepos`, `analysis.listFolderFiles`, and `analysis.readFolderFile` provide the folder/repository browsing support used by the renderer.

Repository inputs are a strict union:

- Course-relative repository paths require clone-target source data.
- Absolute repository paths run without course data.

The handlers use cooperative cancellation for analysis and blame work. The desktop and docs runtimes wire the same handlers; the CLI does not expose the analysis workflows.

## Snapshot Selection

The renderer resolves a stable Git snapshot before running log or blame workflows:

1. `asOfCommit` wins when provided.
2. Otherwise, `until` resolves to the youngest commit on or before that date.
3. Otherwise, repository `HEAD` is used.

The resolved OID is an input to `analysis.run`, `analysis.blame`, and repository examination identity. Pinning `asOfCommit` gives repeatable analysis across later upstream pushes, but it does not create a persistent cache hit.

## Renderer State

The renderer keeps session state so switching between repositories is cheap for the user:

- React Query holds settled discovery, snapshot-head, analysis, and blame results for the renderer session.
- Per-repository analysis view intent is held in memory while the app session is active.
- Syntax highlighting and comment-line classification use component-local `WeakMap` memoization keyed by current blame objects.
- Sidebar preferences, display mode, sort mode, blame options, and analysis concurrency are persisted in app settings.

These are renderer conveniences, not persistent workflow result caches. Closing the app drops the in-memory query data.

## Related Storage

The desktop app does keep a SQLite-backed examination archive at `{storageRoot}/examinations/archive.db`. That archive stores LLM-generated examination records and is separate from analysis execution. It is not used to memoize `analysis.run` or `analysis.blame`.

## Implementation Pointers

- `packages/application/src/analysis-workflows/analysis-handler.ts` — `analysis.run`
- `packages/application/src/analysis-workflows/blame-handler.ts` — `analysis.blame`
- `packages/application/src/analysis-workflows/snapshot-engine.ts` — snapshot resolution
- `packages/application/src/analysis-workflows/CLAUDE.md` — cache reintroduction policy
