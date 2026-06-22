# CLAUDE.md

This is the architecture-check tool (`@repo-edu/architecture-check`). It is the
CI-facing owner of source area identity and graph-level boundary rules. It runs
via `pnpm check:architecture` from the workspace root.

## What it checks

`src/main.ts` composes one pass (`runArchitectureCheck`) that returns sorted
violations. Four concerns feed it:

- Area reconciliation (`area-model.ts`): loads and zod-validates the committed
  model, then reconciles it against the source inventory.
- Graph boundaries (`graph-policy.ts` + `dependency-cruiser-runner.ts`):
  projects the area model into dependency-cruiser rules and runs them.
- Bespoke symbol checks (`bespoke-checks.ts`): renderer session-ownership and
  Claude-coder / Claude-agent-SDK confinement that the import graph cannot
  express.
- Source inventory (`inventory.ts`): the single tracked-file list every check
  shares.

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

`inventory.ts` lists tracked `.ts`/`.tsx` files under `apps/*/src`,
`packages/*/src` and `tools/*/src`, excluding generated fixtures, build output,
`node_modules` and vendored runtime notices. The same list feeds reconciliation
and graph projection, so the boundaries match exactly what ships.

## Graph rules

`graph-policy.ts` builds the dependency-cruiser rule set from the area model:
cross-layer boundaries, domain module import order, claude-coder and
claude-agent-SDK source confinement, and a whole-inventory acyclic rule. When an
inventory is supplied the selectors compile to exact per-file patterns, so a
rule breaks the moment a real file crosses a boundary.
`dependency-cruiser-runner.ts` reads `summary.violations` (already
de-duplicated) and adds a workspace-import projection check that flags
`@repo-edu/*` imports resolving outside the inventory.

## Conventions

- Change ownership by editing `src/area-model.json`, not the matchers. Record
  `splitFrom` when splitting an area.
- Keep partition coverage total: every inventory file maps to exactly one
  partition.
- `dependency-cruiser` and `zod` are runtime dependencies; run `pnpm install`
  after pulling a change that adds them.
- Tests live in `src/__tests__/`. `start` runs the tool's own typecheck and
  tests before the scan, so `pnpm check:architecture` validates the checker
  itself.
