# Round document grammar

This reference owns the shape of every assistant-written round document that
the audit-round runner reads. The
[shared round protocol](round-protocol.md) owns what the forms mean and why
they exist. The [subject grammar](subject-grammar.md) owns commit subjects and
commit model records.

The thirteen forms are the audit report, vet report, rebuttal report, ruler
report, commit record bullet, implementation-plan step, audit-range sentence,
phase result, watch grade, settling line, watch record, move list and split
result.

## Notation

`<x>` is a non-terminal. Double quotes enclose literal text, including spaces
and punctuation. The quotes themselves are not part of the document. Outside
quotes, `|` separates alternatives, `[ ]` encloses an optional part and `( )`
groups. The postfix operators are `?` for zero or one, `*` for zero or more
and `+` for one or more. A comment follows `;`. All other text is literal.

`NL` is one line break and `BLANK` is one empty line. Free Markdown may span
lines unless its production says otherwise.

Every example case has a level-four heading in one of these forms:

```text
#### `<case-id>` — parsed
#### `<case-id>` — refused

Refusal: `<refusal name>`
```

Exactly one fenced example follows each case heading. The parser tests read
the case ID, outcome and fenced content from this reference. A refused case
names the parser refusal it demonstrates.

## Common terminals

```text
<n>                  ::= <non-zero-digit><digit>*
<digit>              ::= 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
<non-zero-digit>     ::= 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
<tier>               ::= A | B | C | D
<sha>                ::= <short-sha><lower-hex>*
<short-sha>          ::= six <lower-hex> characters
<full-sha>           ::= forty <lower-hex> characters
<blob-hash>          ::= forty <lower-hex> characters
<lower-hex>          ::= <digit> | a | b | c | d | e | f
<label>              ::= <label-part>("-"<label-part>)*
<label-part>         ::= one or more lowercase ASCII letters or digits
<title>              ::= non-empty text on one line without ": "
<prose>              ::= non-empty free text
<plan-target>        ::= non-empty text without "]" or a line break

<growth-pattern>     ::= <label>(","<label>)*
<reach>              ::= end-user | developer
<unusual-rarity>     ::= rare | very-rare | extremely-rare
<harm>               ::= low | medium | high
<complexity>         ::= minus-high | minus-medium | minus-low | none | low | medium | high

<growth-token>       ::= "[growth-pattern:"<growth-pattern>"]"
<reach-token>        ::= "[reach:"<reach>"]"
<rarity-tokens>      ::= "[rarity:ordinary]"
                       | "[rarity:"<unusual-rarity>"] [harm:"<harm>"]"
<complexity-token>   ::= "[complexity:"<complexity>"]"
<rating-tokens>      ::= <growth-token>" "<reach-token>" "<rarity-tokens>" "<complexity-token>

<field-token>        ::= "[field:"<field>"]"
<field>              ::= excess | missing
<section-token>      ::= "[section:"<label>"]"
<area-token>         ::= "[area:"<label>"]"
<cover-token>        ::= "[cover:"<label>"]"
<plan-token>         ::= "[plan:"<plan-target>"]"
<applies-token>      ::= "[applies:"<full-sha>"/"<n>"]"
```

The growth-pattern syntax is open. `GROWTH-PATTERNS.md` in the plan repo owns
the admitted labels and their order. Reach, rarity, harm and complexity are the
closed sets above. A harm token follows the rarity exactly when the rarity is
not `ordinary`, so a reader refuses a rarity other than `ordinary` without one
and a harm token after `[rarity:ordinary]`.

A `<sha>` is written as the commit's first six characters, the one short form
every report, record and round file shares, so each has the same shape. A
reader resolves it by prefix and accepts a longer form, because records
written before the six-character rule carry full commit IDs. An
`<applies-token>` is the exception. It keeps the full commit ID and resolves it
exactly, so one citation cannot close two deferrals whose short forms collide.

A `<blob-hash>` is Git's blob hash of one source file's content, as
`git hash-object <path>` prints it in the Repo Edu checkout. Git hashes the
file after the line-ending normalisation of the repository's attributes, so a
hash of the raw bytes can differ.

## Audit report

### Productions

```text
<report>                  ::= <widening-report> | <detailing-report>
                            | <implementation-report>

<widening-report>         ::= <planning-opening><planning-fields> BLANK
                              <settling-line>
<detailing-report>        ::= <planning-opening><planning-fields>
<implementation-report>  ::= <implementation-opening><implementation-field>

<planning-opening>        ::= <opening containing "Planning round workflow">
                              <target-line><planning-judged-line><opening-markdown>
<implementation-opening>  ::= <opening containing "Implementation audit workflow">
                              <target-line><implementation-judged-line><opening-markdown>
<opening-markdown>        ::= free Markdown before the first <report-field-heading>
<report-field-heading>    ::= "## Excess functionality"
                            | "## Missing functionality"
                            | "## Findings"

<target-line>             ::= "Target: "<target>
<target>                  ::= <plan-file>                        ; planning round
                            | <plan-file>" "<step-scope>         ; step audit
                            | <commit-reference>(" "<commit-reference>)*
<plan-file>               ::= the plan's current filename in the plan checkout's active folder
<step-scope>              ::= <n> | <n>"-"<n>
<commit-reference>        ::= a reference as typed, plan@ prefix included

<planning-judged-line>       ::= "Judged repos: plan@"<sha>
<implementation-judged-line> ::= "Judged repos: plan@"<sha>
                               | "Judged repos: repo-edu@"<sha>
                               | "Judged repos: plan@"<sha>", repo-edu@"<sha>

<planning-fields>         ::= <excess-field><missing-field>
<excess-field>            ::= "## Excess functionality" BLANK
                              (<planning-findings> | "No excess findings.")
<missing-field>           ::= "## Missing functionality" BLANK
                              (<planning-findings> | "No missing findings.")
<implementation-field>    ::= "## Findings" BLANK
                              (<implementation-findings> | "No findings.")

<planning-findings>       ::= <planning-finding>+
<implementation-findings> ::= <implementation-finding>+
<planning-finding>        ::= <finding-title> BLANK <planning-token-line>
                              BLANK <finding-evidence>
<implementation-finding> ::= <finding-title> BLANK <implementation-token-line>
                              BLANK <finding-evidence>
<finding-title>           ::= "### "<n>". "<tier>": "<title>
<planning-token-line>     ::= <field-token>" "<section-token>" "<rating-tokens>
<implementation-token-line> ::= <implementation-location>" "<rating-tokens>
<implementation-location> ::= <section-token>
                              | <area-token>(" "<cover-token>)*
                              | <plan-token>
<finding-evidence>        ::= free Markdown without a heading of depth 1 to 3
```

