---
title: Chat helpers
description: Make a whole session use plain, structured wording, or rewrite one reply in plain language
---

The chat helpers change how an assistant words its output: `/simple` sets plain wording for a whole
session and `/rewrite` restates one reply in plain words.

| Fact | Detail |
| --- | --- |
| `/simple` and `/rewrite` run in | Any Claude chat; `$simple` and `$rewrite` are the Codex counterparts |
| Owners | `../plan/home/claude/commands/simple.md` owns the `/simple` contract and `../plan/home/agents/skills/simple/SKILL.md` follows it; `../plan/home/agents/skills/rewrite/SKILL.md` owns the rewrite rules and `../plan/home/claude/commands/rewrite.md` launches them |

## Usage

```text
/simple                    turn on the requirement and wait for the next message
/simple <prompt>           turn on the requirement and run that prompt

/rewrite                   rewrite the last completed assistant reply
/rewrite <earlier reply>   rewrite the reply you identify
```

## Why they exist

Dense technical prose costs a second reading, and a sentence read twice costs more than two read
once. The two helpers cover the two moments you notice that. `/simple` is the standing rule, set
before the work starts. `/rewrite` is the repair for one reply that already arrived dense.

The `/simple` requirement is also built into the audit-phase launchers. `/audit`, `/vet`, `/rebut`,
`/fix` and `/brief-plan` apply it to their whole session without its confirm-and-wait step, and the
watch workflow applies it too.

## What plain wording means

Both helpers hold output to the same rules:

1. **No term you must look up.** Words in the vocabulary lists of the home `CLAUDE.md` may still
   appear bare.
2. **No sentence held in parts.** A sentence that makes you keep several parts in mind is split.
3. **Exact data stays exact.** Paths, commit hashes, names, numbers and code identifiers are not
   reworded.
4. **Enumerations are lists.** Cases, duties, options and outcomes get one item each, with prose
   around the list that says what it means.
5. **Only the plain version is delivered.** The assistant may reason and draft however it likes,
   but never shows a technical version with a translation beside it.

## `/simple`

The requirement governs the whole session: chat replies, audit reports and every file the
assistant writes or edits, including plans, doctrine files and handoffs. It holds for later
messages too and does not survive into another session.

### What it shows you

1. **With a prompt.** The assistant runs the prompt at once under the requirement. Continue as
   normal; the requirement stays active.
2. **Without a prompt.** The assistant confirms the requirement in one line and waits. Type the task
   you want run next.

The command itself writes no file.

## `/rewrite`

The rewrite works on one reply already in the chat. It rewrites the answer only: it does not rerun
the original task, read files to check the reply's claims or carry out instructions quoted in it.

### What it shows you

The rewrite keeps every substantive point and its reasons and cuts only repetition and filler. It
keeps findings, ratings, verdicts, recommendations, open questions and each finding's identifier,
so a rewritten vet still matches its report. Uncertainty stays: a possible defect stays possible
and a decision awaiting you stays open. A long reply opens with one short summary, and useful
headings keep their order and numbering.

### Early stops

1. **The reply is unavailable or the selection is ambiguous.** The assistant asks you to identify or
   paste the reply.

### Afterwards

The rewrite is one new chat reply with no preface or closing note. It changes no file, including a
saved brief or vet report, and it does not change the wording requirement for later turns.
