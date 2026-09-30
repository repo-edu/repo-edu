# Watch workflow

One shared workflow behind two passes. The Codex skills
`.agents/skills/watch/SKILL.md` and `.agents/skills/watch-edit/SKILL.md` write
the draft and rewrite it. Claude has matching commands at
`.claude/commands/watch.md` and `.claude/commands/watch-edit.md`. The runner's
settings select each pass's assistant. Each launcher carries only what is
specific to it and points here for the rest. Where a launcher and this file
disagree, this file is right.

This workflow owns the watch's rules for hand-run watches and automated
planning or plan-scoped implementation-audit rounds. Read the whole shared
[round protocol](../../../references/round-protocol.md) for file names, writer
tags, severity sequences and rating tokens.

Keep the invoking repository as the working directory. The launcher's Repo
Edu location does not select the history to anchor. Use the Repo Edu and plan
checkout paths supplied by the invocation.

A hand-run watch returns its watch in chat and writes no file or cadence
record. The automated writer and editor follow the file input, output, shape
and result instructions below only when the invocation supplies their paths.

## Watch step

The three launchers share one name: Claude's `/watch`, Codex's `$watch` and
the audit-round runner's `watch` phase. The user invokes the first two by hand.
An automated planning or plan-scoped implementation-audit round runs the watch
after a round with audit findings finishes. A clean audit skips the watch even
when historical corrections or a red grade would make it due. An explicit
hand-run watch remains available.
No launcher is a serial gate in front of a round: a round never waits on a watch.
The `/watch` command runs in the background and its output is consumed when it
arrives, so the iteration in flight is not blocked. A green grade lets that
iteration complete untouched; a red one lets the user terminate or pause it.
The round's launcher runs after the round's own work is done, so there is
nothing in flight to block.

The shared episode module in Repo Edu computes membership and counts from
Git. The runner supplies the audited plan's topic and
formats joined evidence only after a finished fix when glance says watch is
due. Only the writer receives that evidence, including the two graded heads.
The fresh editor reads the draft and required instructions, improves the wording
and preserves its claims and judgements without investigating its sources again.
A hand-run watch runs `pnpm audit-round episode [stem|commit]` in its own
context and reads the output. The command defaults to the latest stem on
HEAD's history only when no target is named. No route writes an episode file
or computes an episode before audit.

The evidence is bounded to commits reachable from each repository's HEAD.
Other branches and refs are outside it. The watch may inspect named commits
and current artifacts to ground a claim, but does not repeat membership or
count computation.

The cadence differs by launcher, because only one of them can remember. Under
`/watch` the recommended cadence is advice: the user acts on it by invoking
`/watch` again, sooner on amber, skipping a couple on green. Under the round's
launcher the watch keeps a record of its own, so the cadence is counted rather
than remembered. That record holds the episode stem, each repository's HEAD it
last graded, the grade and the written date. The grade selects a fixed limit
owned by the glance. It lives
outside both repositories, in the audit-round runner's shared cache, because it
is machine state about when the watch ran and not part of either repository's
history. The user directed this on 2026-09-13, replacing a watch run on
intuition.