The workflow phrase, exactly one plain `Target:` line and exactly one plain `Judged repos:` line
occur in the opening. An audit report field heading ends the opening; another level-2 heading
remains part of its free Markdown. The target line repeats the round's target as the runner resolved
it: the plan's filename for a planning round, the filename and step scope for a step audit or the
carried commit references for a commit-scoped round. The first commit round carries the user's
spelling. A later commit-series round carries the runner-built exact set as full commit IDs. The
plan filename carries the phase, so the opening names no phase of its own. The runner compares the
line with the round it is running and refuses an audit report that names another target or none
before any later phase starts, so a vetter never has to ask which target an audit report judged. A
planning audit report uses only the plan head. An implementation audit report uses one of the three
ordered repository sets above. A finding's token line is the first block after its heading. Finding
numbers run from 1 without gaps across all fields and titles are distinct across the audit report.

Each field contains findings or its exact empty sentence, never both.

A widening audit report ends with the [settling line](#settling-line) as its last line, after the
last finding field, so the reader meets the round's advice where the audit report stops instead of
hunting for it in the opening. The reader requires that line on a widening audit report and refuses
one on a detailing or implementation audit report, where no series recommendation belongs.

An implementation audit report's opening holds its coverage table, closed by one coverage line. A
plan-scoped round counts steps in the line
`Implementation coverage: I/T implemented; V deviated; N incomplete; R dropped.` A commit-scoped
round counts commits in the line
`Commit coverage: C/T commits hold; V overreached; N short; R superseded.` and prefixes the
six-character SHA in each commit cell with its repo, as `repo-edu@c5c651` or `plan@e8128b`. Each
supplied deferral into Repo Edu whose correction already holds adds one line to the opening in the
form `Satisfied deferral: <full-sha>/<position> <title>.` No parser reads these lines.

### Implementation location table

The judged repo set selects the meaning and admission of the implementation
location token. Each cell names its example case.

| Judged repos | `[section:]` | `[area:]` with optional `[cover:]` | `[plan:]` |
| --- | --- | --- | --- |
| `plan` | Plan location; `report/location-plan-section` | Repo Edu deferral; `report/location-plan-area` | Refused as invalid plan deferral; `report/location-plan-plan` |
| `repo-edu` | Refused as invalid plan location; `report/location-repo-edu-section` | Repo Edu location; `report/location-repo-edu-area` | Plan deferral; `report/location-repo-edu-plan` |
| `plan, repo-edu` | Plan location; `report/location-both-section` | Repo Edu location; `report/location-both-area` | Refused as invalid plan deferral; `report/location-both-plan` |

### Examples

#### `report/planning-findings` — parsed

```markdown
# Planning round workflow

Target: example.md
Judged repos: plan@abc123

## Excess functionality

### 1. B: Remove repeated admission rules

[field:excess] [section:decisions] [growth-pattern:hardening,growing-lists] [reach:developer] [rarity:ordinary] [complexity:minus-high]

One owner can replace the repeated rules.

## Missing functionality

### 2. C: Name the parser owner

[field:missing] [section:target-state] [growth-pattern:none] [reach:end-user] [rarity:very-rare] [harm:medium] [complexity:minus-medium]

The target state needs one owner.
```

#### `report/planning-empty` — parsed

```markdown
# Planning round workflow

Target: example.md
Judged repos: plan@abc123

## Excess functionality

No excess findings.

## Missing functionality

No missing findings.
```

#### `report/planning-depth-two-workflow` — parsed

```markdown
## Planning round workflow

Target: example.md
Judged repos: plan@abc123

## Excess functionality

No excess findings.

## Missing functionality

No missing findings.
```

#### `report/widening-empty` — parsed

```markdown
# Planning round workflow

Target: example-widen.md
Judged repos: plan@abc123

## Excess functionality

No excess findings.

## Missing functionality

No missing findings.

Settling: settle. No concrete shape question remains.
```

#### `report/widening-without-settling` — refused

Refusal: `Widening audit report must end with a settling line`

```markdown
# Planning round workflow

Target: example-widen.md
Judged repos: plan@abc123

## Excess functionality

No excess findings.

## Missing functionality

No missing findings.
```

#### `report/detailing-settling` — refused

Refusal: `Only a widening audit report ends with a settling line`

```markdown
# Planning round workflow

Target: example.md
Judged repos: plan@abc123

## Excess functionality

No excess findings.

## Missing functionality

No missing findings.

Settling: settle. No concrete shape question remains.
```

#### `report/implementation-empty` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123, repo-edu@def456

## Findings

No findings.
```

#### `report/implementation-exact-commit-set` — parsed

```markdown
# Implementation audit workflow

Target: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
Judged repos: repo-edu@def456

## Findings

No findings.
```

#### `report/location-plan-section` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123

## Findings

### 1. B: Keep the plan decision

[section:decisions] [growth-pattern:none] [reach:end-user] [rarity:rare] [harm:low] [complexity:minus-low]

The correction belongs in the plan.
```

#### `report/location-plan-area` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123

## Findings

### 1. C: Defer the implementation correction

[area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:end-user] [rarity:ordinary] [complexity:none]

The correction belongs in Repo Edu, outside the judged repo set.
```

#### `report/location-plan-plan` — refused

Refusal: `Finding 1 has an invalid plan deferral`

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123

## Findings

### 1. C: Reject a local plan deferral

[plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none]

The plan repo is already in the judged repo set.
```

#### `report/location-repo-edu-section` — refused

Refusal: `Finding 1 has an invalid plan location`

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Reject an unjudged plan location

[section:decisions] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none]

