# Commit subject grammar

This reference owns the shape of every commit subject in Repo Edu and the
sibling plan repo. It states the shape only. What each part means and why it
exists stays where it is owned: Repo Edu's `CLAUDE.md` owns the capability tag,
the model record and the severity marks under **Commit Capability Tag**,
**Commit Model Record** and **Commit Severity Prefix**, and the plan repo's
`CLAUDE.md` owns the roles and the keying rules under **Shared implementation
forms** and **Commit message convention**. Those sections link here instead of
restating the shape. Read this file from the Repo Edu checkout; plan-repo
readers reach it at `../repo-edu/.agents/references/subject-grammar.md`.

Repo Edu's `.husky/commit-msg` hook and the plan repo's `hooks/commit-msg`
hook enforce this grammar, and the audit-round runner's subject parser reads
it. A change to the shape lands in
this file, the parser and its tests in one commit.

## Notation

`<x>` is a non-terminal. Double quotes enclose literal text, including characters
that otherwise control the grammar. The quotes themselves are not part of the
subject. Outside quotes, `|` separates alternatives, `[ ]` encloses an optional
part and `( )` groups. The postfix operators are `?` for zero or one, `*` for
zero or more and `+` for one or more. A comment follows `;`. All other text is
literal, including spaces inside a production.

## Frame

```text
<subject>   ::= <tags>: <sentence>
<tags>      ::= [<form> ]<tag>[ <growth>][ <severity>][ <kind>]
<sentence>  ::= free text on one line
```

