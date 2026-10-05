# Commit subject grammar

This reference owns the shape of every commit subject in Repo Edu and the
sibling plan repo except a merge commit's. It states the shape only. What each part means and why it
exists stays where it is owned: Repo Edu's `CLAUDE.md` owns the capability tag
and the model record under **Commit Capability Tag** and **Commit Model Record**.
The [shared round protocol](round-protocol.md#severity-sequence) owns severity
and burden meanings, and the plan repo's
`CLAUDE.md` owns the roles and the keying rules under **Shared implementation
forms** and **Commit message convention**. Those sections link here instead of
restating the shape. Read this file from the Repo Edu checkout; plan-repo
readers reach it at `../repo-edu/.agents/references/subject-grammar.md`.

Repo Edu's `.husky/commit-msg` hook and the plan repo's `hooks/commit-msg`
hook enforce this grammar, and the audit-round runner's subject parser reads
it. A change to the shape lands in
this file, the parser and its tests in one commit.

Git writes a merge commit's subject, and no capability tag names Git, so both
hooks admit a commit unchecked while `MERGE_HEAD` exists. The parser refuses a
merge subject, so history readers count nothing from it.

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

<growth>    ::= growth-<level> | pruning-<size>
<level>     ::= none | <size>
<size>      ::= low | medium | high

<severity>  ::= <sequence> | clean
<sequence>  ::= !?<upper>?<lower>?          ; at least one run present; ! requires <upper>
<upper>     ::= (<uppercase><n>)+           ; letters strictly ascending, A before D
<uppercase> ::= A | B | C | D
<lower>     ::= (<lowercase><n>)+           ; letters strictly ascending, a before d
<lowercase> ::= a | b | c | d

<kind>      ::= <conventional>"("<kind-scope>")"
<conventional> ::= build | chore | ci | docs | feat | fix | perf | refactor | revert | style | test | redesign
<kind-scope>   ::= <scope-char>+            ; the package or area the commit primarily belongs to, or repo
<scope-char>   ::= a lowercase letter, a digit or -
```

A slash ends the stem and hyphens stay inside the role token, so scope numbers
cannot be mistaken for an address. Use `all` rather than `complete`, which
would read as an outcome. The role already identifies steps, so the scope
needs no `step` word. One planned step is one commit; `implemented` records
completion, so there is no `impl-all`.

The three alphabets of `<tag>` share no letter, so each letter names its position on its own.
`<conventional>` is the Angular set that Conventional Commits recommends, plus `redesign`; a new
kind enters by editing this line. `clean` fills the severity slot of a round that accepted no
findings and is never a `<role>`.

## One sequence form

Both repos use the same `<sequence>`. The productions below specify where
`<growth>` appears. The shared protocol's
[Severity sequence](round-protocol.md#severity-sequence) owns derivation,
meaning and the reason for the common form.

## Classes

Each class is a production of `<subject>` that fixes which slots are filled.
`<S>` stands for `<sentence>`.

Plan-file commits, plan repo only. No `<kind>`:

```text
<P1 init>    ::= <stem>/init <tag>: <S>
<P2 audit>   ::= <stem>/audit <tag> <growth> <sequence>: <S>
               | <stem>/audit <tag> clean: <S>
<P3 marker>  ::= <stem>/settle <tag>: <S>
               | <stem>/ready <tag>: <S>
               | <stem>/closed <tag>: <S>
```

Implementation commits, either repo. A commit lands in the repo whose files it
changes:

```text
<I1 step>            ::= <stem>/impl-<n> <tag> <kind>: <S>
<I2 fix>             ::= <stem>/impl-audit-<scope> <tag> <growth> <sequence> <kind>: <S>
<I3 deferral record> ::= <stem>/impl-audit-<scope> <tag> <sequence>: <S>
<I4 clean record>    ::= <stem>/impl-audit-<scope> <tag> clean: <S>
<I5 marker>          ::= <stem>/implemented <tag>: <S>
                       | <stem>/closed <tag>: <S> ; Repo Edu only
```

Off-plan commits, no `<form>`:

```text
<O1 Repo Edu> ::= <tag> <growth> <sequence> <kind>: <S>
<O2 plan>     ::= <tag>[ <growth> <sequence>] <kind>: <S>
```

Rules across the classes:

- Every subject carries exactly one `<tag>`, attributed under Repo Edu's
  **Commit Capability Tag** rule.
- I1 carries no `<severity>`, under the plan doctrine's **Shared implementation
  forms**.
- Every file-changing Repo Edu commit except I1 carries a `<sequence>`. An
  off-plan plan-repo commit (O2) carries one when it closes a graded concern
  and none otherwise.
- P1, P3, I3, I4 and I5 change no graded file and fill only the slots their
  productions show. I3 changes no file in its own repo at all.
- Body placement follows the plan doctrine's **Shared implementation forms**.

## Roles

| `<role>` | Repo | Meaning |
| --- | --- | --- |
| `init` | plan | first commit recording the plan's initial solution |
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
P2        planning-rounds/audit ath growth-none B2C2:
P2        planning-rounds/audit ath pruning-low c2d1:
P2        round-file-naming/audit ath clean:
P3        planning-rounds/ready ath:
P3        planning-rounds/closed oth:
I1        planning-rounds/impl-3 oth feat(audit-round):
I2        round-file-naming/impl-audit-all oth growth-none d1 docs(vet):
I2        round-file-naming/impl-audit-all oth pruning-low c3 docs(audit):
I3        planning-rounds/impl-audit-all oth B1:
I4        planning-rounds/impl-audit-all otm clean:
I5        planning-rounds/implemented oth:
O2        ath chore(repo):
O2        ath growth-none c1 docs(claude):
O2        ath growth-low B1c1 docs(claude):
```

Repo Edu:

```text
I1           planning-rounds/impl-4 oth test(audit-round):
I2           round-file-naming/impl-audit-all oth growth-medium c1 fix(audit-round):
I3           planning-rounds/impl-audit-all oth B1:
I4           planning-rounds/impl-audit-all ath clean:
I5           planning-rounds/closed oth:
O1           ath growth-medium c1 feat(audit-round):
O1           abx pruning-low c1 redesign(audit-round):
O1           abx growth-low c1d1 fix(repo):
O1           ath growth-none !B1C1c2d1 fix(renderer-app):
```

## Rulings

Three questions the owning sections left open were ruled on 2026-09-20 and are
fixed here:

1. An off-plan plan-repo commit may carry a `<sequence>`. The sequence is
   evidence the trajectory reads, and an off-plan fix can close a graded
   concern.
2. A `<growth>` mark appears beside every `<sequence>` except a deferral
   record's, and nowhere else. A step is where burden grows by design, and the
   audit rounds that follow grade what it did. A deferral record changes no
   code, so it has nothing to measure. The floor is written as `growth-none`,
   ruled on 2026-10-01: an absent mark could not be told from a forgotten one,
   and a floor is countable in the log only when it is on the page.
3. `<conventional>` is a closed list, the Angular set plus `redesign`. A scan
   by kind can only count what is on the list.