The plan repo is outside the judged repo set.
```

#### `report/location-repo-edu-area` — parsed

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. B: Correct the audit report reader

[area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:low]

The correction belongs in Repo Edu.
```

#### `report/location-repo-edu-plan` — parsed

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Defer the doctrine correction

[plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [rarity:very-rare] [harm:high] [complexity:medium]

The correction belongs in the plan repo, outside the judged repo set.
```

#### `report/location-both-section` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123, repo-edu@def456

## Findings

### 1. B: Correct the shared decision

[section:decisions] [growth-pattern:none] [reach:end-user] [rarity:extremely-rare] [harm:high] [complexity:high]

The correction belongs in the judged plan repo.
```

#### `report/location-both-area` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123, repo-edu@def456

## Findings

### 1. C: Correct the shared reader

[area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:end-user] [rarity:ordinary] [complexity:none]

The correction belongs in the judged Repo Edu checkout.
```

#### `report/location-both-plan` — refused

Refusal: `Finding 1 has an invalid plan deferral`

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123, repo-edu@def456

## Findings

### 1. C: Reject a deferral inside the judged repo set

[plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none]

The plan repo is already in the judged repo set.
```

#### `report/target-missing` — refused

Refusal: `Audit report needs one Target: opening naming example.md 1`

```markdown
# Implementation audit workflow

Judged repos: plan@abc123

## Findings

No findings.
```

#### `report/empty-plan-target` — refused

Refusal: `Finding 1 has an empty plan target`

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Reject an empty plan target

[plan:] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none]

A plan deferral must name its destination.
```

#### `report/unknown-token` — refused

Refusal: `Finding 1 has unknown [foo:...] token at 2`

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Reject an unknown token

[area:pkg-application] [foo:bar] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none]

The token is outside the grammar.
```

#### `report/misplaced-cover` — refused

Refusal: `Finding 1 has unexpected [cover:...] location at 2; expected [growth-pattern:...]`

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123

## Findings

### 1. C: Reject a cover beside a section

[section:decisions] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none]

A cover belongs only after an area.
```

#### `report/missing-harm` — refused

Refusal: `Finding 1 has no [harm:...] token after [rarity:rare]`

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Reject a rarity without its harm

[area:pkg-application] [growth-pattern:none] [reach:end-user] [rarity:rare] [complexity:none]

A finding that needs a condition rates its harm.
```

#### `report/ordinary-harm` — refused

Refusal: `Finding 1 has a [harm:...] token after [rarity:ordinary]`

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Reject a harm without a condition

[area:pkg-application] [growth-pattern:none] [reach:end-user] [rarity:ordinary] [harm:low] [complexity:none]

A finding that needs no condition carries no harm level.
```

## Vet report

### Production

```text
<vet-report>        ::= (<free-line> | <vet-verdict-line>)*
<vet-verdict-line>  ::= <n>". ["<tier>"] "<vet-verdict>
                      | <n>". ["<tier>"] Revise to ["<tier>"]"
<vet-verdict>       ::= Accept | Revise | Drop | Needs user's ruling
<free-line>         ::= any line that does not have the numbered tier-header shape
```

There is one verdict line for every audit report finding, in audit report order. Its number
and tier match that finding. Leading and trailing whitespace carry no content.
A revision that changes the finding's tier uses `Revise to [<tier>]`, with the
new tier after `to`. A revision that keeps the audit report tier uses plain `Revise`.
A line with the numbered tier-header shape is a verdict attempt and is refused
by name when its word is not a vet verdict word. Head-drift notes come before
the first verdict line.

### Examples

#### `vet/accept` — parsed

```text
1. [B] Accept
```

#### `vet/revise` — parsed

```text
1. [B] Revise

Use the shared token definition.
```

#### `vet/revise-tier` — parsed

```text
1. [B] Revise to [A]
```

#### `vet/drop` — parsed

```text
1. [B] Drop

The cited behaviour is not present.
```

#### `vet/needs-user-ruling` — parsed

```text
1. [B] Needs user's ruling

The evidence leaves a real choice.
```

#### `vet/wrong-phase-word` — refused

Refusal: `Vet verdict 1 uses the word "Agree"; use Accept, Revise, Drop or Needs user's ruling`

```text
1. [B] Agree
```

#### `vet/tier-on-other-verdict` — refused

Refusal: `Only Revise may name a replacement tier`

```text
1. [B] Drop to [A]
```

#### `vet/malformed-revised-tier` — refused

Refusal: `Vet verdict 1 has malformed revised tier; use Revise to [A], [B], [C] or [D]`

```text
1. [B] Revise to [E]
```

## Rebuttal report

### Production

```text
<rebuttal-report>     ::= (<free-line> | <rebut-answer-line>)*
<rebut-answer-line>   ::= <n>". ["<tier>"] ["<vetter-tag>"] "<rebut-answer>
<vetter-tag>          ::= the capability tag of one vetter of the round's panel
<rebut-answer>        ::= Agree | Contest | For user's ruling
```

The rebuttal omits accepted verdicts. It has one answer for every revise, drop and ruling verdict of
each vetter, in audit report order and, within one finding, in the order the runner supplies the vet
reports. Its number and tier match that finding. The tag names the vetter whose verdict the line
answers, as that vetter's vet report filename carries it, so a reader takes the vetter from the line
alone. The number is the finding's audit report number, not the answer's place in the rebuttal
report. When vetter `abx` accepts finding 1 and revises finding 2, its only answer is numbered 2.
Its word is the rebuttal's answer, never the verdict it answers. The number and tier are copied from
the verdict line and the word is not, so agreement with the `2. [C] Revise` of vetter `abx` is
written `2. [C] [abx] Agree`. Leading and trailing whitespace carry no content. A line with the
numbered tier-header shape is an answer attempt. It is refused by name when it names no vetter, when
its word is not a rebuttal answer word or when its tag names a vetter outside the panel or a vetter
that accepted the finding.

