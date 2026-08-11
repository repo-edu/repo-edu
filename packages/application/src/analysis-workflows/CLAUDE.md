# CLAUDE.md

This directory owns analysis workflow orchestration over `GitCommandPort` and
`FileSystemPort`.

## Owners

- `analysis-workflows.ts` assembles snapshot-head, run, blame, repository
  discovery and submission-folder handlers.
- `repo-root.ts` owns the repository locator union. Course-relative paths
  require course clone-target data. Absolute paths must not carry course data.
- `analysis-matchers.ts` compiles one immutable predicate set for an analysis
  invocation through `@repo-edu/domain/pattern-matching`.
- `snapshot-engine.ts` and `snapshot-head-handler.ts` own resolved Git snapshot
  identity. Run and blame handlers consume that settled identity.
- `submission-folder-handler.ts` validates absolute folder roots, admits
  selected relative paths and delegates byte containment to the filesystem
  port.

## Rules

- Do not reuse results across changes to the repository locator, resolved
  snapshot, filters or roster/person inputs. These values are part of the
  analysis input identity.
- Compile filter patterns once per invocation. Return validation issues from
  the domain matcher instead of adding local glob or regular-expression rules.
- Admit relative file paths before calling filesystem ports. The Node adapter
  remains responsible for real-path containment and byte limits.
- Keep cancellation checks around Git and filesystem boundaries.

Blame caching was removed deliberately after measurement showed recompute is
fast enough on representative student-repo cohorts. Do not reintroduce a
persistent cache without first publishing a stress test that demonstrates
user-perceptible latency on a real cohort. A cache would require schema
versioning, normalized keys and invalidation on every behavior change.
