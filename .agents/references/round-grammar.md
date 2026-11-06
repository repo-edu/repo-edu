# Round document grammar

This reference owns the shape of every assistant-written round document that
the audit-round runner reads. The
[shared round protocol](round-protocol.md) owns what the forms mean and why
they exist. The [subject grammar](subject-grammar.md) owns commit subjects and
commit model records.

The eleven forms are the audit report, vet twin, rebuttal twin, commit record
bullet, implementation-plan step, audit-range sentence, phase result, watch
grade, settling line, judge answer and watch record.

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
<lower-hex>          ::= <digit> | a | b | c | d | e | f
<label>              ::= <label-part>("-"<label-part>)*
<label-part>         ::= one or more lowercase ASCII letters or digits
<title>              ::= non-empty text on one line without ": "
<prose>              ::= non-empty free text
<plan-target>        ::= non-empty text without "]" or a line break

<growth-pattern>     ::= <label>(","<label>)*
<reach>              ::= developer | very-rare | rare | ordinary
<complexity>         ::= minus-high | minus-medium | minus-low | none | low | medium | high

<growth-token>       ::= "[growth-pattern:"<growth-pattern>"]"
<reach-token>        ::= "[reach:"<reach>"]"
<complexity-token>   ::= "[complexity:"<complexity>"]"
<rating-tokens>      ::= <growth-token>" "<reach-token>" "<complexity-token>

<field-token>        ::= "[field:"<field>"]"
<field>              ::= excess | missing
<section-token>      ::= "[section:"<label>"]"
<area-token>         ::= "[area:"<label>"]"
<cover-token>        ::= "[cover:"<label>"]"
<plan-token>         ::= "[plan:"<plan-target>"]"
<applies-token>      ::= "[applies:"<full-sha>"/"<n>"]"
```

The growth-pattern syntax is open. `GROWTH-PATTERNS.md` in the plan repo owns
the admitted labels and their order. Reach and complexity are the closed sets
above.

A `<sha>` is written as the commit's first six characters, the one short form
every report, record and round file shares, so each has the same shape. A
reader resolves it by prefix and accepts a longer form, because records
written before the six-character rule carry full commit IDs. An
`<applies-token>` is the exception. It keeps the full commit ID and resolves it
exactly, so one citation cannot close two deferrals whose short forms collide.

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

The workflow phrase, exactly one plain `Target:` line and exactly one plain
`Judged repos:` line occur in the opening. A report field heading ends the
opening; another level-2 heading remains part of its free Markdown. The target
line repeats the round's target as the runner resolved it: the plan's filename
for a planning round, the filename and step scope for a step audit or the
carried commit references for a commit-scoped round. The first commit round
carries the user's spelling. A later commit-series round carries the
runner-built exact set as full commit IDs. The plan filename carries the phase,
so the opening names no phase of its own. The runner compares the line with the
round it is running and refuses a report that names another target or none
before any later phase starts, so a vet never has to ask which target a report
judged. A planning report uses only the plan head. An implementation report
uses one of the three ordered repository sets above. A finding's token line is
the first block after its heading. Finding numbers run from 1 without gaps
across all fields and titles are distinct across the report.

Each field contains findings or its exact empty sentence, never both.

A widening report ends with the [settling line](#settling-line) as its last
line, after the last finding field, so the reader meets the round's advice
where the report stops instead of hunting for it in the opening. The reader
requires that line on a widening report and refuses one on a detailing or
implementation report, where no series recommendation belongs.

### Implementation location table

The judged set selects the meaning and admission of the implementation
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

[field:excess] [section:decisions] [growth-pattern:hardening,growing-lists] [reach:developer] [complexity:minus-high]

One owner can replace the repeated rules.

## Missing functionality

### 2. C: Name the parser owner

[field:missing] [section:target-state] [growth-pattern:none] [reach:very-rare] [complexity:minus-medium]

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

Refusal: `Widening report must end with a settling line`

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

Refusal: `Only a widening report ends with a settling line`

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

[section:decisions] [growth-pattern:none] [reach:rare] [complexity:minus-low]

The correction belongs in the plan.
```

#### `report/location-plan-area` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123

## Findings

### 1. C: Defer the implementation correction

[area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:ordinary] [complexity:none]

The correction belongs in Repo Edu, outside the judged set.
```

#### `report/location-plan-plan` — refused

Refusal: `Finding 1 has an invalid plan deferral`

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123

## Findings

### 1. C: Reject a local plan deferral

[plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none]

The plan repo is already in the judged set.
```

#### `report/location-repo-edu-section` — refused

Refusal: `Finding 1 has an invalid plan location`

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Reject an unjudged plan location

[section:decisions] [growth-pattern:none] [reach:developer] [complexity:none]