### Examples

The examples answer a panel of two vetters in this order. Vetter `abx` accepted
finding 1 `[B]` and revised finding 2 `[C]`. Vetter `obh` accepted both.

#### `rebuttal/agree` — parsed

```text
2. [C] [abx] Agree
```

#### `rebuttal/contest` — parsed

```text
2. [C] [abx] Contest

The cited source says the opposite.
```

#### `rebuttal/for-user-ruling` — parsed

```text
2. [C] [abx] For user's ruling

The evidence leaves a real choice.
```

#### `rebuttal/wrong-phase-word` — refused

Refusal: `Rebuttal answer 2 uses the word "Drop"; use Agree, Contest or For user's ruling`

```text
2. [C] [abx] Drop
```

#### `rebuttal/missing-vet` — refused

Refusal: `Rebuttal answer 2 names no vetter; put the vetter's tag in brackets after the tier`

```text
2. [C] Agree
```

#### `rebuttal/outside-panel` — refused

Refusal: `Rebuttal answer 2 names atx, which is no vetter of this round; use abx or obh`

```text
2. [C] [atx] Agree
```

#### `rebuttal/accepted-verdict` — refused

Refusal: `Rebuttal answer 2 names obh, which accepted finding 2; an accept needs no answer`

```text
2. [C] [obh] Agree

The revision of finding 2 holds.
```

## Ruler report

### Production

```text
<ruler-report>     ::= <ruler-opening><ruler-entry>+
<ruler-opening>    ::= (<ruler-free-line> | <source-line>)*
<ruler-entry>      ::= <ruler-heading> NL
                       (<ruler-free-line> | <source-line> | <winner-line> | <choice-line>)*
<ruler-heading>    ::= "### "<n>". ["<tier>"]"(" "<heading-text>)?
<heading-text>     ::= any text on one line
<source-line>      ::= ("- ")?"Opened: `"<source>"`"(", "<place>)?
<source>           ::= <absolute-path> | <short-sha>
<absolute-path>    ::= "/" and a character other than whitespace, then text without "`"
<place>            ::= non-empty text on one line
<winner-line>      ::= "Winner: "<winner>". "<one-line-reason>
<winner>           ::= report | neither | <vetter-tag>(", "<vetter-tag>)*
<choice-line>      ::= "Open choice: "<one-line-question>
<one-line-question> ::= non-empty text on one line
<ruler-free-line>  ::= any line that is no <ruler-heading> and opens with none of
                       "Opened:", "- Opened:", "Winner:" and "Open choice:"
```

The ruler report answers the findings the runner gives the ruler. Each given finding has exactly one
entry, in audit report order. Its heading repeats the finding's audit report number and tier, and a
title may follow them. That title may hold `: `, unlike a `<title>`, because no reader uses it and
nothing follows it on the line. The entry holds the finding's evidence record and then its winner
line. ruling.md's [Reading order](../skills/fix/references/ruling.md#reading-order) owns what the
record says, and its free lines carry the points, each side's claims, the passages read and what
each passage settles.

A source line names one source the ruler opened, in backticks: a file by its absolute path or a
commit by its first six characters. A place in the source may follow after a comma. The form is
fixed because the runner matches each name as plain text against the ruler's logged tool lines and
the files it supplied whole, and resolves no relative path. Each entry names at least one source. A
source line before the first heading belongs to no entry but still counts among the report's
sources.

The winner line names one winner in the user's winner words: `report`, `neither` or one or more tags
of the round's panel joined by a comma and a space. The one-line reason follows after a full stop.
Each entry has exactly one winner line.

An entry has at most one open-choice line. It states, as one line, the choice the ruler leaves to
the user when a real choice remains, and the runner asks the user that choice before the fix. An
open-choice line before the first heading belongs to no finding and is refused.

Leading and trailing whitespace carry no content. A line that opens with `Opened:`, `- Opened:`,
`Winner:` or `Open choice:` is a source, winner or choice attempt and is refused by name when it
does not fit.

### Examples

The examples answer a ruler given finding 2 `[C]` of a round whose panel is `abx` and `obh`.

#### `ruler/vetter-winner` — parsed

```markdown
### 2. [C] Keep the record

Point 1: whether the reader refuses an empty plan target.
- Audit report: the reader stores it as a deferral.
- Vetter abx: the reader refuses it.
- Opened: `/path/to/repo-edu/.agents/references/round-grammar.md`, the case report/empty-plan-target.
- Read: "Refusal: `Finding 1 has an empty plan target`".
- Settles: the reader refuses it, so vetter abx is right.

Winner: abx. The grammar's refusal case shows that the reader refuses an empty plan target.
```

#### `ruler/report-winner` — parsed

```markdown
### 2. [C]

Point 1: whether the step commit changed the reader.
- Opened: `abc123`, its diff of the reader.
- Settles: it did, so the finding stands as written.

Winner: report. The step commit changed the reader as the audit report says.
```

#### `ruler/neither-winner` — parsed

```markdown
Head drift: none.

### 2. [C] Keep the record

- Opened: `/path/to/plan/BOUNDARIES.md`, entry 8.

Winner: neither. A real choice remains between the two corrections.
Open choice: whether the reader keeps the field or the fix drops it.
```

#### `ruler/two-vetters` — parsed

```markdown
### 2. [C] Keep the record

- Opened: `/path/to/repo-edu/tools/audit-round/src/report.ts`

Winner: abx, obh. Both revisions land the same correction.
```

#### `ruler/relative-source` — refused

Refusal: `Ruler finding 2 has a source that is no absolute path or six-character commit`

```markdown
### 2. [C] Keep the record

