# Round document grammar

This reference owns the shape of every assistant-written round document that
the audit-round runner reads. The
[shared round protocol](round-protocol.md) owns what the forms mean and why
they exist. The [subject grammar](subject-grammar.md) owns commit subjects and
commit model records.

The eight forms are the audit report, vet twin, rebuttal twin, commit record
bullet, implementation-plan step, phase result, judge answer and watch record.

## Notation

`<x>` is a non-terminal. Double quotes enclose literal text, including spaces
and punctuation. The quotes themselves are not part of the document. Outside
quotes, `|` separates alternatives, `[ ]` encloses an optional part and `( )`
groups. The postfix operators are `?` for zero or one, `*` for zero or more
and `+` for one or more. A comment follows `;`. All other text is literal.

`NL` is one line break and `BLANK` is one empty line. Markdown indentation
means the spaces needed to keep a line inside its numbered list item. Free
Markdown may span lines unless its production says otherwise.

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
<sha>                ::= <lower-hex>+
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
```

The growth-pattern syntax is open. `GROWTH-PATTERNS.md` in the plan repo owns
the admitted labels and their order. Reach and complexity are the closed sets
above.

## Audit report

### Productions

```text
<report>                  ::= <planning-report> | <implementation-report>

<planning-report>         ::= <planning-opening><planning-fields>
<implementation-report>  ::= <implementation-opening><implementation-field>

<planning-opening>        ::= <opening containing "Planning round workflow">
                              <planning-judged-line><opening-markdown>
<implementation-opening>  ::= <opening containing "Implementation audit workflow">
                              <implementation-judged-line><opening-markdown>
<opening-markdown>        ::= free Markdown before the first depth-2 heading

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
<finding-title>           ::= <n>". **"<tier>": "<title>"**"
<planning-token-line>     ::= <field-token>" "<section-token>" "<rating-tokens>
<implementation-token-line> ::= <implementation-location>" "<rating-tokens>
<implementation-location> ::= <section-token>
                              | <area-token>(" "<cover-token>)*
                              | <plan-token>
<finding-evidence>        ::= indented free Markdown
```

The workflow phrase and exactly one plain `Judged repos:` line occur in the
opening. A planning report uses only the plan head. An implementation report
uses one of the three ordered repository sets above. A finding's token line is
the first content after its bold title. Finding numbers run from 1 without gaps
across all fields and titles are distinct across the report.

Each field contains findings or its exact empty sentence, never both.

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

Judged repos: plan@abc123

## Excess functionality

1. **B: Remove repeated admission rules**

   [field:excess] [section:decisions] [growth-pattern:hardening,growing-lists] [reach:developer] [complexity:minus-high]

   One owner can replace the repeated rules.

## Missing functionality

2. **C: Name the parser owner**

   [field:missing] [section:target-state] [growth-pattern:none] [reach:very-rare] [complexity:minus-medium]

   The target state needs one owner.
```

#### `report/planning-empty` — parsed

```markdown
# Planning round workflow

Judged repos: plan@abc123

## Excess functionality

No excess findings.

## Missing functionality

No missing findings.
```

#### `report/implementation-empty` — parsed

```markdown
# Implementation audit workflow

Judged repos: plan@abc123, repo-edu@def456

## Findings

No findings.
```

#### `report/location-plan-section` — parsed

```markdown
# Implementation audit workflow

Judged repos: plan@abc123

## Findings

1. **B: Keep the plan decision**

   [section:decisions] [growth-pattern:none] [reach:rare] [complexity:minus-low]

   The correction belongs in the plan.
```

#### `report/location-plan-area` — parsed

```markdown
# Implementation audit workflow

Judged repos: plan@abc123

## Findings

1. **C: Defer the implementation correction**

   [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:ordinary] [complexity:none]

   The correction belongs in Repo Edu, outside the judged set.
```

#### `report/location-plan-plan` — refused

Refusal: `Finding 1 has an invalid plan deferral`

```markdown
# Implementation audit workflow

Judged repos: plan@abc123

## Findings

1. **C: Reject a local plan deferral**

   [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none]

   The plan repo is already in the judged set.
```

#### `report/location-repo-edu-section` — refused

Refusal: `Finding 1 has an invalid plan location`

```markdown
# Implementation audit workflow

Judged repos: repo-edu@def456

## Findings

1. **C: Reject an unjudged plan location**

   [section:decisions] [growth-pattern:none] [reach:developer] [complexity:none]

   The plan repo is outside the judged set.
```

#### `report/location-repo-edu-area` — parsed

```markdown
# Implementation audit workflow

Judged repos: repo-edu@def456

## Findings

1. **B: Correct the report reader**

   [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [complexity:low]

   The correction belongs in Repo Edu.
```

#### `report/location-repo-edu-plan` — parsed

```markdown
# Implementation audit workflow

Judged repos: repo-edu@def456

## Findings

1. **C: Defer the doctrine correction**

   [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:very-rare] [complexity:medium]

   The correction belongs in the plan repo, outside the judged set.
```

#### `report/location-both-section` — parsed

```markdown
# Implementation audit workflow

Judged repos: plan@abc123, repo-edu@def456

## Findings

1. **B: Correct the shared decision**

   [section:decisions] [growth-pattern:none] [reach:rare] [complexity:high]

   The correction belongs in the judged plan repo.
```

#### `report/location-both-area` — parsed

```markdown
# Implementation audit workflow

Judged repos: plan@abc123, repo-edu@def456

## Findings

1. **C: Correct the shared reader**

   [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:ordinary] [complexity:none]

   The correction belongs in the judged Repo Edu checkout.
```

