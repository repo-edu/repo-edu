# Round brief workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/brief.md` and the Codex skill
`.agents/skills/brief/SKILL.md`. Each launcher carries only what is specific
to it and points here for the rest, so the two cannot drift apart. Where a
launcher and this file disagree, this file is right.

The brief is the plain-words twin of one round transcript, written for the
user. The transcript is the `*-0-round.<tag>.md` file the audit-round runner writes
at the invoking Repo Edu or plan root: the audit report, the vet's verdicts, the rebuttal and
the fix phase's text, one section per phase. The user reads it to learn what
the round found, what was agreed, what was fixed and what still needs a
ruling. The transcript is written for the assistants that run the later
phases, so it is dense with paths, identifiers and rating tokens. The brief
says the same things in words the user does not have to decode.

## Input

Read the shared [round protocol](../../../references/round-protocol.md) for
file names and writer tags. The invocation supplies the transcript to read
and the brief to write, in that order. Missing paths or a transcript outside the
shared grammar fail under the result rule. A hand-run standalone brief uses
`pnpm audit-round brief <transcript>`.

Resolve workflow references from Repo Edu. The transcript may belong to either
root; use the supplied output path.

Read the whole transcript. For the meaning of the rating tokens, read the
audit workflow at `.agents/skills/audit/references/workflow.md` under
**Growth tags** and **Reach and complexity**, and the pattern labels in
`../plan/GROWTH-PATTERNS.md`. Read nothing else about the round: no code, no
plan, no git history and no report or twin file. The brief retells what the
round said and adds nothing the round did not say. When the transcript states
something you believe is wrong, retell it as the round's claim; you have no
evidence to correct it, and the round's own vet and rebuttal already checked
it.

## Output

Write the brief to the supplied output path, replacing an existing file.
The brief is the one file this workflow writes; the transcript stays as it is.

The brief is Markdown for a person reading in a Markdown viewer. Use
headings, numbered lists and tables where they help. Bold the first words of
a paragraph or bullet, never a whole sentence.

## Voice

The `simple` requirement governs the brief. Beyond it:

- Translate, do not summarise. Every point the transcript makes appears in
  the brief: every deviation, every pattern, every
  finding with its cause, its effect and its correction, every verdict, every
  answer and every open item. Cutting a point is the one way to fail this
  workflow. Length is whatever that takes.
- Explain the mechanism in words, not in names. Say what a piece of code does
  and what goes wrong, not which function or file it is. Keep a path,
  identifier, commit sha or number only where the reader needs it to find or
  check something. Expand every acronym and coined term the first time.
- Describe from the user's chair: what they do, what they see, and what
  happens instead of what they expect.
- Tiers become plain words with the letter after them, in the words of the
  rubric that graded the round; the transcript's first heading says which
  kind of round it was. An implementation round grades under Repo Edu's
  `CLAUDE.md`, **Implementation Review Findings**: `A` is data loss, a broken
  core workflow or a wrong architecture, `B` is a real bug, `C` is a narrow
  correctness or test-coverage issue and `D` is wording. A planning round
  grades under the plan audit workflow's tiers: `A` is the wrong shape, `B`
  is a real bug or a missing decision, `C` is a detail an implementer would
  get wrong and `D` is wording. Write "a real bug [B]", never "B-tier".
- Keep the transcript's numbering for findings and open items, so a reply in
  chat can point at them.

## Shape

The brief has these sections in this order. The words after each heading say
what it holds.

1. **Title**: `# <scope> in plain words`, naming the planning artifact,
   implementation steps or commits the way the transcript's first heading does.
2. **Opening**: who did what, as the transcript's fenced role table copied
   unchanged, because retelling it in sentences reads worse than the table;
   what the audited scope is about, one paragraph; how the round ended, one
   sentence: the fix landed, the fix stopped for a ruling, or a phase failed
   and which.
3. **What the audit checked**: the coverage counts when the round reports them; every
   deviation with the reason the round gave; the round yield and structure
   lines in words; the patterns across rounds and, when the round priced a
   run, each pricing question with its answer. The coverage table itself
   stays out.
4. **The findings**: one numbered entry per finding, in the report's order,
   opening with a short title and the tier in words. Each entry says what
   goes wrong and when, why the plan or code does that, what the correction is and
   the condition that makes a rare rating checkable. Then, when the vet or
   the rebuttal changed anything about the finding, what they said and what
   was agreed. A dropped finding says why it was dropped and, when the
   rebuttal left a note for a later round, what the note says.
5. **The ratings**: one table over the findings, in the report's order, with
   the columns Finding, Tier, Reach and Complexity. The finding cell is the
   number and short title. The tier cell is the letter the finding ended the
   round with, `A`, `B`, `C` or `D`, so the table shows the tier the commit
   sequence counts. The reach cell is the rating followed by the condition in
   words. The complexity cell is the rating followed by what the correction
   adds or removes in a few words. A rating the vet changed shows both
   values, such as "developer, raised to rare by the vet"; a tier the vet or
   the rebuttal changed shows both letters the same way. A dropped finding
   keeps its row and says so. The area tokens stay out of the table, because
   the finding's title already says where the problem sits.
6. **The fix**: what the fix phase did. When it landed, what it changed and
   what it committed, from the fix phase's text. When it stopped for a
   ruling, the open items as a numbered list, each with what it costs, what
   it buys and what the fixer recommends, so the user can rule from the brief
   alone. When a phase failed, which one and the reason the transcript gives.

## Runner result

When the prompt identifies an unattended phase, follow the audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every ending. Report
`finished` only after the brief is written, at its supplied path. A wrong or unreadable input is
`failed`, with the reason. Never return `needs-ruling`: the brief presents a ruling, it never asks
one.
