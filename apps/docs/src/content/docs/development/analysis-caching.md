---
title: Analysis Caching
description: Two-tier cache for analysis and blame results — keys, lifecycle, invalidation, and the as-of pinning escape hatch
---

The analysis pipeline caches both full analysis results (`analysis.run`) and per-file blame output (`analysis.blame`). The cache exists because both are expensive — `git blame` in particular dominates wall time on real student repositories — and because the same inputs produce byte-identical outputs. This page documents the architecture, the key composition, and the invalidation behavior a developer needs to predict.

## Two-tier architecture

Each cache type runs as two layers behind a single `LayeredCache` (`packages/application/src/cache/layered-cache.ts`):

| Layer | Backed by | Lifetime |
|-------|-----------|----------|
| **Hot** | In-memory byte-budgeted LRU | Process lifetime |
| **Cold** | SQLite database at `{storageRoot}/cache/cache.db` | Persists across restarts |

A lookup checks hot first; on miss it falls through to cold and promotes the entry back into hot on the way out. Writes go to both. Budgets per cache type are user-configurable in the Storage pane.

The CLI and the docs/demo runtime do not inject a cache — only the desktop main process wires one up (`apps/desktop/src/main.ts`). Workflow handlers run identically with or without a cache; the cache is an injected port, not a behavior.

## What participates in the keys

Cache keys are composed in `packages/application/src/analysis-workflows/cache-keys.ts`. The full normalization (stable JSON stringify, lowercase/sort/dedupe rules, sentinel substitution for blame argv) is documented inline next to the code; the high-level composition is:

| Cache | Key components |
|-------|----------------|
| Analysis | `repoGitDir` + `resolvedAsOfOid` + canonicalized `AnalysisConfig` + roster fingerprint |
| Blame | `resolvedOid` + `filePath` + canonical blame argv + ignore-revs fingerprint |

`resolvedAsOfOid` (and the blame `resolvedOid`) come from `resolveSnapshotHead`: explicit `asOfCommit` wins; otherwise `config.until` resolves to the youngest commit on or before that date; otherwise repository HEAD. The same OID drives every per-file blame call within a single analysis run.

Two design choices are worth singling out because they change the hit rate in ways the keys alone do not reveal:

- **Blame keys deliberately omit `repoGitDir`.** Two clones of the same origin at the same OID produce byte-identical blame, so two student forks with the same upstream commit share blame entries. Without this, the cold cache would lose its entire value for cohorts of forks.
- **No-roster and empty-roster canonicalize identically.** A repo opened standalone and a repo opened against a course whose roster matched zero members both fingerprint as `"no-roster"`. Attaching a non-empty roster later produces a different fingerprint and forces recomputation.

## Lifecycle

The cache has no proactive invalidation. Entries persist until something explicitly removes them.

**Switching repos within a search root.** Nothing is invalidated. The renderer per-repo UI state is preserved in an in-memory `repoStates` map; the underlying cache entries are shared across all repos and stay put.

**Opening a different search root.** Nothing is invalidated. Both layers are global to the desktop process and the SQLite database. The renderer per-repo UI state is dropped for repos in the abandoned root, but if the user later points at one of those repos again the cache will still serve it.

**App restart.** The hot LRU dies with the process; SQLite persists. The first analysis after restart pays a cold-only lookup, which is still cheap relative to running `git blame`.

**New commit on top of HEAD.** HEAD advances, `resolvedAsOfOid` changes, and every key composed from it misses. Analysis recomputes in full. Blame recomputes for **every file**, including files the new commit did not touch — blame is keyed per-file by the snapshot OID, not by the file's last-touching commit. The stale entries under the prior OID stay in both layers until evicted by budget.

**Pinning to a fixed commit.** Setting `asOfCommit` (or a `config.until` date that resolves to the same OID) bypasses HEAD movement. Re-running the same analysis as-of the same commit is a full cache hit even after upstream pushes.

**Schema-version mismatch.** The SQLite database carries a `user_version` field. On open, a mismatch triggers a wholesale recreation of the database — there is no migration path. This is deliberate: cached results are regenerable from the repository, and supporting migrations across schema bumps would cost more than it saves.

**Manual clear.** The Settings → Storage pane's "Clear cache" button calls `cache.clearAll`, which empties both the hot LRU and the SQLite tables for both cache types.

## Surface in the UI

The Storage pane (`packages/renderer-app/src/components/settings/StoragePane.tsx`) is the user-visible surface:

- A toggle to enable or disable caching entirely.
- Per-type byte budgets (`analysisMB`, `blameMB`).
- Live cache statistics (entry count, byte size, hit rate per layer per type).
- A "Clear cache" action that drops everything.

There is no per-repo cache management. The granularity offered to users is per-cache-type, not per-repo.

## See also

- [Architecture](/repo-edu/development/architecture/) — overall ports-and-adapters layout
- [`cache-keys.ts`](https://github.com/repo-edu/repo-edu/blob/main/packages/application/src/analysis-workflows/cache-keys.ts) — per-key normalization rules
- [`layered-cache.ts`](https://github.com/repo-edu/repo-edu/blob/main/packages/application/src/cache/layered-cache.ts) — hot/cold layer implementation
- [Settings & Courses](/repo-edu/user-guide/settings/) — user-facing storage and cache controls
