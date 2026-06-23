---
title: Source Areas
description: Partitions and covers in the area model, and how to read the area overview for split and redesign triage
---

The codebase is divided into named **areas** of source files. The committed
model lives at `tools/architecture-check/src/area-model.json`, is written by the
AI and checked by CI. It answers three questions at a glance: which area owns
each file, how large each area is, and which cross-cutting concerns spread across
many areas.

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
memory and never written to disk. It shows three things.

1. **Partition treemap**: the partitions grouped by source root (`apps`,
   `packages`, `tools`), each rectangle sized by its lines of code. This is the
   ownership-and-size picture.
2. **Cover concentration**: one stacked bar per cover, segmented by partition.
   This shows whether a concern is owned or scattered.
3. **Cover matrix**: partitions as rows, the covers as columns, an orange bar
   and a count in each cell. This is the drill-down: exactly which partitions a
   cover marks, and how many files.

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