The plan repo is outside the judged set.
```

#### `report/location-repo-edu-area` — parsed

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. B: Correct the report reader

[area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [complexity:low]

The correction belongs in Repo Edu.
```

#### `report/location-repo-edu-plan` — parsed

```markdown
# Implementation audit workflow

Target: HEAD-1
Judged repos: repo-edu@def456

## Findings

### 1. C: Defer the doctrine correction

[plan:../plan/example.md#decisions] [growth-pattern:none] [reach:very-rare] [complexity:medium]

The correction belongs in the plan repo, outside the judged set.
```

#### `report/location-both-section` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123, repo-edu@def456

## Findings

### 1. B: Correct the shared decision

[section:decisions] [growth-pattern:none] [reach:rare] [complexity:high]

The correction belongs in the judged plan repo.
```

#### `report/location-both-area` — parsed

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123, repo-edu@def456

## Findings

### 1. C: Correct the shared reader

[area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:ordinary] [complexity:none]

The correction belongs in the judged Repo Edu checkout.
```

#### `report/location-both-plan` — refused

Refusal: `Finding 1 has an invalid plan deferral`

```markdown
# Implementation audit workflow

Target: example.md 1
Judged repos: plan@abc123, repo-edu@def456

## Findings

### 1. C: Reject a deferral inside the judged set

[plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none]

The plan repo is already in the judged set.
```

#### `report/target-missing` — refused

Refusal: `Report needs one Target: opening naming example.md 1`

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

[plan:] [growth-pattern:none] [reach:developer] [complexity:none]

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

[area:pkg-application] [foo:bar] [growth-pattern:none] [reach:developer] [complexity:none]

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

[section:decisions] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [complexity:none]

A cover belongs only after an area.
```

## Vet twin

### Production

```text
<vet-twin>       ::= (<free-line> | <vet-verdict-line>)*
<vet-verdict-line> ::= <n>". ["<tier>"] "<vet-verdict>
<vet-verdict>    ::= Accept | Revise | Drop | Needs user's ruling
<free-line>      ::= any line that does not have the numbered tier-header shape
```

There is one verdict line for every report finding, in report order. Its number
and tier match that finding. Leading and trailing whitespace carry no content.
A line with the numbered tier-header shape is a verdict attempt and is refused
by name when its word is outside the vet list.

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

## Rebuttal twin

### Production

```text
<rebuttal-twin>       ::= (<free-line> | <rebut-answer-line>)*
<rebut-answer-line>   ::= <n>". ["<tier>"] "<rebut-answer>
<rebut-answer>        ::= Agree | Contest | For user's ruling
```

The rebuttal omits accepted findings. It has one answer for every revised,
dropped or referred finding, in report order. Its number and tier match that
finding. Its word is the auditor's answer, never the verdict it answers: the
number and tier are copied from the vet line and the word is not, so agreement
with the vet's `1. [B] Revise` is written `1. [B] Agree`. Leading and trailing
whitespace carry no content. A line with the numbered tier-header shape is an
answer attempt and is refused by name when its word is outside the rebuttal
list.

### Examples

#### `rebuttal/agree` — parsed

```text
1. [B] Agree
```

#### `rebuttal/contest` — parsed

```text
1. [B] Contest

The cited source says the opposite.
```

#### `rebuttal/for-user-ruling` — parsed

```text
1. [B] For user's ruling

The evidence leaves a real choice.
```

#### `rebuttal/wrong-phase-word` — refused

Refusal: `Rebuttal answer 1 uses the word "Drop"; use Agree, Contest or For user's ruling`

```text
1. [B] Drop
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

A bullet that lands a report finding opens its tokens with that finding's
number from the report. The round data joins the bullet to the finding by this
number, so the bullet's title may say the correction in its own words. A bullet
without a number records work no report finding asked for; the round data keeps
it as unmatched. A number the report does not have is refused when the round
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
- [B] [finding:2] [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [complexity:low] Shared token owner: the report and record readers use one definition.
```

#### `record/repo-edu-plan-deferral` — parsed

```text
- [C] [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none] Doctrine correction: the plan records the missing decision.
```

#### `record/repo-edu-applies` — parsed

```text
- [C] [area:tool-audit-round] [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] [applies:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/2] [growth-pattern:none] [reach:developer] [complexity:none] Reader correction: the cited deferrals are applied.
```

#### `record/plan-audit` — parsed

```text
- B [finding:1] [field:missing] [section:decisions] [growth-pattern:none] [reach:rare] [complexity:minus-low] Parser ownership: the decision names the one owner.
```

#### `record/plan-audit-applies` — parsed

```text
- B [finding:1] [field:missing] [section:decisions] [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] [growth-pattern:none] [reach:rare] [complexity:minus-low] Parser ownership: the cited deferral is applied.
```