- Opened: `tools/audit-round/src/report.ts`

Winner: abx. The reader refuses it.
```

#### `ruler/no-source` — refused

Refusal: `Ruler finding 2 names no opened source`

```markdown
### 2. [C] Keep the record

The audit report quotes the reader.

Winner: abx. The reader refuses it.
```

#### `ruler/unknown-winner` — refused

Refusal: `Ruler finding 2 names the winner "both"; use report, neither or tags of abx or obh`

```markdown
### 2. [C] Keep the record

- Opened: `abc123`

Winner: both. Each side holds part of it.
```

#### `ruler/two-choices` — refused

Refusal: `Ruler finding 2 needs at most one Open choice: line`

```markdown
### 2. [C] Keep the record

- Opened: `abc123`

Winner: abx. A real choice remains.
Open choice: whether to keep the field.
Open choice: whether to drop the test.
```

#### `ruler/outside-panel` — refused

Refusal: `Ruler finding 2 names atx, which is no vetter of this round; use abx or obh`

```markdown
### 2. [C] Keep the record

- Opened: `abc123`

Winner: atx. The reader refuses it.
```

#### `ruler/missing-reason` — refused

Refusal: `Ruler finding 2 needs a one-line reason after its winner`

```markdown
### 2. [C] Keep the record

- Opened: `abc123`

Winner: abx
```

#### `ruler/two-winners` — refused

Refusal: `Ruler finding 2 needs one Winner: line`

```markdown
### 2. [C] Keep the record

- Opened: `abc123`

Winner: abx. The reader refuses it.
Winner: obh. The reader stores it.
```

#### `ruler/not-given` — refused

Refusal: `Ruler report answers finding 1, which the ruler was not given`

```markdown
### 1. [B] Preserve the evidence

- Opened: `abc123`

Winner: report. The finding stands.
```

#### `ruler/other-tier` — refused

Refusal: `Ruler finding 2 has tier [B]; the audit report graded it [C]`

```markdown
### 2. [B] Keep the record

- Opened: `abc123`

Winner: abx. The reader refuses it.
```

#### `ruler/missing-entry` — refused

Refusal: `Ruler report needs an entry for finding 2`

```markdown
Every given finding is settled elsewhere.
```

## Commit record bullet

### Productions

```text
<record-bullet>          ::= <graded-record-bullet> | <citation-bullet>
<graded-record-bullet>   ::= <repo-edu-bullet> | <plan-bullet>
<applies-prefix>         ::= (<applies-token>" ")*

<repo-edu-bullet>        ::= "- ["<tier>"] "<finding-number>?<repo-edu-record-location>" "
                             <applies-prefix><rating-tokens>" "<title>": "<prose>
<repo-edu-record-location> ::= <area-token>(" "<cover-token>)* | <plan-token>

<plan-bullet>            ::= "- "<tier>" "<finding-number>?<plan-record-location>" "
                             <applies-prefix><rating-tokens>" "<title>": "<prose>
<finding-number>         ::= "[finding:"<n>"] "
<plan-record-location>   ::= <planning-record-location>
                           | <planning-deferral-location>
                           | <section-token>
                           | <area-token>(" "<cover-token>)*
