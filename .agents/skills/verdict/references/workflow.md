# Watch verdict workflow

One shared workflow behind two launchers, both Claude commands:
`.claude/commands/verdict.md` writes the draft and `.claude/commands/revise.md`
rewrites it. Each launcher carries only what is specific to it and points here
for the rest, so the two cannot drift apart. Where a launcher and this file
disagree, this file is right. There is no Codex skill beside this file, because
Claude writes both passes.

The verdict is the trajectory watch's document, written after an automated planning or plan-scoped
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
repo-edu / plan workflow and cannot write a grounded verdict.

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
- Both passes are read-only except for the verdict file and the watch record.
  Change no code, run no writing command and land no commit.

The round that just ran is evidence only through the commits it landed, the
same as every earlier round.

## Input

The invocation names two things: the file to write, and the cache root holding
the watch's own history. Scope the episode by the **Watch step**'s rules, from
the invoking repository's HEAD alone; no anchor is supplied, because no user
chose one. Read and retain the current HEAD of each checkout, then join their
histories under the watch's episode rules. Those two heads bound the evidence
this verdict grades.

## Output

Read the shared [round protocol](../../../references/round-protocol.md) for
file names and writer tags. The runner supplies a watch path carrying its
chosen target and round with this phase's writer tag. Keep that path;
allocate no round and read no transcript to derive it.

Write the verdict to the named `-watch.md` file, replacing anything already there. The
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
    "horizon": 3,
    "written": "<local date, YYYY-MM-DD>"
  }
}
```

Write both graded heads, including the peer checkout's head. A glance at either
root counts from its own entry, never the other repository's history. The grade
and horizon describe the joined episode. Keep other episode entries unchanged.

`horizon` is the re-run distance in commits that the grade carries: the number
the verdict names on amber, `8` on green and `0` on red. The glance reads this
record to decide whether the next round earns a watch, so the record is how the
cadence survives between rounds. Create the file and its directory when they
are missing. A record that cannot be written is a failure of this phase: say so
rather than leaving a verdict the next glance cannot count from.

The first pass writes both. The second pass rewrites the file and leaves the
record alone: it changes wording, never the grade or the horizon.

## Voice

The `simple` requirement governs the verdict. Beyond it:

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
- A verdict that only restates the severity sequence re-narrates `git log` and
  has failed this workflow.

## Shape

The verdict has these sections in this order.

1. **Title**: `# <episode stem>: trajectory watch`, followed by the two graded
   heads labelled `repo-edu` and `plan`.
2. **What is drifting**: one or two paragraphs of grounded description. The
   unstable abstraction, where findings cluster, and the structural reason that
   area keeps reopening.
3. **The grade**: green, amber or red, with its evidence. Commit shas, the
   clustered area ID, the repeated severity, the reach trajectory the tier
   letters' case carries and the structure trajectory the trailing
   `growth-<level>` or `pruning-<level>` marks carry.
4. **What to do about it**: the suggested response class and the reason it
   fits. Never a fix: proposing an implementation moves the user from judging
   the frame to judging a solution.
5. **When to look again**: on amber, the area to watch and the horizon in
   commits. On green, that there is no near-term need. On red, that this is for
   the user to act on now.

Nothing else belongs in the file. The round's own brief holds its findings.

## The second pass

Read the draft, then judge it against these tests before writing anything:

1. Does the description name a real abstraction and a structural reason, or
   does it only restate what the log shows?
2. Is every piece of evidence checkable, and does it say what it is evidence
   of?
3. Does the response class follow from the description, rather than from the
   grade alone?
4. Does the draft propose a fix, decide something the user owns, or read the
   round instead of the record?
5. Is any sentence impossible to follow without `git log` open beside it?

Then rewrite the whole file. Fix what the tests caught, and re-ground anything
the draft asserts that you cannot confirm in the log, the area model or the
code. Never append a critique, a change list or a note about the draft: the
file the user opens must read as the finished verdict and nothing else.

## Runner result

When the prompt identifies an unattended round phase, follow the
audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. Report `finished` only after both the verdict file and the watch record
are written, and return the verdict file's absolute path. A missing
plan checkout's `CLAUDE.md`, an unreadable log or a record that cannot be written is
`failed`, with the reason. Never return `needs-ruling`: the watch suggests and
never asks.
