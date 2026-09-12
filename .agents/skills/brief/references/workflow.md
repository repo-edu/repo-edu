# Round brief workflow

One shared workflow behind two launchers: the Claude command
`.claude/commands/brief.md` and the Codex skill
`.agents/skills/brief/SKILL.md`. Each launcher carries only what is specific
to it and points here for the rest, so the two cannot drift apart. Where a
launcher and this file disagree, this file is right.

The brief is the plain-words twin of one round transcript, written for the
user. The transcript is the `ROUND-TS-*.md` file the audit-round runner writes
at the Repo Edu root: the audit report, the vet's verdicts, the rebuttal and
the fix phase's text, one section per phase. The user reads it to learn what
the round found, what was agreed, what was fixed and what still needs a
ruling. The transcript is written for the assistants that run the later
phases, so it is dense with paths, identifiers and rating tokens. The brief
says the same things in words the user does not have to decode.

## Input

The invocation names the transcript. When it names nothing, take the newest
`ROUND-TS-*.md` file at the Repo Edu root by the timestamp in its name, say
which one in chat and continue. A name that is not a `ROUND-TS-*.md` file at
the root is a wrong input: name it, say what was expected and stop.

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

Write the brief beside the transcript, with the same name and `-brief` before
the extension: `ROUND-TS-<name>.md` becomes `ROUND-TS-<name>-brief.md`.
Replace an existing brief at that name. The brief is the one file this
workflow writes; the transcript stays as it is.

The brief is Markdown for a person reading in a Markdown viewer. Use
headings, numbered lists and tables where they help. Bold the first words of
a paragraph or bullet, never a whole sentence.

## Voice

The `simple` requirement governs the brief. Beyond it:

- Translate, do not summarise. Every point the transcript makes appears in
  the brief: every coverage row, every deviation, every pattern, every
  finding with its cause, its effect and its correction, every verdict, every
  answer and every open item. Cutting a point is the one way to fail this
  workflow. Length is whatever that takes.
- Explain the mechanism in words, not in names. Say what a piece of code does
  and what goes wrong, not which function or file it is. Keep a path,
  identifier, commit sha or number only where the reader needs it to find or
  check something. Expand every acronym and coined term the first time.
- Describe from the user's chair: what they do, what they see, and what
  happens instead of what they expect.
- Tiers become plain words with the letter after them: `A` is the wrong
  shape, `B` is a real bug, `C` is a detail an implementer would get wrong
  and `D` is wording. Write "a real bug [B]", never "B-tier".
- Keep the transcript's numbering for findings and open items, so a reply in
  chat can point at them.

## Shape

The brief has these sections in this order. The words after each heading say
what it holds.

1. **Title**: `# <plan> step <n> in plain words`, naming the plan and the
   step range the way the transcript's first heading does.
2. **Opening**: who did what, from the fenced role table, one short sentence
   per role naming its assistant; what the audited step is about, one
   paragraph; how the round ended, one sentence: the fix landed, the fix
   stopped for a ruling, or a phase failed and which.
3. **What the audit checked**: the coverage table row by row, each as one
   sentence saying what the plan asked and whether the code does it; every
   deviation with the reason the round gave; the round yield and structure
   lines in words; the patterns across rounds and, when the round priced a
   run, each pricing question with its answer.
4. **The findings**: one numbered entry per finding, in the report's order,
   opening with a short title and the tier in words. Each entry says what
   goes wrong and when, why the code does that, what the correction is, and
   the condition that makes a rare rating checkable. Then, when the vet or
   the rebuttal changed anything about the finding, what they said and what
   was agreed. A dropped finding says why it was dropped and, when the
   rebuttal left a note for a later round, what the note says.
5. **The ratings**: one table over the findings, in the report's order, with
   the columns Finding, Growth, Reach and Complexity. The finding cell is the
   number and short title. The growth cell is `none`, or the pattern's label
   followed by what the pattern means in a few words. The reach cell is the
   rating followed by the condition in words. The complexity cell is the
   rating followed by what the correction adds or removes in a few words. A
   rating the vet changed shows both values, such as "developer, raised to
   rare by the vet". A dropped finding keeps its row and says so. The area
   tokens stay out of the table, because the finding's title already says
   where the problem sits.
6. **The fix**: what the fix phase did. When it landed, what it changed and
   what it committed, from the fix phase's text. When it stopped for a
   ruling, the open items as a numbered list, each with what it costs, what
   it buys and what the fixer recommends, so the user can rule from the brief
   alone. When a phase failed, which one and the reason the transcript gives.

## Runner result

When the prompt identifies an unattended phase, follow the audit workflow's
[Runner result](../../audit/references/workflow.md#runner-result) for every
ending. Report `finished` only after the brief is written, and return its
absolute path. A wrong or unreadable input is `failed`, with the reason.
Never return `needs-ruling`: the brief presents a ruling, it never asks one.