#### `record/plan-local` — parsed

```text
- C [section:implementation-plan] [growth-pattern:none] [reach:developer] [complexity:none] Step scope: the step names its hosting repo.
```

#### `record/plan-audit-deferral` — parsed

```text
- B [field:excess] [area:tool-audit-round] [growth-pattern:none] [reach:developer] [complexity:none] Parser correction: Repo Edu owns the parser change.
```

#### `record/plan-repo-edu-deferral` — parsed

```text
- B [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:ordinary] [complexity:medium] Reader correction: Repo Edu owns the parser change.
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
- [C] [area:tool-audit-round] [applies:ABC123/0] [growth-pattern:none] [reach:developer] [complexity:none] Citation shape: the token names a full lowercase commit ID and a position from one.
```

#### `record/plan-audit-applies-out-of-order` — refused

Refusal: `unexpected [applies:...] at 5`

```text
- B [finding:1] [field:missing] [section:decisions] [growth-pattern:none] [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] [reach:rare] [complexity:minus-low] Citation placement: the applies token follows the location.
```

#### `record/plan-stands-reason` — refused

Refusal: `must say exactly "The plan stands."`

```text
- [applies:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1] The plan probably stands.
```

#### `record/repo-edu-finding-not-first` — refused

Refusal: `unexpected [finding:...] at 2; expected [growth-pattern:...]`

```text
- [C] [area:tool-audit-round] [finding:1] [growth-pattern:none] [reach:developer] [complexity:none] Number placement: the finding number opens the tokens.
```

#### `record/repo-edu-misplaced-field` — refused

Refusal: `unexpected [field:...] at 2; expected [growth-pattern:...]`

```text
- [C] [area:tool-audit-round] [field:excess] [growth-pattern:none] [reach:developer] [complexity:none] Field placement: Repo Edu records have no search direction.
```

#### `record/repo-edu-out-of-order` — refused

Refusal: `unexpected [reach:...] at 2; expected [growth-pattern:...]`

```text
- [C] [area:tool-audit-round] [reach:developer] [growth-pattern:none] [complexity:none] Token order: Rating tokens keep grammar order.
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
The JSON object has exactly the two fields shown. Audit, vet, rebuttal, watch,
judge and close admit `finished` or `failed`. Fix and implement also
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
immediately before the final `PHASE RESULT` line. Every other report and fix
carries none, and the reader refuses a line where none is required. A fix that
needs a ruling returns no line, because the round has not ended. It is control
data for the runner, which retains the audit's line, replaced by the fix's line
when a fix runs, as the round's settling recommendation for the series judge.

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

## Judge answer

### Production

```text
<judge-answer>    ::= "Judge: "<judge-decision>". "<one-line-reason>
<judge-decision>  ::= settle | ready | stop | "continue with "<pool-entry>
<pool-entry>      ::= <assistant>" "<model>" "<effort>
<assistant>       ::= claude | codex
<model>           ::= a non-empty model name without spaces
<effort>          ::= low | medium | high | xhigh
<one-line-reason> ::= non-empty text on one line
```

The answer is exactly one plain line. `settle`, `ready` and `stop` are each
admitted only when the runner offers them. A continuation names one series-pool entry exactly
as the runner printed it among the permitted options, and is admitted only when
that entry is offered.

### Examples

#### `judge/stop-available` — parsed

```text
Judge: stop. Both current reads found no remaining real bug.
```

#### `judge/stop-unavailable` — refused

Refusal: `Judge answered stop while the runner offered only codex gpt-5.6-sol xhigh`

```text
Judge: stop. Both current reads found no remaining real bug.
```

#### `judge/settle-available` — parsed

```text
Judge: settle. No concrete shape question remains.
```

#### `judge/settle-unavailable` — refused

Refusal: `Judge answered settle while the runner offered only stop or codex gpt-5.6-sol xhigh`

```text
Judge: settle. No concrete shape question remains.
```

#### `judge/ready-available` — parsed

```text
Judge: ready. Both current reads found the brief complete with no remaining real bug.
```

#### `judge/ready-unavailable` — refused

Refusal: `Judge answered ready while the runner offered only stop or codex gpt-5.6-sol xhigh`

```text
Judge: ready. Both current reads found the brief complete with no remaining real bug.
```

#### `judge/continue-claude` — parsed

```text
Judge: continue with claude claude-opus-5-5 xhigh. Opus has the higher expected yield on the remaining scope.
```

#### `judge/continue-codex` — parsed

```text
Judge: continue with codex gpt-5.6-sol xhigh. Codex has no settled read of the current scope.
```

#### `judge/continue-unoffered` — refused

Refusal: `Judge answered claude opus xhigh while the runner offered only claude opus high`

```text
Judge: continue with claude opus xhigh. A higher effort may find more.
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
