# Watch workflow

One shared workflow behind two launchers, both Claude commands:
`.claude/commands/watch.md` writes the draft and `.claude/commands/revise.md`
rewrites it. Each launcher carries only what is specific to it and points here
for the rest, so the two cannot drift apart. Where a launcher and this file
disagree, this file is right. There is no Codex skill beside this file, because
Claude writes both passes.

The trajectory watch is a document, written after an automated planning or plan-scoped
implementation-audit round whose glance said a watch was due. It is the document the user decides
from.

## The watch is defined elsewhere

This file owns how the watch runs inside a round and nothing else. What the
watch is, how it scopes its episode, what it computes, what the three grades
mean and which response classes it may suggest are single-sourced in
the plan checkout's `CLAUDE.md`, under the **AI in watch** role, the **Watch step** and the
**Trajectory diagnostic**. Use the Repo Edu and plan checkout paths supplied
in the phase prompt. Keep the invoking repository as the working directory;
the launcher's Repo Edu location does not select the history to anchor. Read
those three sections now and follow them.

If the plan checkout's `CLAUDE.md` is absent, say so and fail: you are outside the
repo-edu / plan workflow and cannot write a grounded watch.

The same capability has a second launcher, the `/watch` slash command, which
the user invokes by hand and which answers in chat instead of writing a file.
The two never run together and neither invokes the other.

## Independence

The watch's value rests on reading the commit record and the code, never the
doer's reasoning. So:

- Read `git log`, the current artifact at the area the log points to, the area
  model and the plan the episode names.
- Do not read the round's transcript, its brief, its report or its vet and
  rebuttal twins, and do not read the fix session. The invocation gives you
  none of them on purpose.
- Both passes are read-only except for the watch file and the watch record.
  Change no code, run no writing command and land no commit.

The round that just ran is evidence only through the commits it landed, the
same as every earlier round.

## Input

The invocation names two things: the file to write and the cache root holding
the watch's own history. Scope the episode by the **Watch step**'s rules, from
the invoking repository's HEAD alone; no anchor is supplied, because no user
chose one. Read and retain the current HEAD of each checkout, then join their
histories under the watch's episode rules. Those two heads bound the evidence
this watch grades.

## Output

Read the shared [round protocol](../../../references/round-protocol.md) for
file names and writer tags. The runner supplies a watch path carrying its
chosen target and round with this phase's writer tag. Keep that path;
allocate no round and read no transcript to derive it.

Write the watch to the named `-watch.md` file, replacing anything already there. The
second pass replaces that same file. It is Markdown for a person reading in a
Markdown viewer.

Then write the watch record. It lives at `watch.json` in the named cache root,
an object keyed by episode stem, and you replace only this episode's entry:

```json
{
  "<stem>": {
    "heads": {
      "repo-edu": "<graded Repo Edu HEAD sha, short>",
      "plan": "<graded plan HEAD sha, short>"
    },
    "grade": "green | amber | red",
    "written": "<local date, YYYY-MM-DD>"
  }
}
```

Write both graded heads, including the peer checkout's head. A glance at either
root counts from its own entry, never the other repository's history. The grade
describes the joined episode. Keep other episode entries unchanged.

The glance owns fixed limits: four A–C correction commits in one area on
green, two on amber and every finished round on red. Plan rounds count by
section. D-only work, clean records, deferral-only records and planned steps
do not count. Severity, reach and growth have no early trigger. Save no
`horizon`; the grade selects the limit. Create the file and its directory when they
are missing. A record that cannot be written is a failure of this phase: say so
rather than leaving a watch the next glance cannot count from.

The first pass writes both. The second pass rewrites the file and leaves the
record alone: it changes wording, never the grade or the graded heads.

## Voice

The `simple` requirement governs the watch. Beyond it:

- Lead with the grounded description, not the grade. Which abstraction is the
  unstable one, and the structural reason rounds keep reopening it.
- Explain the mechanism in words, not in names. Say what a piece of code does
  and why that shape keeps drawing rounds back, not which function or file it
  is. Keep a path, an identifier or a commit sha only where the user needs it
  to check something.
- Expand every acronym and coined term the first time.
- Tiers become plain words with the letter after them: `A` is the wrong shape,
  `B` is a real bug, `C` is a detail an implementer would get wrong and `D` is
  wording. Write "a real bug [B]", never "B-tier".
- A watch that only restates the severity sequence re-narrates `git log` and
  has failed this workflow.

## Shape

The watch has these sections in this order.

1. **Title**: `# <episode stem>: trajectory watch`, followed by the two graded
   heads labelled `repo-edu` and `plan`.
2. **What is drifting**: one or two paragraphs of grounded description. The
   unstable abstraction, where findings cluster and the structural reason that
   area keeps reopening.
3. **The grade**: green, amber or red, with its evidence. Commit shas, the
   clustered area ID, the repeated severity, the reach trajectory the tier
   letters' case carries and the structure trajectory the trailing
   `growth-<level>` or `pruning-<level>` marks carry.
4. **What to do about it**: the suggested response class and the reason it
   fits. Never a fix: proposing an implementation moves the user from judging
   the frame to judging a solution.
5. **When to look again**: on amber, name the area to watch and the fixed
   two-correction limit. On green, state the fixed four-correction limit.
   Both count A–C correction commits in one area. On red, state that this is
   for the user to act on now.

Nothing else belongs in the file. The round's own brief holds its findings.

## The second pass

Read the draft, then judge it against these tests before writing anything:

1. Does the description name a real abstraction and a structural reason or
   does it only restate what the log shows?
2. Is every piece of evidence checkable, and does it say what it is evidence
   of?
3. Does the response class follow from the description, rather than from the
   grade alone?
4. Does the draft propose a fix, decide something the user owns or read the
   round instead of the record?
5. Is any sentence impossible to follow without `git log` open beside it?

Then rewrite the whole file. Fix what the tests caught, and re-ground anything
the draft asserts that you cannot confirm in the log, the area model or the
code. Never append a critique, a change list or a note about the draft: the
file the user opens must read as the finished watch and nothing else.

## Runner result

When the prompt identifies an unattended round phase, follow the
audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. Report `finished` only after both the watch file and the watch record
are written, and return the watch file's absolute path. A missing
plan checkout's `CLAUDE.md`, an unreadable log or a record that cannot be written is
`failed`, with the reason. Never return `needs-ruling`: the watch suggests and
never asks.
