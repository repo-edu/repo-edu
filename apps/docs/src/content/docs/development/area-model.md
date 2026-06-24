---
title: Source Areas
description: Partitions and covers in the area model, and how to read the area overview for split and redesign triage
---

The codebase is divided into named **areas** of source files. The committed
model lives at `tools/architecture-check/src/area-model.json`, is written by the
AI and checked by CI through the [Architecture
Check](/repo-edu/development/architecture-check/) tool. It answers three
questions at a glance: which area owns each file, how large each area is, and
which cross-cutting concerns spread across many areas.

The model has two kinds of area, and the difference between them is the key to
everything else on this page.

## Partitions and covers

**Partitions** own files outright. Every tracked source file belongs to exactly
one partition. The partitions tile the whole codebase with no gaps and no
overlap, so a partition is the single owner of each file it holds. Partitions
drive the dependency-cruiser boundary rules.

**Covers** mark a concern that runs across the codebase, such as the analysis
workflow or the LLM runtime. A cover pulls in files from many partitions, one
file can sit in several covers, and a cover owns nothing. Covers never create
boundaries. They only label, for audit and overview.

So a file always has one partition, and zero, one or several covers.

## Partitions and packages

A partition is not the same as a package, and the difference matters. A package
is a build and dependency unit: a workspace member with its own `package.json`,
version and public `exports`, the thing other code imports as `@repo-edu/x`. A
partition is an ownership unit defined by path patterns. They have different
natural sizes.

Most packages map one to one to a single partition. Two do not. `renderer-app`
is one package split into seven partitions, one per feature area (session,
analysis, examination, groups, settings, shell, persistence). The `release` tool
is one package split into two. A partition never spans more than one package and
never crosses a source root, so the grain is package, or finer. The relation is
`source root` contains `package` contains `partition`.

Why not refactor those packages so each partition becomes its own package?
Because a package is a *consumption* boundary and a partition is an *ownership*
boundary. Nothing consumes the analysis tab on its own; the desktop and docs
apps mount the whole renderer. Splitting it into seven packages would create
seven build units that are always used together, with their own manifests and
version coordination, for no consumer that benefits. The boundary you want is
already enforced finer than the package, so promotion to a real package is
reserved for a partition that earns it: an independent consumer, independent
versioning or a hard runtime isolation. That is exactly why the `*-contract`
areas *are* separate packages, while the renderer features are not.

## How each boundary is enforced

The three kinds of boundary are enforced by different machinery, with different
strength.

- **Package** is structural. The resolver, pnpm's isolated `node_modules`, the
  package `exports` and the TypeScript build all cooperate, so an import of a
  package you do not depend on cannot even resolve. The boundary is part of the
  toolchain.
- **Partition** is a lint. TypeScript and pnpm are blind to it: inside one
  package a partition-crossing import compiles, type-checks and bundles. Only
  dependency-cruiser, run by [Architecture
  Check](/repo-edu/development/architecture-check/) in CI, rejects it. The code
  runs regardless; the check is what fails.
- **Cover** is only checked for staleness. It creates no import rules at all.
  The single check is that each of its patterns still matches a real file.

That gradient is the point. TypeScript and pnpm cannot express a boundary finer
than a package, so partitions exist as a separate, lint-enforced layer to draw
the ownership lines the language cannot.

## Why partitions are complete but covers are not

Partitions and covers carry different promises, and the difference is easy to
trip over.

Partition coverage is **total**. CI fails unless every file maps to exactly one
partition, so partition ownership is complete and verified.

Cover coverage is **partial by design**. A cover only marks the files for one
concern, and most of the codebase takes part in no tracked concern at all. This
is why, in the overview matrix, most partitions have no cover membership: the
covers were never trying to reach those files. An area with no cover is normal,
not a gap.

If the covers did reach every file, they would be partitions, not covers.

## Where covers come from

Covers are hand-authored. Each one is a name plus a list of path patterns that
select the files belonging to that concern. Nothing derives them. Someone decided
a concern was worth tracking and wrote the patterns.

The model currently defines three covers, the product's real end-to-end
concerns:

- **Analysis workflow**: analysing student repositories, from the domain rules
  through the application workflow to the renderer tab.
- **Examination workflow**: grading submissions, across the same layers.
- **LLM runtime**: the AI capability both workflows ride on, spanning the LLM
  integration packages, the fixture engine and the settings that drive them.

These three are an editorial choice, not a fact of the code. You could define
seven completely different covers, for example `credentials`, `tests` or
`build-tooling`. The only hard rules are that each pattern must match at least
one real file (a stale pattern that matches nothing fails reconciliation, the
same check CI runs) and that covers never create dependency boundaries.

Useful covers track concerns that genuinely cut across the partition. A random
set would not.

## The area overview

`pnpm area-view` renders the model as a single browser page, served once from
memory and never written to disk. It shows four things.

1. **Source map**: a treemap nested `folder/` → `package/` → `partition`, sized
   by lines of code. Every package is drawn as a labelled frame: a one-partition
   package holds a single area, a split package (such as `renderer-app`) holds
   several inset inside it, so the package boundary is always visible. A legend
   keys the source-folder, package and partition edges, and each area's tooltip
   names its package and size. This is the ownership-and-size picture.
2. **Cover concentration**: one stacked bar per cover, segmented by partition.
   This shows whether a concern is owned or scattered.
3. **Cover matrix**: partitions as rows, the covers as columns, an orange bar
   and a count in each cell. This is the drill-down: exactly which partitions a
   cover marks, and how many files.
4. **Files by partition**: a collapsed list, one row per partition, expanding to
   its files as package-relative paths. This is the only per-file detail in the
   view; everything else stays at area level.

The matrix omits partitions that no cover marks, since those rows would be empty
(see the completeness asymmetry above). It reports declared membership: it shows
what the model says, it does not prove a cover includes every file in its
concern.

## Reading it for triage

The overview is read-only. It surfaces present-state structure so a human can
judge where splitting and redesign effort should go. Two signals live in the
cover data, and they are mirror images of each other.

### Homeless concerns point to redesign

A concern **has a home** when most of its files live in one partition, so one
area clearly owns it. A concern is **homeless** when its files are spread thin
across many partitions, so no single area owns it and it leaks everywhere.

The concentration bar shows this directly. A bar with one or two fat segments is
a concern with a home. A bar fragmented into many thin segments is a homeless
concern. A homeless concern is a **redesign candidate**: it may be worth pulling
into one owner. The per-cover stat line reports this as the number of partitions
the cover touches and the share held by its largest partition. Few partitions
and a high top share mean a home, many partitions and a low top share mean
smear.

### Overloaded areas point to a split

Now read the same matrix the other way. A partition that belongs to **several
covers** is carrying several cross-cutting jobs at once. If one area is part of
the analysis workflow and the examination workflow and the LLM runtime, it is
doing three jobs, which is a sign it should be **split** so each job gets its own
area. Each matrix row shows a small count of how many covers the partition sits
in. Two or more is a split candidate.

| Read this way | What it flags | Action |
|---|---|---|
| A cover spread across many partitions | The concern has no clean home | Redesign: give it one owner |
| A partition that sits in several covers | The area is doing several jobs | Split: one area per job |

The first looks at one concern spread over many areas. The second looks at one
area pulled into many concerns. Both fall out of the same cover data, read in two
directions.

The view supports the decision, it does not make it. The AI reads what the
structure shows and proposes split, redesign or leave, and the user owns the
call.
