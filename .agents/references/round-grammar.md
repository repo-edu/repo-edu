# Round document grammar

This reference owns the text forms the audit-round runner reads or writes. The
[shared round protocol](round-protocol.md) owns what the forms mean and why
they exist. The [subject grammar](subject-grammar.md) owns commit subjects and
commit model records.

The six forms are the commit record bullet, implementation-plan step,
audit-range sentence, watch record, move list and split result. The runner's
[phase result schemas](../../tools/audit-round/references/sessions.md#one-invocation)
own the shape of unattended results.

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
<comma>              ::= "," followed by zero or more spaces or tabs
<digit>              ::= 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
<non-zero-digit>     ::= 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
<tier>               ::= A | B | C | D
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

An `<applies-token>` keeps the full commit ID and resolves it exactly, so one
citation cannot close two deferrals whose short IDs collide.

A `<blob-hash>` is Git's blob hash of one source file's content, as
`git hash-object <path>` prints it in the Repo Edu checkout. Git hashes the
file after the line-ending normalisation of the repository's attributes, so a
hash of the raw bytes can differ.

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
<step>                ::= <n>". **"<step-title>"**"["."]" "<host-sentence><step-detail>
<step-title>          ::= non-empty text
<host-sentence>       ::= Hosted in Repo Edu.
                        | Hosted in the plan repo.
                        | Hosted in both repos.
<step-detail>         ::= optional free Markdown in the same list item
```

The first ordered list below the single depth-2 `Implementation plan` heading
is the step list. Its items are numbered by list order. The bold title and host
sentence open each item. A title's optional full stop can sit inside or just after the bold text.

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

1. **Update the doctrine**. Hosted in the plan repo. Link the grammar.
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

#### `plan-step/title-without-full-stop` — parsed

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
<audit-ranges>         ::= "Audit ranges: "<step-scope>(<comma><step-scope>)*"."
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

The first three steps change the runner. Audit ranges: 1-2,3, 4-5.
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
                     NL <size-line> BLANK (<moves> | <no-split>)
<source-line>    ::= "Source: `"<repo-path>"`"["."]
<hash-line>      ::= "Hash: "<blob-hash>
<area-line>      ::= "Area: "<label>
<size-line>      ::= "Size: "(0 | <n>)" lines"
<moves>          ::= "## Moves" BLANK <move>(BLANK <move>)*
<move>           ::= "### "<n>". `"<repo-path>"`"["."] BLANK
                     "Responsibility: "<sentence> NL
                     "Ranges: "<line-range>(<comma><line-range>)*
<line-range>     ::= <n> | <n>"-"<n>
<no-split>       ::= "## No split" BLANK "Result: "<list-result>". "<one-line-reason>
<list-result>    ::= fine | needs-plan
<repo-path>      ::= a path relative to the Repo Edu root, without "`" or a line break
<sentence>       ::= non-empty text on one line
```

A move list opens with the source path, its Git blob hash, its primary area ID
and its size in lines before any move. Count every source line, including blank
lines and a final line without a newline. An empty file has zero lines. Every
range uses the line numbers of that same content.

Each move names one target file and the ranges of complete top-level statements
that go there. The moves are numbered from 1 without gaps, in the order the
statement move tool carries them out, and no target appears twice. A target's
ranges go to it in the order given. A range is one line or two line numbers
whose second is not smaller than its first, and it includes both ends. The
responsibility line states in one sentence what the target holds.

The no-split form gives the result `fine` when the file should stay whole or
`needs-plan` when its division needs a plan. The reason follows the result on
the same line.

The document holds nothing else. The reader ignores whitespace at either end of each line.
One or more empty lines count as one `BLANK`.

### Examples

#### `move-list/moves` — parsed

```markdown
# Move list

Source: `packages/domain/src/roster.ts`
Hash: 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
Area: pkg-domain
Size: 120 lines

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
Size: 120 lines

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
Size: 120 lines

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
Size: 120 lines

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
Size: 120 lines

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
Size: 120 lines

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
Size: 120 lines

## No split

Result: skipped. Another run changed the file.
```

## Split result

### Production

```text
<split-result-line> ::= "SPLIT RESULT: "<split-result>
<split-result>      ::= {"result":<result-word>,"hash":<hash-string>,"message":<message-string>}
<result-word>       ::= "made" | "answers-saved" | "designed" | "fine" | "needs-plan" | "skipped" | "checks-failed"
<hash-string>       ::= a JSON string containing a <blob-hash>
<message-string>    ::= a JSON string containing non-whitespace text
```

A split call that finishes prints one split result line last. The JSON object
has exactly the three fields shown.

1. `made`: the split was made and committed.
2. `answers-saved`: the designers' answers were saved. The message gives the pick command.
3. `designed`: the chosen move list was committed. The message names its path.
4. `fine`: no split, because the file should stay whole.
5. `needs-plan`: no split, because the file needs a plan.
6. `skipped`: no split, because the call was skipped.
7. `checks-failed`: no split, because the checks or the tests failed and the
   files are back as they were.

The hash names the content of the source file that the design session read.
The message says why, and may span lines inside its JSON string. A move list's
no-split form uses the words `fine` and `needs-plan` with these meanings.

### Examples

#### `split-result/made` — parsed

```text
SPLIT RESULT: {"result":"made","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":"packages/domain/src/roster.ts was split into 2 new files."}
```

#### `split-result/designed` — parsed

```text
SPLIT RESULT: {"result":"designed","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":"/plan/splits/packages/domain/src/roster.01.mv.md"}
```

#### `split-result/answers-saved` — parsed

```text
SPLIT RESULT: {"result":"answers-saved","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":"pnpm audit-round split pick packages/domain/src/roster.ts 1 2"}
```

#### `split-result/checks-failed` — parsed

```text
SPLIT RESULT: {"result":"checks-failed","hash":"3b18e512dba79e4c8300dd08aeb37f8e728b8dad","message":"pnpm check failed:\nsrc/roster.ts(4,10): error TS2305."}
```

#### `split-result/unknown-result` — refused

Refusal: `Expected made, answers-saved, designed, fine, needs-plan, skipped or checks-failed`

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
