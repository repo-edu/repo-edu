---
title: Architecture Check
description: The architecture-check tool, the area-model.json artifact, how source-area boundaries are enforced and how to change ownership
---

`tools/architecture-check` is the CI-facing owner of source-area identity and
graph-level boundary rules. It runs from the workspace root with `pnpm
check:architecture`, and it is the tool that gives the [Source
Areas](/repo-edu/development/area-model/) model its teeth. Read the Source Areas
page first for the partition and cover concepts; this page is the tool that
enforces them and the file you edit to change ownership.

## What it checks

`src/main.ts` composes one pass, `runArchitectureCheck`, that returns sorted
violations. Four concerns feed it.

1. **Area reconciliation** (`area-model.ts`). Loads and validates the committed
   `area-model.json`, then reconciles it against the source inventory. It fails
   when a file matches zero partitions, when a file matches more than one
   partition, when a partition matches no file, or when a cover member is stale.
2. **Graph boundaries** (`graph-policy.ts` + `dependency-cruiser-runner.ts`).
   Projects the area model into dependency-cruiser rules and runs them:
   cross-layer boundaries, domain module import order, claude-coder and
   claude-agent-SDK source confinement, and a whole-inventory acyclic rule. It
   also flags `@repo-edu/*` imports that resolve outside the inventory.
3. **Bespoke symbol checks** (`bespoke-checks.ts`). Renderer session-ownership
   and claude-coder confinement that the import graph cannot express on its own.
4. **Source inventory** (`inventory.ts`). The single tracked-file list every
   check shares: tracked `.ts` and `.tsx` files under `apps/*/src`,
   `packages/*/src` and `tools/*/src`, minus generated fixtures, build output,
   `node_modules` and vendored notices.

Because reconciliation and the graph rules read the *same* inventory, the
boundaries CI enforces match exactly the files that ship.

## How boundaries are enforced

The enforcement is a lint, not a compiler feature. TypeScript and pnpm know
nothing about partitions. Inside one package a file can import across a partition
line and still compile, type-check and bundle. Only dependency-cruiser, run by
this tool in CI, rejects it. That is what makes a sub-package boundary possible
at all: the language's finest boundary is the package, so partitions are drawn
one level finer and enforced by the check. See [the enforcement
model](/repo-edu/development/area-model/#how-each-boundary-is-enforced) on the
Source Areas page for the package-versus-partition-versus-cover gradient.

## The area-model.json artifact

The committed model is `tools/architecture-check/src/area-model.json`, schema
version 1. It is one array of areas. Each area has an `id`, a `name`, a `kind` of
`partition` or `cover`, a list of `members`, and an optional `splitFrom`.

```json
{
  "id": "pkg-domain",
  "name": "Domain model",
  "kind": "partition",
  "members": [{ "type": "pattern", "path": "^packages/domain/src/" }]
}
```

Members are path patterns, written as dependency-cruiser-compatible regular
expressions over POSIX paths. A partition's members must be patterns: literal
file members are rejected, so ownership stays expressed as rules, not file lists.
A cover may name files more freely, but every cover pattern must still match at
least one real file. The schema also rejects duplicate ids, self-references,
cross-kind parents and lineage cycles.

`splitFrom` records lineage: when one area is carved out of another, the child
records the parent it came from. This is how the model remembers, for example,
that the renderer feature partitions were split out of the renderer app rather
than created from nothing.

## Changing ownership

You change architecture by editing `area-model.json`, never by editing the
checker's matchers. Three rules keep the model honest, and CI enforces all
three.

- **Keep partition coverage total.** Every inventory file must map to exactly one
  partition. Adding a tracked source file under `apps/*/src`, `packages/*/src` or
  `tools/*/src` means assigning it to a partition in the same change. If no
  existing partition owns it, add or extend one.
- **Record a split.** When you split a partition, give each child its `members`
  and set `splitFrom` to the parent. The patterns must still tile the same files
  with no gap and no overlap.
- **Keep covers non-stale.** A cover pattern that matches nothing fails
  reconciliation, so remove or repair patterns when the files they tracked move
  or disappear.

Run `pnpm check:architecture` to validate a change. The tool runs its own
type-check and tests before the scan, so the command validates the checker as
well as the model.

## Why dependency-cruiser, not a boundary framework

The enforcement engine is bought, the semantic layer is built. The import graph
and declarative boundary rules come from `dependency-cruiser`: it is TS-native,
monorepo-aware and emits the graph as data, which the drift and reconciliation
reporting needs.

Two established alternatives were evaluated and rejected for this role.
`eslint-plugin-boundaries` can enforce element boundaries inside ESLint but does
not own the whole import graph as a reportable data product, so reconciliation
would need a second graph owner. `@nx/eslint-plugin enforce-module-boundaries`
fits an Nx project graph and tag model, while repo-edu is a plain pnpm monorepo
whose area model is a committed file, so adopting it would move the boundary
vocabulary into Nx tags instead of the area map. The decision reopens only if a
needed boundary rule proves inexpressible in dependency-cruiser's grammar, or if
repo-edu adopts Nx as its project graph.

So `area-model.json` plus this tool is a thin semantic layer over a bought
engine, not a hand-rolled boundary checker.
