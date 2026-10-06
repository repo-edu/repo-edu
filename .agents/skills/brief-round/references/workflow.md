---
reads:
  - ../../../../../plan/home/claude/commands/simple.md
  - ../../../references/round-protocol.md
  - ../../../../../plan/GROWTH-PATTERNS.md
---

# Round brief workflow

The header's files are part of this workflow. Paths are relative to this file.
The runner supplies them whole; in a hand-run session, read them whole. Read
each file once. Apply the `simple` requirement to the whole session and
skip its confirm-and-wait step.

The runner starts its `brief` phase directly from this workflow. The two
hand-run launchers, Claude's `/brief-round` and Codex's `$brief-round`, use it
too; **Hand-run entry** owns their route. The home `/brief-plan` and
`$brief-plan` retell a plan, not a round, under their own workflow in the plan
repo.

The brief is the plain-words twin of one round transcript, written for the
user. The transcript is the `*-1-round.<tag>.md` file the audit-round runner writes
at the plan repo root: the audit report, the vet's verdicts, the rebuttal and
the fix phase's text, one section per phase. The user reads it to learn what
the round found, what was agreed, what was fixed and what still needs a
ruling. The transcript is written for the assistants that run the later
phases, so it is dense with paths, identifiers and rating tokens. The brief
says the same things in words the user does not have to decode. In an automated
round it runs only after the full fix has completed, including all rulings and
resumed fix invocations. A standalone invocation may retell an earlier incomplete round.

## Hand-run entry

For `help`, `-h`, `--help` or `?`, show usage for the invoking
`/brief-round` or `$brief-round` command and stop: an optional transcript at
the plan root selects the round, and omission takes the most recently modified
transcript there.

Resolve the plan root as `../plan` from either checkout. An argument names a
transcript the way `pnpm audit-round brief` accepts it. Read that transcript
under **Input**, then write the brief in chat under **Voice** and **Shape**, as
ordinary chat Markdown. The brief is the whole reply: no line before it and no
notes after it. A hand-run brief writes no file, so the saved brief beside a
transcript stays the runner's. Later questions about the round in the same
session are answered from the transcript under the same rules.

## Input

The shared [round protocol](../../../references/round-protocol.md) owns file names, writer tags and
rating meanings. Follow its **Later files** for the transcript and output arguments. A missing input
or a transcript outside the shared grammar fails under the result rule when unattended.
`pnpm audit-round brief [transcript]` starts a separate brief session, on the most recently
modified transcript at the plan root when none is named.

Resolve workflow references from Repo Edu. The transcript and any output live
at the plan root; use the supplied output path.

Read the whole transcript. The supplied growth patterns explain its pattern labels.
Read nothing else about the round: no code, no
plan, no git history and no report or twin file. The brief retells what the round said and adds
nothing the round did not say. When the transcript states something you believe is wrong, retell it
as the round's claim; you have no evidence to correct it, and the round's own vet and rebuttal
already checked it.

## Output

Under the runner, write the brief to the supplied output path, replacing an
existing file. The brief is the one file this workflow writes; the transcript
stays as it is. Confirm the saved path in the final reply and add the required
result line; the runner displays the saved file after this phase succeeds. A
hand-run brief goes to chat under **Hand-run entry**.

The brief is Markdown for a person reading in a Markdown viewer or in chat. Use
headings, numbered lists and tables where they help. Bold the first words of
a paragraph or bullet, never a whole sentence.

## Voice

The `simple` requirement governs the brief. Beyond it:

- Condense the transcript. Keep every finding with its final tier and
  correction. Drop restated points and evidence trails while keeping enough
  explanation to understand the outcome.
- Explain the mechanism in words, not in names. Say what a piece of code does
  and what goes wrong, not which function or file it is. Keep a path,
  identifier, commit sha or number only where the reader needs it to find or
  check something. Expand every acronym and coined term the first time.
- Describe from the user's chair: what they do, what they see, and what
  happens instead of what they expect.
- Outside finding titles, tiers become plain words with the letter after them,
  in the words of the rubric that graded the round; the transcript's first heading says which
  kind of round it was. An implementation round grades under Repo Edu's
  shared round protocol's **Implementation tiers**. A planning round uses
  its **Planning tiers**. Write "a real bug [B]", never "B-tier".
- Keep the transcript's numbering for findings and open items, so a reply in
  chat can point at them.

## Shape

The brief has these sections in this order. The words after each heading say
what it holds.

1. **Title**: `# <scope> in plain words`, naming the planning artifact,
   implementation steps or commits the way the transcript's first heading does.
2. **Opening**: a summary of what the round found, what changed and what landed.
   Name the audited scope and say whether the fix landed, stopped for a ruling
   or a phase failed. Follow with the transcript's fenced role table copied
   unchanged, because retelling it in sentences reads worse than the table.
3. **What the audit checked**: the coverage counts when the round reports them
   and the round yield and structure lines in words. Condense deviations and
   their reasons, patterns across rounds and any priced trade into what explains
   the round's outcome. The coverage table and evidence trails stay out.
4. **The findings**: one numbered entry per finding, in the report's order,
   opening with the tier letter and a colon before the short title, as in
   `1. **B: A listing starts again after every command**`. Use the tier the
   finding ended the round with and explain any tier change in the entry.
   Preserve all of the finding's metadata tokens on their own line immediately
   below the title, before the explanation. Separate the title, token line and
   explanation with blank lines. Do not remove or translate the tokens. The
   plain-language explanation and ratings table supplement the token line.
   Each entry says what goes wrong and when, why it happens, the final correction
   and the condition that makes a rare rating checkable. Condense the vet and
   rebuttal discussion to what changed and why. A dropped finding says why it
   was dropped and keeps any note the rebuttal left for a later round.
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
   what it committed, from the fix phase's text. Include the user's rulings and
   how the resumed fix applied them. When it stopped for a
   ruling, the open items as a numbered list, each with what it costs, what
   it buys and what the fixer recommends, so the user can rule from the brief
   alone. When a phase failed, which one and the reason the transcript gives.

## Runner result

Follow the shared [Runner result](../../../references/round-protocol.md#runner-result).
Completion requires the brief at its supplied path.