The five slots of `<tags>` keep this order and only the last filled slot is
followed by the colon. Which slots a subject fills is decided by its class
under [Classes](#classes).

## Terminals and small non-terminals

```text
<form>      ::= <stem>/<role>
<stem>      ::= <stem-char>+                ; the plan file's name without .md and without a -widen postfix
<stem-char> ::= any character except / and space
<role>      ::= init | audit | settle | ready | impl-<n> | impl-audit-<scope> | implemented | closed
<scope>     ::= <n> | <n>-<n> | all
<n>         ::= <digit>+                    ; a positive integer without leading zeros
<digit>     ::= 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

<tag>       ::= <vendor><tier><effort>
<vendor>    ::= a | o                       ; Claude | Codex
<tier>      ::= b | t | u                   ; base | top | unlisted
<effort>    ::= l | m | h | x               ; low | medium | high | xhigh

<growth>    ::= <direction>-<level>
<direction> ::= growth | pruning
<level>     ::= low | medium | high

<severity>  ::= <sequence> | clean
<sequence>  ::= <bare> | <marked>
<bare>      ::= (<upper><n>)+               ; letters strictly ascending, A before D
<upper>     ::= A | B | C | D
<marked>    ::= !?<bare>?<lower>?           ; at least one run present; ! requires <bare>
<lower>     ::= (<lowercase><n>)+           ; letters strictly ascending, a before d
<lowercase> ::= a | b | c | d

<kind>      ::= <conventional>"("<kind-scope>")"
<conventional> ::= build | chore | ci | docs | feat | fix | perf | refactor | revert | style | test | redesign
<kind-scope>   ::= <scope-char>+            ; the package or area the commit primarily belongs to, or repo
<scope-char>   ::= a lowercase letter, a digit or -
```

The three alphabets of `<tag>` share no letter, so each letter names its
position on its own. `<conventional>` is the Angular set that Conventional
Commits recommends, plus `redesign`; a new kind enters by editing this line.
`clean` fills the severity slot of a round that accepted no findings and is
never a `<role>`.

## Forms by repository

`<bare>` is the plan repo's sequence form and `<marked>` is Repo Edu's. A
`<growth>` mark appears only in a subject that carries a `<marked>` sequence,
so it never appears in the plan repo and never on a subject without a
sequence. The reach and structure marks describe shipped code, which the plan
repo holds none of.

## Classes

Each class is a production of `<subject>` that fixes which slots are filled.
`<S>` stands for `<sentence>`.

Plan-file commits, plan repo only. No `<kind>`, no `<growth>`, `<bare>` only:

```text
<P1 init>    ::= <stem>/init <tag>: <S>
<P2 audit>   ::= <stem>/audit <tag> <bare>: <S>
               | <stem>/audit <tag> clean: <S>
<P3 marker>  ::= <stem>/settle <tag>: <S>
               | <stem>/ready <tag>: <S>
               | <stem>/closed <tag>: <S>
```

Implementation commits, either repo. A commit lands in the repo whose files it
changes, so the sequence form follows the hosting repo:

```text
<I1 step>            ::= <stem>/impl-<n> <tag> <kind>: <S>
<I2 fix, Repo Edu>   ::= <stem>/impl-audit-<scope> <tag>[ <growth>] <marked> <kind>: <S>
<I2 fix, plan>       ::= <stem>/impl-audit-<scope> <tag> <bare> <kind>: <S>
<I3 deferral record> ::= <stem>/impl-audit-<scope> <tag> <sequence>: <S>
<I4 clean record>    ::= <stem>/impl-audit-<scope> <tag> clean: <S>
<I5 marker>          ::= <stem>/implemented <tag>: <S>
                       | <stem>/closed <tag>: <S> ; Repo Edu only
```

Off-plan commits, no `<form>`:

```text
<O1 Repo Edu> ::= <tag>[ <growth>] <marked> <kind>: <S>
<O2 plan>     ::= <tag>[ <bare>] <kind>: <S>
```

Rules across the classes:

- Every subject carries exactly one `<tag>`. In P2, I2, I3 and I4 it names the
  assistant that audited, not the one that wrote the commit. Elsewhere it names
  the writing session.
- I1 carries no `<severity>`. A step lands planned work as designed, so its
  grade would only restate the rounds that planned it.
- Every file-changing Repo Edu commit except I1 carries a `<marked>` sequence.
  An off-plan plan-repo commit (O2) carries a `<bare>` sequence when it closes a
  graded concern and none otherwise.
- P1, P3, I3, I4 and I5 change no graded file and fill only the slots their
  productions show. I3 changes no file in its own repo at all.
- Plan identity, role, scope and auditor live only in the subject. No body line
  repeats them.

## Roles

| `<role>` | Repo | Meaning |
| --- | --- | --- |
| `init` | plan | first commit of a plan file, replacing any earlier content |
| `audit` | plan | one planning round |
| `settle` | plan | rename onto the bare topic name, no content change |
| `ready` | plan | plan declared ready for implementation, no file change |
| `impl-<n>` | either | one implementation step, exactly one step per commit |
| `impl-audit-<scope>` | either | an implementation-audit fix commit or record |
| `implemented` | either | every step this repo hosts has landed |
| `closed` | either | Repo Edu: its audit rounds have settled; plan: the loop-close move to `archive/` |

## Examples

Every line below parses under exactly one class, and the parser's tests assert
that class for each line. The sentence after the colon is free text the grammar
never reads, so the examples stop at the colon.

Plan repo:

```text
P1        planning-rounds/init ath:
P2        planning-rounds/audit ath B2C2:
P2        round-file-naming/audit ath clean:
P3        planning-rounds/ready ath:
P3        planning-rounds/closed oth:
I1        planning-rounds/impl-3 oth feat(audit-round):
I2 plan   round-file-naming/impl-audit-all oth D1 docs(vet):
I4        planning-rounds/impl-audit-all otm clean:
I5        planning-rounds/implemented oth:
O2        ath chore(repo):
O2        ath C1 docs(claude):
```

Repo Edu:

```text
I1           planning-rounds/impl-4 oth test(audit-round):
I2 Repo Edu  round-file-naming/impl-audit-all oth growth-medium c1 fix(audit-round):
I4           planning-rounds/impl-audit-all ath clean:
I5           planning-rounds/closed oth:
O1           ath growth-medium c1 feat(audit-round):
O1           abx pruning-low c1 redesign(audit-round):
O1           abx growth-low c1d1 fix(repo):
O1           ath !B1C1c2d1 fix(renderer-app):
```

## Rulings

Three questions the owning sections left open were ruled on 2026-09-20 and are
fixed here:

1. An off-plan plan-repo commit may carry a `<bare>` sequence, and never a
   `<marked>` one. The sequence is evidence the trajectory reads, and an
   off-plan fix can close a graded concern.
2. A `<growth>` mark appears only beside a `<marked>` sequence. A step is where
   structure grows by design, and the audit rounds that follow grade what it
   did.
3. `<conventional>` is a closed list, the Angular set plus `redesign`. A scan
   by kind can only count what is on the list.
