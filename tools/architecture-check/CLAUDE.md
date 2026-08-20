# CLAUDE.md

This is the architecture-check tool (`@repo-edu/architecture-check`). It is the
CI-facing owner of source area identity and graph-level boundary rules. It runs
via `pnpm check:architecture` from the workspace root.

## What it checks

`src/main.ts` composes one pass (`runArchitectureCheck`) that returns sorted
violations. Six concerns feed it:

- Area reconciliation (`area-model.ts`): loads and zod-validates the committed
  model, then reconciles it against the source inventory.
- Graph boundaries (`graph-policy.ts` + `dependency-cruiser-runner.ts`):
  projects the area model into dependency-cruiser rules and runs them.
- Bespoke symbol checks (`bespoke-checks.ts`): renderer session-ownership and
  Claude-coder / Claude-agent-SDK confinement that the import graph cannot
  express.
- Repository checks (`repository-checks.ts`): package manifest and export-source
  validation, Node test-runner imports, production-to-test import rejection,
  Node built-in exclusion from browser-safe runtime closures and desktop
  runtime-external source, manifest and catalog ownership.
- Product process launches (`product-process-launch-inventory.ts`,
  `product-process-launch-syntax.ts` and `product-process-launches.ts`):
  reconciles every product runtime process entry against its child-process
  lifetime launch owner: a platform adapter or a Codex SDK host process. It
  includes the packaged CommonJS launcher and rejects unregistered Node, Bun,
  Deno and dependency-owned launch paths.
- Source inventory (`inventory.ts`): one raw current-worktree listing plus the
  selected source list and set that every check shares.

## Area model

The committed model is `src/area-model.json` (schema version 1). It has two
kinds of area:

- Partition areas tile the source inventory exactly once and define the primary
  owner of each file. They feed the dependency-cruiser boundary rules. Members
  are patterns only; literal file members are rejected.
- Cover areas may overlap the partition and record cross-cutting concerns for
  audit and drift. They never create graph boundaries. Their IDs use the
  `cover-` prefix.

`splitFrom` records lineage when one area is split out of another. The schema
rejects duplicate IDs, self-references, cross-kind parents and lineage cycles.
Reconciliation fails when a file matches zero or many partitions, when a
partition matches no file, or when a cover member is stale.

## Source inventory

`inventory.ts` lists current `.ts`/`.tsx` files under `apps/*/src`,
`packages/*/src` and `tools/*/src`. It combines tracked files that still exist
with non-ignored untracked files, so checks work before staging. It excludes
build output, `node_modules` and vendored runtime notices.
The same list feeds reconciliation and graph projection, so the boundaries
match the worktree being checked.

The inventory also retains the raw worktree listing. Manifest and test-runner
checks consume that value. They must not re-read Git and create a second view of
the worktree.

## Graph rules

`graph-policy.ts` builds the dependency-cruiser rule set from the area model:
cross-layer boundaries, domain module import order, private plan implementation
tool confinement, claude-coder and claude-agent-SDK source confinement, and a
whole-inventory acyclic rule. When an inventory is supplied the selectors
compile to exact per-file patterns, so a rule breaks the moment a real file
crosses a boundary.
`dependency-cruiser-runner.ts` reads `summary.violations` (already
de-duplicated), exposes normalized dependency metadata for runtime-closure
checks, and adds a workspace-import projection check that flags `@repo-edu/*`
imports resolving outside the inventory.

Browser-safe closure checking starts from the desktop renderer entry and every
production file in each independent browser-safe root. It follows runtime
dependencies transitively. It rejects Node built-ins and production imports of
test sources. Package export wildcards follow Node string substitution, so `*`
may span `/`.

## Conventions

- Change ownership by editing `src/area-model.json`, not the matchers. Record
  `splitFrom` when splitting an area.
- Keep partition coverage total: every inventory file maps to exactly one
  partition.
- Report malformed workspace manifests as violations. Do not let one invalid
  JSON file abort the rest of the architecture pass.
- Keep the process-launch inventory exact. A product source that gains or loses
  a process mechanism must update the inventory and name its launch owner.
- `dependency-cruiser` and `zod` are runtime dependencies; run `pnpm install`
  after pulling a change that adds them.
- Tests live in `src/__tests__/`. `start` runs the tool's own typecheck and
  tests before the scan, so `pnpm check:architecture` validates the checker
  itself.