#### `report/location-both-plan` — refused

Refusal: `Finding 1 has an invalid plan deferral`

```markdown
# Implementation audit workflow

Judged repos: plan@abc123, repo-edu@def456

## Findings

1. **C: Reject a deferral inside the judged set**

   [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none]

   The plan repo is already in the judged set.
```

#### `report/empty-plan-target` — refused

Refusal: `Finding 1 has an empty plan target`

```markdown
# Implementation audit workflow

Judged repos: repo-edu@def456

## Findings

1. **C: Reject an empty plan target**

   [plan:] [growth-pattern:none] [reach:developer] [complexity:none]

   A plan deferral must name its destination.
```

#### `report/unknown-token` — refused

Refusal: `Finding 1 has unknown [foo:...] token at 2`

```markdown
# Implementation audit workflow

Judged repos: repo-edu@def456

## Findings

1. **C: Reject an unknown token**

   [area:pkg-application] [foo:bar] [growth-pattern:none] [reach:developer] [complexity:none]

   The token is outside the grammar.
```

#### `report/misplaced-cover` — refused

Refusal: `Finding 1 has unexpected [cover:...] location at 2; expected [growth-pattern:...]`

```markdown
# Implementation audit workflow

Judged repos: plan@abc123

## Findings

1. **C: Reject a cover beside a section**

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
finding. Leading and trailing whitespace carry no content. A line with the
numbered tier-header shape is an answer attempt and is refused by name when its
word is outside the rebuttal list.

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
<record-bullet>          ::= <repo-edu-bullet> | <plan-bullet>

<repo-edu-bullet>        ::= "- ["<tier>"] "<repo-edu-record-location>" "
                             <rating-tokens>" "<title>": "<prose>
<repo-edu-record-location> ::= <area-token>(" "<cover-token>)* | <plan-token>

<plan-bullet>            ::= "- "<tier>" "<plan-record-location>" "
                             <rating-tokens>" "<title>": "<prose>
<plan-record-location>   ::= <planning-record-location>
                           | <planning-deferral-location>
                           | <section-token>
                           | <area-token>(" "<cover-token>)*
<planning-record-location> ::= <field-token>" "<section-token>
<planning-deferral-location> ::= <field-token>" "<area-token>(" "<cover-token>)*
```

A Repo Edu record uses the bracketed tier. Its local location is one area and
any cover areas. A plan deferral replaces all area and cover tokens with one
plan token.

A plan-repo record uses the unbracketed tier. A `plan-audit` record has one
field followed by its section or its deferred Repo Edu area. Other local
records have one section without a field. A Repo Edu deferral in any other
record replaces the section with one area and any cover areas.

### Examples

#### `record/repo-edu-local` — parsed

```text
- [B] [area:pkg-application] [cover:cover-analysis-workflow] [growth-pattern:none] [reach:developer] [complexity:low] Shared token owner: the report and record readers use one definition.
```

#### `record/repo-edu-plan-deferral` — parsed

```text
- [C] [plan:../plan/example.md#decisions] [growth-pattern:none] [reach:developer] [complexity:none] Doctrine correction: the plan records the missing decision.
```

#### `record/plan-audit` — parsed

```text
- B [field:missing] [section:decisions] [growth-pattern:none] [reach:rare] [complexity:minus-low] Parser ownership: the decision names the one owner.
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

## Phase result

### Production

```text
<phase-result-line> ::= "PHASE RESULT: "<phase-result>
<phase-result>      ::= {"status":"finished","reason":null}
                      | {"status":"failed","reason":<reason-string>}
                      | {"status":"needs-ruling","reason":null} ; fix only
<reason-string>     ::= a JSON string containing non-whitespace text
```

The phase result is the response's last line and stays outside a code fence.
The JSON object has exactly the two fields shown. Audit, vet, rebuttal, brief,
watch, judge and close admit `finished` or `failed`. Fix also admits
`needs-ruling`.

### Phase table

| Phase | `finished` | `failed` | `needs-ruling` |
| --- | --- | --- | --- |
| Fix | Parsed; `phase-result/finished` | Parsed; `phase-result/failed` | Parsed; `phase-result/fix-needs-ruling` |
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

#### `phase-result/fix-needs-ruling` — parsed

```text
PHASE RESULT: {"status":"needs-ruling","reason":null}
```

#### `phase-result/report-needs-ruling` — refused

Refusal: `Report PHASE RESULT must finish`

```text
PHASE RESULT: {"status":"needs-ruling","reason":null}
```

## Judge answer

### Production

```text
<judge-answer>   ::= "Judge: "<judge-decision>". "<one-line-reason>
<judge-decision> ::= stop | continue with Claude | continue with Codex
<one-line-reason> ::= non-empty text on one line
```

The answer is exactly one plain line. `stop` is admitted only when the runner
offers it. Either continuation is admitted whenever it is offered.

### Examples

#### `judge/stop-available` — parsed

```text
Judge: stop. Both current reads found no remaining real bug.
```

#### `judge/stop-unavailable` — refused

Refusal: `Judge answered stop while the runner offered only Claude or Codex`

```text
Judge: stop. Both current reads found no remaining real bug.
```

#### `judge/claude` — parsed

```text
Judge: continue with Claude. Claude has the higher expected yield on the remaining scope.
```

#### `judge/codex` — parsed

```text
Judge: continue with Codex. Codex has the higher expected yield on the remaining scope.
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