<planning-record-location> ::= <field-token>" "<section-token>
<planning-deferral-location> ::= <field-token>" "<area-token>(" "<cover-token>)*
<citation-bullet>        ::= "- "<applies-token>(" "<applies-token>)*" The plan stands."
```

A bullet that lands an audit report's finding opens its tokens with that
finding's number from the audit report. The round data joins the bullet to the finding by this
number, so the bullet's title may say the correction in its own words. A bullet
without a number records work no audit report finding asked for; the round data keeps
it as unmatched. A number the audit report does not have is refused when the round
data settles.

A Repo Edu record uses the bracketed tier. Its local location is one area and
any cover areas. A plan deferral replaces all area and cover tokens with one
plan token.

A plan-repo record uses the unbracketed tier. A `plan-audit` record has one
field followed by its section or its deferred Repo Edu area. Other local
records have one section without a field. A Repo Edu deferral in any other
record replaces the section with one area and any cover areas.

A graded bullet carries each deferral it applies after its location and before
its rating tokens. An untiered citation bullet records that the plan needs no
change. Each citation names the deferring commit by its full commit ID and that
commit's deferral position into the destination repo, counted from one in body
order. The commit ID uses lowercase hexadecimal and the position is always
present, including for the first and only deferral.

### Examples

#### `record/repo-edu-local` — parsed

```text
- [B] [finding:2] [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:low] Shared token owner: the audit report and record readers use one definition.
```

#### `record/repo-edu-plan-deferral` — parsed

```text
- [C] [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none] Doctrine correction: the plan records the missing decision.
```

#### `record/repo-edu-applies` — parsed

```text
- [C] [area:tool-audit-round] [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] [applies:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/2] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none] Reader correction: the cited deferrals are applied.
```

#### `record/plan-audit` — parsed

```text
- B [finding:1] [field:missing] [section:decisions] [growth-pattern:none] [reach:end-user] [rarity:rare] [harm:low] [complexity:minus-low] Parser ownership: the decision names the one owner.
```

#### `record/plan-audit-applies` — parsed

```text
- B [finding:1] [field:missing] [section:decisions] [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] [growth-pattern:none] [reach:end-user] [rarity:rare] [harm:low] [complexity:minus-low] Parser ownership: the cited deferral is applied.
```

#### `record/plan-local` — parsed

```text
- C [section:implementation-plan] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none] Step scope: the step names its hosting repo.
```

#### `record/plan-audit-deferral` — parsed

```text
- B [field:excess] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none] Parser correction: Repo Edu owns the parser change.
```

#### `record/plan-repo-edu-deferral` — parsed

```text
- B [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:end-user] [rarity:ordinary] [complexity:medium] Reader correction: Repo Edu owns the parser change.
```

#### `record/plan-stands` — parsed

```text
- [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] The plan stands.
```

#### `record/repo-edu-plan-stands` — parsed

```text
- [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] [applies:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/2] The plan stands.
```

#### `record/repo-edu-invalid-applies` — refused

Refusal: `expected 40 lowercase commit sha characters and a position from 1`

```text
- [C] [area:tool-audit-round] [applies:ABC123/0] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none] Citation shape: the token names a full lowercase commit ID and a position from one.
```

#### `record/plan-audit-applies-out-of-order` — refused

Refusal: `unexpected [applies:...] at 5`

```text
- B [finding:1] [field:missing] [section:decisions] [growth-pattern:none] [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] [reach:end-user] [rarity:rare] [harm:low] [complexity:minus-low] Citation placement: the applies token follows the location.
```

#### `record/plan-stands-reason` — refused

Refusal: `must say exactly "The plan stands."`

```text
- [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] The plan probably stands.
```

#### `record/repo-edu-finding-not-first` — refused

Refusal: `unexpected [finding:...] at 2; expected [growth-pattern:...]`

```text
- [C] [area:tool-audit-round] [finding:1] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none] Number placement: the finding number opens the tokens.
```

#### `record/repo-edu-misplaced-field` — refused

Refusal: `unexpected [field:...] at 2; expected [growth-pattern:...]`

```text
- [C] [area:tool-audit-round] [field:excess] [growth-pattern:none] [reach:developer] [rarity:ordinary] [complexity:none] Field placement: Repo Edu records have no search direction.
```

#### `record/repo-edu-out-of-order` — refused

Refusal: `unexpected [reach:...] at 2; expected [growth-pattern:...]`

```text
- [C] [area:tool-audit-round] [reach:developer] [growth-pattern:none] [rarity:ordinary] [complexity:none] Token order: Rating tokens keep grammar order.
```

#### `record/repo-edu-missing-harm` — refused

Refusal: `no [harm:...] token after [rarity:very-rare]`

```text
- [B] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [rarity:very-rare] [complexity:low] Missing harm: A finding that needs a condition rates its harm.
```

#### `record/plan-audit-ordinary-harm` — refused

Refusal: `a [harm:...] token after [rarity:ordinary]`

```text
- C [finding:1] [field:missing] [section:decisions] [growth-pattern:none] [reach:developer] [rarity:ordinary] [harm:low] [complexity:none] Ordinary harm: A finding that needs no condition carries no harm level.
```

## Implementation-plan step

### Production

```text
<implementation-plan> ::= "## Implementation plan" BLANK <step-preface>?<step-list>
<step-preface>        ::= free Markdown without an ordered list
<step-list>           ::= <step>+
<step>                ::= <n>". **"<step-title>".** "<host-sentence><step-detail>
<step-title>          ::= non-empty text
<host-sentence>       ::= Hosted in Repo Edu.
                        | Hosted in the plan repo.
                        | Hosted in both repos.
<step-detail>         ::= optional free Markdown in the same list item
```

The first ordered list below the single depth-2 `Implementation plan` heading
is the step list. Its items are numbered by list order. The bold title and host
sentence open each item.

### Examples

#### `plan-step/repo-edu` — parsed

```markdown
# Example

## Implementation plan

1. **Write the parser.** Hosted in Repo Edu. Add the shared reader.
```

#### `plan-step/plan` — parsed

```markdown
# Example

## Implementation plan

1. **Update the doctrine.** Hosted in the plan repo. Link the grammar.
```

#### `plan-step/both` — parsed

```markdown
# Example

## Implementation plan

1. **Route both workflows.** Hosted in both repos. Update each owning file.
```

#### `plan-step/preface` — parsed

```markdown
# Example

## Implementation plan

The steps follow this short preface.

1. **Write the parser.** Hosted in Repo Edu. Add the shared reader.
```

#### `plan-step/title-without-full-stop` — refused

Refusal: `Implementation plan item 1 needs a bold title ending in a full stop.`

```markdown
# Example

## Implementation plan

1. **Write the parser** Hosted in Repo Edu. Add the shared reader.
```

## Audit ranges

### Production

```text
<execution-and-audits> ::= "### Execution and audits" BLANK <audit-prose>
<audit-prose>          ::= free Markdown containing exactly one <audit-ranges>
<audit-ranges>         ::= "Audit ranges: "<step-scope>(", "<step-scope>)*"."
```

The audit-range sentence sits in the depth-3 `Execution and audits` subsection
inside the Implementation plan section. Its ranges start at step 1, follow each
other without a gap or overlap and end at the last listed step. Prose may
precede or follow the sentence in the same paragraph.

### Examples

#### `audit-ranges/multiple` — parsed

```markdown
# Example

## Implementation plan

1. **Write the reader.** Hosted in Repo Edu.
2. **Add its fixtures.** Hosted in Repo Edu.
3. **Use the range.** Hosted in Repo Edu.
4. **Update the doctrine.** Hosted in the plan repo.
5. **Update its mirrors.** Hosted in the plan repo.

### Execution and audits

The first three steps change the runner. Audit ranges: 1-2, 3, 4-5.
```

#### `audit-ranges/full` — parsed

```markdown
# Example

## Implementation plan

1. **Write the reader.** Hosted in Repo Edu.
2. **Use the range.** Hosted in Repo Edu.
3. **Update the doctrine.** Hosted in the plan repo.

### Execution and audits

Audit ranges: 1-3.
```

#### `audit-ranges/followed-by-prose` — parsed

```markdown
# Example

## Implementation plan

1. **Write the reader.** Hosted in Repo Edu.
2. **Use the range.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 1-2. Both steps change the reader.
```

#### `audit-ranges/list-item` — parsed

```markdown
# Example

## Implementation plan

1. **Write the reader.** Hosted in Repo Edu.
2. **Use the range.** Hosted in Repo Edu.

### Execution and audits