Before the round's launcher runs the watch it runs a glance: a cheap read of the
invoking repository's log since its recorded HEAD, which answers only whether
the watch has enough new correction evidence to run. The watch judges whether
those corrections share an unresolved cause; the glance grades nothing and
suggests nothing. Readers changing the counting or membership rules use
[the runner's code documentation](../../../../tools/audit-round/CLAUDE.md),
[`glance.ts`](../../../../tools/audit-round/src/glance.ts) and
[the shared episode module](../../../../tools/audit-round/src/episode.ts).
The thresholds are code because they apply without the user in the loop.
The watch writes both graded heads; one repository's commit never supplies
the other's history position.

A round that stopped for the user's ruling runs no watch. Its work has not
provably landed, so the record it would grade may be missing that round's own
commit. Nothing is lost by waiting, because the glance counts commits and not
rounds.

The watch returns one of three grades, a summary of the
[Trajectory diagnostic](#trajectory-diagnostic) rather than a new threshold:

- **Green**: the episode is converging, severity stabilising at C or below with
  no new A, finding counts shifting toward the low tiers and maintenance burden
  shrinking, holding steady or growing by smaller amounts. No drift to act on,
  and no near-term need to run the watch again.
- **Amber**: a yellow flag is forming but not yet conclusive, a severity max
  repeated once, a new issue kind appearing in one area or repeated substantial
  or extensive burden increases there. The watch names the area to watch. The
  glance owns when the runner looks again.
- **Red**: a yellow flag is conclusive, the same severity max across many rounds
  in one area, new issue kinds round after round or repeated extensive burden
  increases that no round repays, the unstable-abstraction signal. Drift that
  survives repeated reframes is a conclusive flag of its own, pointing at the
  objective rather than the shape. The watch surfaces it for the user to act on
  now.

The grade is the at-a-glance reduction, not the whole watch document. The watch
leads with a grounded description: which abstraction is the unstable one, drawn
from where findings cluster across the commit stream, and the structural reason
rounds keep reopening it, drawn from reading the artifact at that cluster. A
watch that only restates the severity sequence re-narrates `git log` and adds
nothing the user cannot read there; the grounding is what the watch is for.

The grade and response class are suggestions, not actions the watch takes.
The runner's fixed repeat limits only decide when to read the evidence again.
The watch suggests a response class: continue, redesign the shape, delete an
over-scoped section, hold an unstable area until evidence arrives, spin off a
peer plan or question the objective when drift persists across reframes. It
never suggests a fix, because proposing an implementation re-enters the doer's
frame and drops the user from judging the frame to judging a solution. The user
owns the call, including whether to terminate or let the round in flight run on.

The watch is not the iteration audit. The audit reads the current artifact end
to end for content defects and normally lands a fix commit; a clean round lands
only its `clean` record. The watch reads the sequence of rounds for trajectory
and reads the artifact only at the area that sequence points to, to ground why
that area drifts, landing nothing but its document and its own record. They stay
independent where it matters: the watch consumes the audits' commit record
after the fact, never their reports, transcripts or sessions, and it does not
re-run them. The runner supplies Git evidence, never the round's reasoning.

Read the supplied plan-side and implementation-side trajectories together,
including reactive off-plan rework: the stem marks planned work and often
omits the rework where drift shows. An episode begun under the retired
two-artifact lifecycle reads its historical forms as bridge evidence, not as
a reset.

Finding bullets carry the tokens the shared round protocol's finding metadata
prescribes. Read `[section:<heading>]` as the cluster key on plan-side rounds
and one `[growth:<label>]` label repeating across rounds as growth drift.
Read a run of `low`, `medium` or `high` `[complexity:...]` beside
`[reach:developer]`, `[reach:very-rare]` or `[reach:rare]` as the unpriced
trade the pattern `unpriced-complexity` names: rounds that keep adding
machinery for situations hardly anyone meets. A `minus-` complexity value is
net burden removed and never joins such a run. On Repo Edu commits the
subject's leading mark gives the same reading over whole commits, so
`git log --oneline` shows a `growth-medium` or `growth-high` run without
opening a single body.

Bullets outside the current token form are listed as unreadable and supply
no partial counts. Their subjects still supply independent severity evidence.
Repo Edu findings keep their primary area and cover IDs. An ID in the current
area model resolves directly; a retired ID resolves once into each current
area recording it under `splitFrom`. An ID in neither stays unresolved on
its finding, contributing no area count but retaining its other token counts.

The watch uses the supplied section and area counts to find related causes.
A broad heading can collect unrelated defects; a count alone does not justify
redesign. Read the named bullets and current artifact to establish a shared
structural cause before suggesting a response.

When growth repeats or the supplied reach and complexity pairs show a run, read its cost in four
parts: how often the defended event has occurred or what condition it requires, the simplest
mechanism that meets [BOUNDARIES.md](../../../../../plan/BOUNDARIES.md), the amount and interaction
of the obligations the current design adds and what it gives the user over that simpler mechanism.
Ground developer reach in recorded events. Check alternatives against the artifact's recorded
reasons and the user's rulings; an AI-authored requirement alone does not settle whether its
machinery is worth the cost.

A run concerns one piece of machinery only when its bullets name the same
standing rule, state or owner concern. A shared section, area or file does not
establish that. Quote the relevant bullets and price only what they name.
Carrying one existing rule to another surface does not by itself establish a run
of new machinery. Grade any added agreement and coordination costs under the
common levels, without automatic escalation for replication. The step 7 audit at
Repo Edu `5c321b66` priced a listing counter that none of its three bullets
named; each had carried session admission to another clone-all surface.

This reading belongs to the watch after the completed round. It suggests a
response within the watch's mandate, never stops the audit, applies a fix or
settles the user's choice. Each audit finding still assesses its own trade.

The episode and the commits graded inside it are not always the same window. In
the implementation repo, a file-changing commit whose conventional postfix kind
is `redesign` starts a new grade when its body says that it retires the prior
shape. Include that commit and grade the commits from it through HEAD. Earlier
commits stay in the episode only as evidence for the cross-reframe-drift signal;
their severity and issue counts do not contribute to the current grade. With
several qualifying redesigns, the latest starts the commits graded. With none,
the episode anchor does. In the plan repo, a fix commit that re-opens a settled
shape plays the same role: the widening run it starts is graded on its own
terms, with the earlier run as cross-reframe evidence. This distinction prevents
settling work after a redesign from being graded as another repetition of the
shape the redesign retired.

This workflow is the single source of the watch's rules across both repos.
The plan root keeps the **AI in watch** role and points here. Keep the episode
rules, grades, response classes and trajectory diagnostic here so consumers
cannot drift.

The hand-run definitions live under `home/` in the plan repo: a Claude agent,
a Claude slash command and a Codex skill. The plan root's
[Layout](../../../../../plan/CLAUDE.md#layout) owns their linking rule.
The runner's launchers live in Repo Edu and point here too.

## Trajectory diagnostic

The watch alone applies this diagnostic to the supplied Git evidence for each
artifact. The module provides the trajectory facts and candidate window starts;
the watch judges their meaning against the named commits and current artifact.
It may read additional evidence for a claim without recomputing the episode.
The user owns the response and may still read the diagnostic directly.

- A round form's first tier letter is the maximum severity that round addressed.
  In every form the severity sequence is the tag before the conventional kind,
  or before the colon when the subject carries no kind. On a Repo Edu sequence,
  skip a leading `!` to reach that letter. A leading `growth-<level>` or
  `pruning-<level>` is not part of the sequence and carries the burden
  trajectory below. `init`, `settle`, `clean`, `ready`, `implemented`, `closed`
  and the step form `impl-<n>` carry no severity and are excluded from the
  severity trajectory. A `clean` record still counts as a round with no
  findings remaining after reconciliation and is the diagnostic's direct
  convergence evidence.
  Convergence trends the maximum from A toward D.
- The full severity sequence shows the distribution. Convergence shifts the
  counts toward the low tiers.
- The sum of counts shows round size. Convergence shrinks it.
- On a Repo Edu sequence the case of the tier letters is a second trajectory,
  reach, read alongside severity and never merged into it. Uppercase counts are
  issues an end user can meet and lowercase counts are developer-only. A run of
  rounds whose uppercase counts have reached zero says the episode stopped
  finding user-facing faults, whatever its severity maximum still reads, and a
  leading `!` marks the rounds that found a fault needing no special condition.
- On a Repo Edu sequence the leading mark is a third trajectory, burden,
  read alongside severity and reach and never merged into either. `growth` says
  the round increased maintenance burden. `pruning` says it reduced it. The
  level grades the size of that net change under the
  [common complexity levels](../../../references/round-protocol.md#reach-and-complexity),
  so the trajectory carries magnitude and direction. Two rounds at the same
  severity maximum differ when one prunes and the other grows, and when the
  amounts differ. Convergence prunes or holds steady, and trends the level down
  where it grows. A run of `pruning` rounds is evidence against
  the rounds that over-built the shape, not against the rounds repaying it. Read
  each round's mark against that round's severity, not the alternation between
  rounds. Report all three trajectories separately.

Yellow flags:

- Same severity max appearing across many rounds among the commits in the
  current grade means architectural drift; the area where issues keep landing is
  the problem, not the issues.
- New issue kinds in the same area round after round among those commits means
  the area is over-scoped; recommend deletion over patching.
- A run of `growth-medium` or `growth-high` rounds in one area means the ratchet
  in [`GROWTH-PATTERNS.md`](../../../../../plan/GROWTH-PATTERNS.md) is turning. Substantial or
  extensive burden increases accumulate while each round looks reasonable on its
  own. The flag is a run at the top two levels, not any single `growth` mark.
  Read the added obligations and their interactions against the problems those
  rounds address; closing a serious finding may justify substantial growth. The
  response is to price the machinery under growth pattern 6, not to grade the
  rounds that built it.
- Drift that persists across reframes, not just across rounds, means the
  objective or problem class is wrong, not the shape. When the shape has been
  re-opened or redesigned two or more times and trajectory still will not
  stabilise, the constant is the goal, not the shape; the response is to
  question the objective, not to redesign again. This signal compares the runs
  after each re-opening without merging their severity or issue counts; the
  [Watch step](#watch-step) carries it across those transitions and surfaces the
  question-the-objective response for the user to act on. It is warn-only:
  nothing gates the premise, because falsifying a judgment produces noise rather
  than a converging pass.
- A decision reversing and later re-reversing across rounds means the evidence
  for either direction is insufficient, not that a round misbehaved. An early
  flip is the signal working: it stops growth in the unstable area before detail
  stacks on it. The response is to hold that area and gather the missing
  evidence, from the codebase, an implementation probe or a user ruling, rather
  than to redesign again or defend the decision with stronger wording.
- Plan length growing across iterations is not a stop signal by itself; severity
  trajectory and distribution shape are.

**Readiness stop condition**: severity has stabilised at C or below across consecutive rounds with
no new A. The user owns the call; stabilisation is the principle, not a numeric threshold the AI
applies on its own. This condition governs the readiness of a plan for implementation. Settling
follows the current-shape guidance under
[Artifact lifecycle](../../../../../plan/CLAUDE.md#artifact-lifecycle), not this trajectory
condition.

This diagnostic and its stop condition assume a convergent problem: one with a
shape that stabilises. A diminishing-returns problem, open-ended coverage over
an irregular real population, has no fixed point; its health signal is new
findings per round trending toward zero, and forcing the convergence stop
condition onto it reads as a permanent red. The cross-reframe-drift flag is
where the mismatch surfaces, and which class a problem is in is the user's call.

## Independence

The writer's judgement rests on reading the commit record and the code, never
the doer's reasoning. The editor reads only the draft and required instructions,
preserving the writer's claims and judgements. So:

- The writer reads the supplied Git evidence, the current artifact at the area it points
  to, the area model and the named plan. Inspect named commits as needed to
  verify a claim; do not repeat the episode walk or token counts.
- Do not read the round's transcript, its brief, its report or its vet and
  rebuttal twins, and do not read the fix session. The invocation gives you
  none of them on purpose.
- Both passes are read-only except for the watch file and the watch record.
  Change no code, run no writing command and land no commit.

The round that just ran is evidence only through the commits it landed, the
same as every earlier round.

## Input

The writer's file arguments name the watch file to write and the cache root holding
its cadence record. Its prompt separately supplies joined Git evidence for the
audited plan. Take the topic and both graded heads from that evidence; do not
select a topic from HEAD or reread current heads to replace the supplied ones.
The runner computes this snapshot after the fix, only when glance says watch
is due.

The editor receives only the draft watch path. Neither an automated editor nor
a hand-run editor fetches Git evidence or investigates the draft's sources.
No route reads or writes an episode file.

## Output

The runner supplies a watch path carrying its chosen
target and round with this phase's writer tag. Keep that path; allocate no round and read no
transcript to derive it.

Write the watch to the named `-9-watch.<tag>.md` file, replacing anything already there. The
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

`tools/audit-round/src/glance.ts` owns the limits and the counting. Create the file and its
directory when they are missing. A record that cannot be written is a failure of this phase: say so
rather than leaving a watch the next glance cannot count from.

The first pass writes both. The second pass, the watch edit, rewrites the file
and leaves the record alone: it changes wording while preserving the claims,
judgements, grade and graded heads.

Write the first pass as a finished watch. A fresh session rewrites it afterwards;
leave no notes for that pass.

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
   letters' case carries and the burden trajectory the leading
   `growth-<level>` or `pruning-<level>` marks carry.
4. **What to do about it**: the suggested response class and the reason it
   fits. Never a fix: proposing an implementation moves the user from judging
   the frame to judging a solution.
5. **When to look again**: on amber, name the area to watch. On red, state that
   this is for the user to act on now. On green, nothing more.

Nothing else belongs in the file. The round's own brief holds its findings.

## The second pass

You did not write this draft. Read it as the user will, checking for clarity
before writing anything:

1. Does the wording explain the unstable abstraction and the stated reason
   rounds keep reopening it?
2. Does each cited piece of evidence have a clear connection to the claim it
   supports?
3. Is the stated reason for the suggested response clear?
4. Can the reader follow each sentence without `git log` open beside it?

Then rewrite the whole file for clarity, preserving its claims and judgements.
Do not investigate sources or add new evidence. Never append a critique, a
change list or a note about the draft: the file must read as the finished watch.

## Runner result

When the prompt identifies an unattended round phase, follow the
shared
[Runner result](../../../references/round-protocol.md#runner-result) for every
ending. The writer reports `finished` only after both the watch file and the
watch record are written at the supplied paths. The editor reports `finished`
after replacing the draft and leaves the record alone. A missing required input
or failed required write is `failed`, with the reason. Never return
`needs-ruling`: the watch suggests and never asks.
