# Watch

This file describes the watch that follows a round: the glance that decides whether it is due, the
watch record and the episode evidence. Read
[`glossaries/audit-round.md`](../../../glossaries/audit-round.md) and the runner's
[CLAUDE.md](../CLAUDE.md) first. See [Ownership](ownership.md) for the source files.

## Watch

`runWatch` in `round.ts` owns the watch that follows a round. The glance decides from the commit
record and the watch's own history whether a watch is due, and only a due glance runs `watch` to
return the finished document and grade.

**When it runs.**

- The watch runs only after a plan round with audit findings that finished, because a round
  awaiting a ruling has not proved its work landed. Nothing is lost, since the glance counts audit
  correction commits and not rounds.
- A clean audit never calls the glance. Commit targets run without a glance or a watch.
- A round given no watch target, which is what `--no-watch` does, consults no glance at all.
- The glance is a dependency the runner supplies from `glance.ts`, not a phase, so a not-due round
  starts no session for it.

**What it reads.** The audited plan's stem comes from `planStem` and selects both the glance
record and the joined watch evidence. Only a due glance computes and formats the Git episode and
the plan's existing round-kind data files, once after the fix. The watch reads the Git record and
retained round data, so `runWatch` passes it no transcript or audit report. Only the writer's
prompt receives the snapshot, separately from its empty phase-argument list.

**Who writes it.** The watch writer owns both the judgement and the final wording. `watchPhase`
reads the writer through `auditRoles`, by the round's work class: its assistant, model and effort
are the `watch` field of the target work class's audit level, so planning and implementation
rounds may run different watch writers. The watch runs once the transcript holds the round.

**The result.** The assistant boundary validates the watch's document and grade.
`runWatch` publishes a finished watch even when its session compacted.

1. It saves the document in the round's `-watch.md` file. The runner also shows the
   document in the terminal and transcript.
2. It atomically replaces only its episode's cadence entry. A failed document write skips the
   record write. A failed record write leaves the valid document and the earlier record in place.

A finished round reports the returned grade. The command runner ends the auditor sequence on red,
so no queued round starts before the user acts on the watch.

### Glance

`glance.ts` decides from an episode and the watch record whether the trajectory watch is due. The
thresholds are code because they apply without the user in the loop.

**What counts.**

- Each file-changing audit correction commit for the selected plan counts once per area with an
  A–C correction, across all step scopes. Repo Edu groups by finding area and planning groups by
  finding section.
- D-only work, clean records, deferral-only records and planned steps do not count.
- Off-plan work and other plans' audits remain watch evidence but do not advance the count.
  Otherwise maintenance work could trigger a watch on the first audit of a new step scope.
- A subject the grammar refuses or an unreadable finding set supplies no correction count. The
  episode retains the unreadable evidence.

**Thresholds.** Green waits for three audit correction commits in one area. Amber and red wait for
two. Red has no early trigger, because the runner already stops the sequence on it, so the user
has acted before a next round can run. Severity, reach and growth have no early trigger.

**The episode.** The episode uses a supplied topic from the audited plan for every runner glance.
The episode reader also serves hand-run default-topic resolution.

The decision's sentence opens its own section of the log and the terminal as `[glance]`.

### The watch record

The watch keeps its own history in `watch.json` in the shared cache, which is how its cadence
survives between rounds. The watch workflow and the shared grammar own the file's shape.
`resolveCacheRoot` in `startup.ts` is the one owner of where the cache lives, so the update stamps
and the watch record resolve the same way.

- Each episode records both repositories' graded heads beside one grade and written date.
- The glance counts from the plan head for planning rounds and from the Repo Edu head for
  implementation rounds.
- The record is read as data: a missing, unreadable or old-format entry, or a recorded head off
  HEAD's history, is no record.
- No record reads as green and counts from the episode's anchor, the earliest commit carrying the
  stem. Unstemmed history has no eligible audits, so a first round never earns a watch by being
  first.
- `glance.ts` atomically writes the cadence entry that `round.ts` has admitted, for the runner's
  sequence decision. `round.ts` orders that write after the admitted document.

### Episode evidence

`episode.ts` owns episode membership and history facts for the glance and the joined watch
evidence. No episode file is written.

- It joins both repos' commits under the plan's stem, includes rework touching the topic's
  artifacts and retains both repositories' heads and anchors.
- `episode-log.ts` reads Git's commit dates, bodies, touched paths and renames.
- `episode-facts.ts` checks body finding counts against subject severity. It derives episode-level
  token counts and repeated-growth evidence without grading them.
- Every member keeps its complete findings or an unreadable reason. Unreadable findings contribute
  no partial counts.
- Current areas resolve directly and retired areas resolve through `splitFrom`. An unknown location
  stays on its original finding.
- Redesigns and widening renames mark their commits as possible new graded windows for the watch
  to judge.

`readWatchEvidence` joins both histories with the plan's existing planning and implementation
round data. `formatWatchEvidence` projects that into one indented view:

- the repositories, their heads, anchors, episode-level counts and runs;
- each commit's six-character SHA, date, written subject, window candidate, unreadable reason and
  finding prefixes through their titles;
- each round's identity, landed commits, status, applicable findings and phase compaction counts;
- at the joined top level, token counts and repeated-growth evidence across both repos, where
  repeated-growth commits use short `plan@` or `repo-edu@` SHAs.

It returns that serialised view beside the two typed heads from the same projection. The runner
uses both, while the hand-run [episode](commands.md#episode) command pages only the view.