- Audit ranges: 1-2.
```

#### `audit-ranges/missing` — refused

Refusal: `Execution and audits subsection needs exactly one Audit ranges: sentence.`

```markdown
# Example

## Implementation plan

1. **Write the reader.** Hosted in Repo Edu.

### Execution and audits

Audit the reader after it lands.
```

#### `audit-ranges/gap` — refused

Refusal: `Audit ranges leave a gap before step 4; expected step 3.`

```markdown
# Example

## Implementation plan

1. **Write the reader.** Hosted in Repo Edu.
2. **Add its fixtures.** Hosted in Repo Edu.
3. **Use the range.** Hosted in Repo Edu.
4. **Update the doctrine.** Hosted in the plan repo.

### Execution and audits

Audit ranges: 1-2, 4.
```

#### `audit-ranges/overlap` — refused

Refusal: `Audit ranges overlap at step 2; expected step 3.`

```markdown
# Example

## Implementation plan

1. **Write the reader.** Hosted in Repo Edu.
2. **Add its fixtures.** Hosted in Repo Edu.
3. **Use the range.** Hosted in Repo Edu.
4. **Update the doctrine.** Hosted in the plan repo.

### Execution and audits

Audit ranges: 1-2, 2-4.
```

## Phase result

### Production

```text
<phase-result-line> ::= "PHASE RESULT: "<phase-result>
<phase-result>      ::= {"status":"finished","reason":null}
                      | {"status":"failed","reason":<reason-string>}
                      | {"status":"needs-ruling","reason":null} ; fix or implement only
<reason-string>     ::= a JSON string containing non-whitespace text
```

The phase result is the response's last line and stays outside a code fence.
The JSON object has exactly the two fields shown. Audit, vet, rebuttal, ruler, design,
watch and close admit `finished` or `failed`. Fix and implement also
admit `needs-ruling`.

### Phase table

| Phase | `finished` | `failed` | `needs-ruling` |
| --- | --- | --- | --- |
| Fix or implement | Parsed; `phase-result/finished` | Parsed; `phase-result/failed` | Parsed; `phase-result/work-needs-ruling` |
| Every other phase | Parsed; `phase-result/finished` | Parsed; `phase-result/failed` | Refused; `phase-result/report-needs-ruling` |

### Examples

#### `phase-result/finished` — parsed

```text
PHASE RESULT: {"status":"finished","reason":null}
```

#### `phase-result/failed` — parsed

```text
PHASE RESULT: {"status":"failed","reason":"The report is malformed."}
```

#### `phase-result/work-needs-ruling` — parsed

```text
PHASE RESULT: {"status":"needs-ruling","reason":null}
```

#### `phase-result/report-needs-ruling` — refused

Refusal: `Report PHASE RESULT must finish`

```text
PHASE RESULT: {"status":"needs-ruling","reason":null}
```

## Watch grade

### Production

```text
<watch-grade-line> ::= "Watch grade: "<grade>
<grade>            ::= green | amber | red
```

The grade is exactly one plain line after the finished watch Markdown and
immediately before the final `PHASE RESULT` line. It is control data for the
runner and is not part of the saved document.

### Examples

#### `watch-grade/green` — parsed

```text
Watch grade: green
```

#### `watch-grade/amber` — parsed

```text
Watch grade: amber
```

#### `watch-grade/red` — parsed

```text
Watch grade: red
```

#### `watch-grade/unknown` — refused

Refusal: `Invalid watch grade line`

```text
Watch grade: yellow
```

## Settling line

### Production

```text
<settling-line>   ::= "Settling: "<settling-advice>". "<one-line-reason>
<settling-advice> ::= settle | keep open
<one-line-reason> ::= non-empty text on one line
```

The line is exactly one plain line and closes two widening outputs. A widening
audit report ends with it as its last line, after the last finding field, under
[Audit report](#audit-report). A widening fix returns it after its Markdown,
immediately before the final `PHASE RESULT` line. Every other audit report and
fix carries none, and the reader refuses a line where none is required. A fix that
needs a ruling returns no line, because the round has not ended. It is control
data for the runner, which retains the audit's line, replaced by the fix's line
when a fix runs, as the round's settling recommendation for the series decision.

### Examples

#### `settling/settle` — parsed

```text
Settling: settle. Findings 1 to 3 landed and no shape question remains.
```

#### `settling/keep-open` — parsed

```text
Settling: keep open. Decision 3 needs the landed step's timing evidence before the shape can close.
```

#### `settling/unknown` — refused

Refusal: `Invalid settling line`

```text
Settling: maybe. The shape might be done.
```

## Watch record

### Production

```text
<watch-file>    ::= {<stem-string>:<watch-record>, ...}
<watch-record>  ::= {
                    "heads":{
                      "repo-edu":<sha-string>,
                      "plan":<sha-string>
                    },
                    "grade":<grade>,
                    "written":<date-string>
                  }
<grade>         ::= "green" | "amber" | "red"
<stem-string>   ::= a JSON string containing an episode stem
<sha-string>    ::= a JSON string containing a graded short commit sha
<date-string>   ::= a JSON string containing a local YYYY-MM-DD date
```

The file is a JSON object keyed by episode stem. Each entry has exactly the
three fields shown, and `heads` has both repository heads. Updating one entry
keeps the others unchanged.

### Examples

#### `watch/two-heads` — parsed

```json
{
  "example": {
    "heads": {
      "repo-edu": "def456",
      "plan": "abc123"
    },
    "grade": "amber",
    "written": "2026-10-12"
  }
}
```

#### `watch/missing-plan-head` — refused

Refusal: `Watch record is missing the plan head`

```json
{
  "example": {
    "heads": {
      "repo-edu": "def456"
    },
    "grade": "amber",
    "written": "2026-10-12"
  }
}
```

#### `watch/missing-repo-edu-head` — refused

Refusal: `Watch record is missing the repo-edu head`

```json
{
  "example": {
    "heads": {
      "plan": "abc123"
    },
    "grade": "amber",
    "written": "2026-10-12"
  }
}
```

## Move list

### Production

```text
<move-list>      ::= "# Move list" BLANK <source-line> NL <hash-line> NL <area-line>
                     BLANK (<moves> | <no-split>)
