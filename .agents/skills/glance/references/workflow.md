# Glance workflow

One launcher, the Claude command `.claude/commands/glance.md`, which carries
only what is specific to it and points here for the rest. Where the launcher
and this file disagree, this file is right. There is no Codex skill beside this
file, because Claude runs every phase the user reads.

The glance runs after every planning or plan-scoped implementation-audit round that finished. It
answers one question: has the commit record moved far enough that the
trajectory watch would read it differently than last time? The watch is two
whole sessions that read the log and then the code behind it, and most rounds
do not move the record that far. The glance is the cheap check that keeps the
watch from running on every round.

The user directed this on 2026-09-13. Until then the watch ran only when they
thought of it, which is the cadence this replaces.

## Boundary

You are not the watch. Do not compute the Trajectory diagnostic, grade the
episode, name a drifting abstraction or suggest a response class. Read commit
subjects, read the watch's own history, answer, and stop.

Read only these two things:

- `git log` for the current repository, subjects only, as far back as the rules
  below need
- the watch record in the cache root the invocation names

Do not open a commit body, a source file, a plan, a report or a round file. If
you find yourself wanting one, the answer is that a watch is due; that is what
the watch is for.

You are strictly read-only except for nothing at all: the glance writes no
file, not even the record. The watch phase owns the record.

## Input

The invocation names the cache root, which is
`${XDG_CACHE_HOME:-~/.cache}/audit-round` unless a test points it elsewhere.
The watch record is `watch.json` inside it, an object keyed by episode stem:

```json
{
  "desktop-application-architecture": {
    "heads": {
      "repo-edu": "06c653b5",
      "plan": "b86dd22"
    },
    "grade": "amber",
    "horizon": 3,
    "written": "2026-09-13"
  }
}
```

Use the checkout paths in the phase prompt to identify the working repository,
`repo-edu` or `plan`. Read only that repository's entry in `heads` when
counting distance. Never compare a commit from the peer repository with this
repository's log. The grade and horizon describe the joined episode.

A missing file, a missing stem or repository entry or an unreadable file is not an error. It means
the watch has never run on this episode here, and the rules below say what to
do then.

## Episode

Derive the episode stem the way the watch does, from HEAD alone: take the most
recent `<file-stem>/` subject on HEAD and normalise it to its topic, reading a
bare `<topic>`, `plan-<topic>` or `topology-<topic>` prefix as one topic. When
HEAD carries no such subject, the episode is the unstemmed recent history and
its key is `-`.

This is a cheaper scoping than the watch's. The watch joins both repos and
walks the artifact set; you only need a key to count against, and the stem on
HEAD is enough for that.

## The rule

Count the commits that changed files since this repository's recorded sha, excluding the
audit-round record commits whose subject carries an `impl-audit-` role token,
the same exclusion the repeated-fix gate makes. Call that count the distance.

Answer due when any one of these holds:

1. No record exists for this episode. The first round after a watch was never
   run always earns one.
2. The recorded grade is `red`. A conclusive flag is re-read every round until
   the user acts on it and the record moves.
3. The recorded grade is `amber` and the distance has reached the recorded
   horizon, counted in commits.
4. The recorded grade is `green` and the distance has reached eight. Green says
   there was no near-term need, not that the episode is finished.
5. The distance includes a subject whose severity sequence carries an
   uppercase `A`, whatever the record says. In a planning record this names
   a shape concern; in an implementation record it names an A-tier concern
   a user can meet. Either is a trajectory event on its own.
6. The distance includes three or more subjects carrying `growth-high`, or two
   or more carrying a `!` with an uppercase `B`. Either is a run the watch
   should read while it is forming.

Answer not due otherwise.

These numbers are thresholds the glance applies without the user, so they are
prescribed here rather than left to judgement. They are deliberately loose: the
cost of a watch that finds nothing is one round's worth of reading, and the
cost of a missed one is the drift the user asked to stop meeting by intuition.

## Output

Say in one or two sentences what the record held, how far the log has moved and
which rule decided. Name the episode stem and the distance. Write no file.

## Runner result

When the prompt identifies an unattended round phase, follow the
audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. A finished glance reports `file` as null and puts its answer in `due`,
`true` when a watch is due and `false` when it is not. An unreadable cache root
is not a failure: treat it as a missing record and answer `true`. Report
`failed` only when you cannot read `git log` at all, with the reason.