<source-line>    ::= "Source: `"<repo-path>"`"
<hash-line>      ::= "Hash: "<blob-hash>
<area-line>      ::= "Area: "<label>
<moves>          ::= "## Moves" BLANK <move>(BLANK <move>)*
<move>           ::= "### "<n>". `"<repo-path>"`" BLANK
                     "Responsibility: "<sentence> NL
                     "Ranges: "<line-range>(", "<line-range>)*
<line-range>     ::= <n> | <n>"-"<n>
<no-split>       ::= "## No split" BLANK "Result: "<list-result>". "<one-line-reason>
<list-result>    ::= fine | needs-plan
<repo-path>      ::= a path relative to the Repo Edu root, without "`" or a line break
<sentence>       ::= non-empty text on one line
```

A move list says how one source file is divided. It names the source by its
path, the source's content as its blob hash and the source's primary area by
its area ID. Every line number in the list counts lines of that content, before
any move.

Each move names one target file and the ranges of complete top-level statements
that go there. The moves are numbered from 1 without gaps, in the order the
statement move tool carries them out, and no target appears twice. A target's
ranges go to it in the order given. A range is one line or two line numbers
whose second is not smaller than its first, and it includes both ends. The
responsibility line states in one sentence what the target holds.

The no-split form holds a result instead of moves. `fine` says the file should
stay whole and `needs-plan` says its division needs a plan, and the reason
follows on the same line. A fix that withdraws a list replaces its moves with
this form and keeps the opening as it was. A design session that answers that
the file is fine or needs a plan returns this form too.

The document holds nothing else. Leading and trailing whitespace carry no
content, and one or more empty lines count as one `BLANK`.

### Examples

#### `move-list/moves` — parsed

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
Area: pkg-domain

## Moves

### 1. `packages/domain/src/roster-names.ts`

Responsibility: Builds and compares the display names of roster members.
Ranges: 10-40, 52-60

### 2. `packages/domain/src/roster-import.ts`

Responsibility: Reads a roster from an imported student list.
Ranges: 61-118, 120
```

#### `move-list/no-split` — parsed

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
Area: pkg-domain

## No split

Result: needs-plan. The seam between names and imports cuts through one function.
```

#### `move-list/short-hash` — refused

Refusal: `Move list hash must be forty lowercase hexadecimal characters`

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e5
Area: pkg-domain

## No split

Result: fine. The file holds one responsibility.
```

#### `move-list/numbering-gap` — refused

Refusal: `Move list move 2 is numbered 3`

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
Area: pkg-domain

## Moves

### 1. `packages/domain/src/roster-names.ts`

Responsibility: Builds and compares the display names of roster members.
Ranges: 10-40

### 3. `packages/domain/src/roster-import.ts`

Responsibility: Reads a roster from an imported student list.
Ranges: 61-118
```

#### `move-list/reversed-range` — refused

Refusal: `Move list move 1 has the range 40-10, whose end comes before its start`

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
Area: pkg-domain

## Moves

### 1. `packages/domain/src/roster-names.ts`

Responsibility: Builds and compares the display names of roster members.
Ranges: 40-10
```

#### `move-list/repeated-target` — refused

Refusal: `Move list names the target packages/domain/src/roster-names.ts in moves 1 and 2`

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
Area: pkg-domain

## Moves

### 1. `packages/domain/src/roster-names.ts`

Responsibility: Builds the display names of roster members.
Ranges: 10-40

### 2. `packages/domain/src/roster-names.ts`

Responsibility: Compares the display names of roster members.
Ranges: 52-60
```

#### `move-list/unknown-result` — refused

Refusal: `Move list result must be fine or needs-plan`

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
Area: pkg-domain

## No split

Result: skipped. Another run changed the file.
```

## Split result

### Production

```text
<split-result-line> ::= "SPLIT RESULT: "<split-result>
<split-result>      ::= {"result":<result-word>,"hash":<hash-string>,"message":<message-string>}
<result-word>       ::= "made" | "fine" | "needs-plan" | "skipped" | "checks-failed"
<hash-string>       ::= a JSON string containing a <blob-hash>
<message-string>    ::= a JSON string containing non-whitespace text
```

A split call ends with one split result line, which the `split` command prints
last. The JSON object has exactly the three fields shown. The result word names
one of the five results:

1. `made`: the split was made and committed.
2. `fine`: no split, because the file should stay whole.
3. `needs-plan`: no split, because the file needs a plan.
4. `skipped`: no split, because the call was skipped.
5. `checks-failed`: no split, because the checks or the tests failed and the
   files are back as they were.

The hash names the content of the source file that the design session read.
The message says why, and may span lines inside its JSON string. A move list's
no-split form uses the words `fine` and `needs-plan` with these meanings.

### Examples

#### `split-result/made` — parsed

```text
SPLIT RESULT: {"result":"made","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":"packages/domain/src/roster.ts was split into 2 new files."}
```

#### `split-result/checks-failed` — parsed

```text
SPLIT RESULT: {"result":"checks-failed","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":"pnpm check failed:\nsrc/roster.ts(4,10): error TS2305."}
```

#### `split-result/unknown-result` — refused

Refusal: `Split result must be made, fine, needs-plan, skipped or checks-failed`

```text
SPLIT RESULT: {"result":"split","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":"The split was made."}
```

#### `split-result/short-hash` — refused

Refusal: `Split result hash must be forty lowercase hexadecimal characters`

```text
SPLIT RESULT: {"result":"fine","hash":"3b18e5","message":"The file holds one responsibility."}
```

#### `split-result/empty-message` — refused

Refusal: `Split result needs a message`

```text
SPLIT RESULT: {"result":"skipped","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":" "}
```
