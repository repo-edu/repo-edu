# Integration Plan: gigui (gitinspectorgui) into repo-edu

## Context

repo-edu is nearing publication but needs gigui's analysis functionality
integrated first, because the identity model (person merging, git author ↔
roster member reconciliation) may cause architectural changes that would break
published APIs. Better to absorb these changes before anyone depends on the
current shape.

gigui exists in two forms: a complete Python implementation (~1700 LOC of core
logic in /Users/aivm/gigui-python) and a 50-60% complete Tauri/Rust port
(/Users/aivm/gigui-tauri). The Python version is the authoritative reference;
the Tauri frontend has improved UI patterns (charts, filtering) worth adopting.

## Python Parity + Planned Architectural Correction

`gigui-python` remains the semantic source of truth for analysis
behavior (identity merge semantics, PersonDB evolution, per-file `--follow`
traversal, and dedupe safeguards). Deviations are allowed only when explicitly
documented.

Intentional deviations (documented):

- Replace Python's split implementation (global HEAD pass vs separate
  commit-as-head path) with one revision-parameterized snapshot engine.
  Preserve semantics, improve structure: one core engine for HEAD and
  commit-as-head analysis, plus explicit PersonDB baseline/overlay modeling.
- Use `-z` (NUL-delimited) git log output with explicit pretty-format
  delimiters instead of Python's fragile newline-delimited parsing. Fixes
  Python bug where filenames containing newlines or special characters could
  corrupt parsing.
- Handle binary numstat lines (`-`/`-`) gracefully. Python crashes with
  `int("-")` ValueError on binary files in `--numstat` output.
- Capture author email (`%aE`) in the per-file `git log --follow` format.
  Python omits email in this pass and resolves it through PersonsDB lookup.
- Decouple blame revision exclusion from log-level `excludeRevisions`. Python
  passes per-SHA `--ignore-rev` flags (from `ex_shas`) to both log and blame.
  repo-edu treats `excludeRevisions` as log-only and handles blame-level
  exclusion solely through `_git-blame-ignore-revs.txt` (via
  `ignoreRevsFile` config flag). This avoids coupling blame results to
  log-level filter choices.

## Approach: Extend Existing Packages

No new packages. The monorepo's layered structure already provides the right
home for every concern. Analysis types go in `domain`, orchestration in
`application`, contracts in `application-contract`, UI in `renderer-app`.

Delivery scope for analysis workflows is **desktop + docs**. CLI is
intentionally out of scope.

## Package Changes

### `packages/domain/src/`

New directory `analysis/` with barrel re-export (`index.ts`):

- **`analysis/types.ts`** — Pure types: `GitAuthorIdentity`, `AnalysisCommit`,
  `AuthorStats`, `FileStats`, `BlameLine`, `FileBlame`, `BlameAuthorSummary`,
  `AnalysisConfig`, `AnalysisBlameConfig`, `BlameExclusionMode`, `AnalysisResult`,
  `BlameResult`, `IdentityBridgeResult`, `PersonMergeResult`, `PersonDbSnapshot`,
  `PersonDbDelta`, `AnalysisRosterContext`, `SupportedLanguage`. `AnalysisResult` includes
  `resolvedAsOfOid` (the commit OID actually used as snapshot head — set
  immediately after resolution from `asOfCommit`/`until`/HEAD), optional
  `rosterMatches` populated when roster context is provided, plus
  merge evidence/confidence metadata per merged person and the resulting
  `personDbBaseline`.
  `AnalysisConfig` fields (log-based analysis):
  - `since?`, `until?` — date range (YYYY-MM-DD)
  - `subfolder?` — restrict to repo-relative path. The subfolder prefix is
    **removed from file paths** in all output (tables, charts, blame)
  - `extensions?` — file extension allowlist (default:
    `c, cc, cif, cpp, glsl, h, hh, hpp, java, js, py, rb, sql, ts`; use
    `["*"]` to include all files regardless of extension)
  - `includeFiles?`, `excludeFiles?` — case-insensitive `fnmatch`/glob
    patterns (`*`, `?`, character classes) matched against repo-relative file
    paths. `includeFiles` defaults to `["*"]` when omitted (Python parity).
  - `excludeAuthors?`, `excludeEmails?` — case-insensitive `fnmatch`/glob
    patterns matched against normalized canonical author/email aliases
  - `excludeRevisions?` — SHA prefix patterns; `excludeMessages?` —
    case-insensitive `fnmatch`/glob patterns matched against full commit
    message text (log-only, not shared with blame)
  - `nFiles?` — number of biggest files to include in output, ranked by
    git blob size (byte count at snapshot commit, matching Python's
    `blob.size` sort). Default `5` (Python `DEFAULT_N_FILES`); `0` = all
    files. Applied after all other file filters.
  - `whitespace?` — include whitespace-only changes in diffs (default `false`)
  - `maxConcurrency?` — bounded worker pool size (default `1`)
  - `blameSkip?` — skip blame analysis entirely (default `false`). When true,
    the UI does not offer blame sub-tab and `analysis.blame` is not invoked.
    `AnalysisBlameConfig` fields (shared subset + blame-specific):
  - `subfolder?`, `extensions?`, `includeFiles?`, `excludeFiles?` — same file
    selection semantics as `AnalysisConfig`
  - `excludeAuthors?`, `excludeEmails?` — same author exclusion semantics
  - `whitespace?` — passed to `git blame -w` (default `false`)
  - `maxConcurrency?` — same semantics as `AnalysisConfig`
  - `copyMove?` — git blame copy/move detection level (integer 0-4, default
    `1`). Maps to `-M`/`-C` flag depth: 0 = ignore, 1 = within file,
    2 = across files in one commit, 3 = across two commits, 4 = all commits.
    Ported from Python's `copy_move` setting.
  - `includeEmptyLines?` — count empty lines in blame stats (default `false`)
  - `includeComments?` — count comment lines in blame stats (default `false`).
    Comment detection is language-specific and applies only to **full-line
    comments** (e.g. `# comment` is a comment line; `x = 1  # comment` is
    NOT). Both single-line and multi-line comment syntax are recognized.
  - `blameExclusions?` — display mode for excluded blame lines: `"hide"`
    (default, shown as uncolored), `"show"` (colored normally), `"remove"`
    (removed from output entirely). A blame line is excluded when: its author
    matches an exclusion pattern, it is a comment line (when
    `includeComments` is false), or it is empty (when `includeEmptyLines` is
    false). Excluded lines are not attributed to any author in blame stats
    regardless of display mode.
  - `ignoreRevsFile?` — when `true` (default), the blame handler looks for
    `_git-blame-ignore-revs.txt` in the repository root and passes it as
    `--ignore-revs-file` to `git blame` if present (Python parity). When
    `false`, the file is ignored even if it exists.
    Intentionally excluded from `AnalysisBlameConfig`: `since`/`until` (date
    range is a log concern), `excludeRevisions`/`excludeMessages` (commit-level
    filtering is log-only).
    Note: Python also passes per-SHA `--ignore-rev` flags from `excludeRevisions`
    to blame. repo-edu intentionally does NOT do this — `excludeRevisions` is a
    log-only concern, and blame-level revision exclusion is handled solely through
    `_git-blame-ignore-revs.txt`. This is a documented deviation.
- **`analysis/schemas.ts`** — Domain-level Zod schema and pure validator for
  `AnalysisConfig` and `AnalysisBlameConfig`:
  - strict `YYYY-MM-DD` validation for `since`/`until` (calendar-valid date),
  - cross-field check `since <= until`,
  - pattern normalization (trim + dedupe) and rejection of empty pattern
    entries for all pattern fields (`includeFiles`, `excludeFiles`,
    `excludeAuthors`, `excludeEmails`, `excludeRevisions`, `excludeMessages`),
  - extension normalization (lowercase, optional leading dot stripped, dedupe),
  - subfolder normalization to repo-relative POSIX form with rejection of
    absolute paths and `..` path escapes,
  - `maxConcurrency` optional integer, defaults to `1`, clamped to `[1, 16]`.
    Owned by config so tuning the bound is a config-level change, not a
    contract change.
  - `copyMove` optional integer, defaults to `1`, clamped to `[0, 4]`.
  - `blameExclusions` optional enum `"hide"` | `"show"` | `"remove"`,
    defaults to `"hide"`.
  - `ignoreRevsFile` optional boolean, defaults to `true`.
  - `includeFiles` defaults to `["*"]` when omitted (Python parity).
  - `nFiles` optional integer, defaults to `5` (`DEFAULT_N_FILES` in Python),
    clamped to `[0, ∞)` where `0` means all files.
  - `blameSkip` optional boolean, defaults to `false`.
  Exposes `analysisConfigSchema`, `validateAnalysisConfig(...)`,
  `analysisBlameConfigSchema`, and `validateAnalysisBlameConfig(...)`.
- **`analysis/person-merge.ts`** — Union-find person merging (port of Python's
  `PersonsDB`). Teacher-first recall policy: merges identities sharing
  normalized email or normalized full name (including same-name/different-email
  cases). Selects canonical identity by commit count (tie-breaker: lexicographic
  on normalized email) and preserves aliases (all
  source names/emails + merge evidence such as `email-link` or `name-only`).
  Pure function: `mergePersonIdentities(identities[]) → PersonMergeResult`.
- **`analysis/person-db.ts`** — Explicit stable PersonDB model equivalent to
  Python `PersonsDB`: deterministic person ids, identity→person index, canonical
  person records, alias/evidence tracking, and pure merge/apply functions.
  Includes `createPersonDbFromLog(...)` and incremental
  `applyBlameToPersonDb(...)`. `createPersonDbFromLog(...)` internally calls
  `mergePersonIdentities(...)`; workflow handlers compose only through
  PersonDB-level APIs.
- **`analysis/identity-bridge.ts`** — Read-only bridge from git authors to
  roster members. `bridgeAuthorsToRoster(authors, roster) →
  IdentityBridgeResult` with confidence levels (`exact-email` | `fuzzy-name` |
  `unmatched`). Fuzzy-name matching uses case-insensitive comparison after
  trimming whitespace and collapsing internal runs; no edit-distance or phonetic
  matching — keeps results predictable and avoids false positives on short
  names. Pure function, no roster mutation.
- **`analysis/comment-detector.ts`** — Pure function
  `classifyCommentLines(lines: string[], language: SupportedLanguage): Set<number>`
  that processes all lines of a file and returns the 0-based indices of
  full-line comments. Only full-line comments qualify — inline trailing
  comments do not. Recognizes both single-line and multi-line comment syntax
  by tracking block-comment state (`/* … */` etc.) across consecutive lines.
  `SupportedLanguage` type and extension-to-language mapping:
  - **With comment support** (default extensions marked with `*`):
    `c`\*, `cc`\*, `cif`\*, `cpp`\*, `glsl`\*, `h`\*, `hh`\*, `hpp`\*,
    `java`\*, `js`\*, `py`\*, `rb`\*, `sql`\*, `ts`\*, `cs`, `po`, `pot`,
    `hs`, `html`, `tex`, `ml`, `mli`, `pl`, `php`, `scala`, `xml`, `jspx`,
    `ada`, `adb`, `ads`, `go`, `rs`, `rlib`, `robot`, `xhtml`, `ily`, `ly`,
    `tooldef`.
  - **Without comment support**: any extension not in the above list. Files
    with unsupported extensions are treated as having no comment lines.
    Default extensions (when `extensions` config field is omitted):
    `c, cc, cif, cpp, glsl, h, hh, hpp, java, js, py, rb, sql, ts`.
- **`analysis/index.ts`** — Barrel re-export of all analysis modules.

New tests:

- **`__tests__/analysis/`** — Tests for `AnalysisConfig` and
  `AnalysisBlameConfig` validation/normalization, union-find person merging,
  PersonDB construction and incremental enrichment, identity bridge matching,
  and schema edge cases (malformed subfolder shapes, single-day date ranges,
  extension normalization, `AnalysisBlameConfig` date-range key rejection).

Modified:

- **`types.ts`** — Extend `ActiveTab` to include `"analysis"`.
- **`schemas.ts`** — Update `persistedAppSettingsSchema.activeTab` enum to
  include `"analysis"` so settings load/save stays valid.

### `packages/domain/package.json`

Modified:

- Add explicit `exports` entry for `./analysis` pointing to
  `src/analysis/index.ts` so the subfolder is importable as a single subpath
  from other packages.

### `tsconfig.base.json`

Modified:

- Add `"@repo-edu/domain/analysis": ["./packages/domain/src/analysis/index.ts"]`
  to `compilerOptions.paths` (consistent with existing domain subpath mappings).

### `packages/application-contract/src/`

Modified:

- **`index.ts`** — Add two workflow entries in `WorkflowPayloads` with full
  channel definitions:
  - Define `AnalysisRepositoryInput`:
    `{ course: PersistedCourse; repositoryRelativePath: string }`.
    `repositoryRelativePath` is a course-derived repo selection (not a freeform
    picker): application resolves absolute `repoRoot` from
    `course.repositoryCloneTargetDirectory` + directory layout and validates
    that the selected relative path belongs to the derived repo set.
  - Define `AnalysisProgress` for long-running analysis workflows with granular
    counters:
    `{ phase, label, processedFiles, totalFiles, processedCommits?,
    totalCommits?, currentFile? }`.
  - `"analysis.run"` — `input: AnalysisRepositoryInput & { config:
    AnalysisConfig; rosterContext?: AnalysisRosterContext; asOfCommit?:
    string }`.
    `progress: AnalysisProgress`, `output: DiagnosticOutput`,
    `result: AnalysisResult` (includes `personDbBaseline` built from log
    data).
  - `"analysis.blame"` — `input: AnalysisRepositoryInput & { config:
    AnalysisBlameConfig;
    personDbBaseline: PersonDbSnapshot; personDbOverlay?: PersonDbSnapshot;
    files: string[]; asOfCommit: string }`.
    When `personDbOverlay` is absent, enrichment starts from
    `personDbBaseline`. When present, enrichment continues from the overlay
    snapshot. `progress: AnalysisProgress`, `output: DiagnosticOutput`,
    `result: BlameResult` (includes updated overlay and `delta`).
- **`index.ts`** — Add matching `workflowCatalog` entries for both workflows
  with `delivery: ["desktop", "docs"]` (not CLI), `progress: "granular"`, and
  cancellation metadata.

Modified tests:

- **`__tests__/workflow-catalog.test.ts`** — Update expected workflow ids and
  any delivery assertions impacted by the new workflows.

### `packages/application/src/`

New directory `analysis-workflows/`:

- **`ports.ts`** — `AnalysisWorkflowPorts = { gitCommand: GitCommandPort;
  cache?: AnalysisResultCache }`.
  This is a handler-local dependency contract only (same pattern as existing
  workflow modules), not a new runtime injection path.
- **`log-parser.ts`** — Parses robustly framed `git log --follow --numstat -z`
  output into `AnalysisCommit[]` with explicit handling for binary numstat lines
  and delimiter-safe parsing.
- **`blame-parser.ts`** — Parses `git blame --porcelain` output into
  `FileBlame`.
- **`snapshot-engine.ts`** — Single revision-parameterized core
  (`buildAnalysisSnapshot`) used by both HEAD and commit-as-head analysis paths.
- **`analysis-handler.ts`** — Orchestrates all-files snapshot build for
  `analysis.run`: per-file `git log --follow` traversal using a bounded worker
  pool sized by `config.maxConcurrency`, Python-parity overlap reduction across
  file histories (suffix commit-group removal), PersonDB baseline construction,
  and stats aggregation. Log collection may run in parallel, but overlap
  reduction, aggregation, and PersonDB construction are applied in deterministic
  sorted file order. When roster context is provided, also runs
  `bridgeAuthorsToRoster` and attaches match info to results.
- **`blame-handler.ts`** — Per-file blame via `GitCommandPort` using a bounded
  worker pool sized by `config.maxConcurrency`. Probes for
  `_git-blame-ignore-revs.txt` in the repo root and passes
  `--ignore-revs-file` when present and `config.ignoreRevsFile` is true
  (Python parity). Blame collection may run in parallel, but parsed results
  are applied to PersonDB overlay (`applyBlameToPersonDb`) only in
  deterministic sorted file order and accumulated into `PersonDbDelta`. New file:
- **`analysis-workflows.ts`** — `createAnalysisWorkflowHandlers(ports)` factory.

Modified:

- **`index.ts`** — Export `createAnalysisWorkflowHandlers`.

Modified tests:

- Add parser and handler tests for `analysis.run` (log parsing fidelity, `-z`
  framing safety, binary numstat handling, per-file `--follow` overlap
  reduction parity (suffix commit-group removal), aggregation totals, merge behavior, initial PersonDB
  construction, optional roster bridge output, git/provider error
  normalization, and explicit multi-file commit assertions (same SHA touching
  multiple files contributes all file-level insertions/deletions while commit
  counts remain unique by SHA set size)).
- Add tests for `analysis.blame` that verify deterministic per-file PersonDB
  enrichment order, correct `delta` emission (`newPersons`, `newAliases`,
  `relinkedIdentities`), and idempotency when replaying identical blame input.
- Add parity tests against curated fixtures derived from
  `gigui-python` outputs for HEAD and commit-as-head snapshots.
- Add cancellation tests for both `analysis.run` and `analysis.blame` that
  verify `AbortSignal` propagation and cooperative stop points.

### `apps/desktop/src/`

Modified:

- **`trpc.ts`** — Wire `createAnalysisWorkflowHandlers` into
  `createDesktopWorkflowRegistry`.

### `apps/docs/src/`

Modified runtime:

- **`demo-runtime.ts`** — Wire `createAnalysisWorkflowHandlers` into docs
  workflow handlers.
- **`demo-runtime.ts`** — Provide a browser-safe mock `GitCommandPort` for
  analysis workflows (deterministic fixture output; no Node/process usage).

Modified docs:

- **`content/docs/development/data-model.md`** — Update
  `PersistedAppSettings.activeTab` documentation to include `"analysis"`.
- **`content/docs/reference/settings-reference.md`** — Update
  `PersistedAppSettings.activeTab` documentation to include `"analysis"`.
- **`content/docs/development/workflow-catalog.md`** — Update `granular`
  progress description to reference `analysis.run` and `analysis.blame`.

Modified tests:

- **`__tests__/workflow-alignment.test.ts`** — Keep docs workflow coverage
  exhaustive after adding analysis workflow ids.
- Add targeted tests for docs analysis runtime behavior (successful run path +
  cancellation path).

### `packages/renderer-app/src/`

New store:

- **`stores/analysis-store.ts`** — Zustand store: config, results, status,
  filters, and table/chart selection state. Includes UI-only display toggles:
  `showDeletions` (whether deletion counts appear in stats tables),
  `showRenames` (whether rename history / alternative author names+emails
  are shown — derived in the store from PersonDB alias data, displayed
  pipe-separated),
  `scaledPercentages` (whether Scaled Lines % and Scaled Insertions %
  columns are shown — `Scaled X% = X% * NrAuthors`, average always = 100).
  These are display concerns, not analysis config — git always collects the
  underlying data (Python parity).

New components:

- **`components/tabs/AnalysisTab.tsx`** — ResizablePanelGroup sidebar + main
  panel with sub-tab navigation (Authors, Authors-Files, Files-Authors, Files,
  Blame). Guard state when no course loaded.
- **`components/tabs/analysis/AnalysisSidebar.tsx`** — Repo selection, date
  range, file/author/commit filters, options, run/cancel button, progress
  display, error banner. Blame-specific controls (copyMove, empty/comment
  toggles, asOfCommit) shown contextually.
- **`components/tabs/analysis/AuthorPanel.tsx`** — Authors view: TanStack
  table (Author, Email, Commits, Insertions, Deletions, Lines, %, Stability,
  Age) + display controls bar (metric selector, absolute/percentage toggle) +
  post-analysis author checkboxes with colored labels.
- **`components/tabs/analysis/AuthorFilesPanel.tsx`** — Authors-Files view:
  grouped by author with expandable per-file breakdown rows.
- **`components/tabs/analysis/FilePanel.tsx`** — Files view: TanStack table
  (File, Commits, Insertions, Deletions, Lines, Stability, Last Modified
  with relative time) + post-analysis file filter with folder accordion.
- **`components/tabs/analysis/FileAuthorsPanel.tsx`** — Files-Authors view:
  grouped by file with expandable per-author breakdown rows.
- **`components/tabs/analysis/BlamePanel.tsx`** — Multi-file blame viewer
  with tabbed interface, add files modal, close all.
- **`components/tabs/analysis/BlameTab.tsx`** — Per-file blame: CSS grid
  (Author, Date, Message, SHA, Line#, Code), commit grouping, author
  color-coding (20-color palette, left border + 40% background), metadata
  toggle, empty/comment line toggles, author contributions summary,
  PersonDB delta display.
- **`components/tabs/analysis/charts/AuthorCharts.tsx`** — Recharts bar
  (daily activity, stacked by author), line (cumulative LOC), pie
  (distribution per author). ResponsiveContainer, no animations.
- **`components/tabs/analysis/charts/FileCharts.tsx`** — Recharts stacked
  bar (top 25 files, author-colored segments), metric-selectable.

Modified:

- **`components/App.tsx`** — Add Analysis tab trigger + content.
- **`package.json`** — Add `recharts` dependency (latest stable, currently 3.x). Bundle cost is negligible against the ~100 MB Electron app. Docs bundle is also fine: recharts supports named imports and tree-shakes well with Vite.

### `packages/application/src/analysis-workflows/` (Phase 6)

New files:

- **`cache.ts`** — `AnalysisResultCache` interface + LRU implementation with
  bounded size and `analysisSchemaVersion`-based invalidation.
  Desktop injects this cache through `AnalysisWorkflowPorts.cache`; docs
  runtime injects no cache (`undefined`) so behavior remains uncached/in-memory
  only.
- **`cache-keys.ts`** — `normalizeAnalysisConfigForCache(config)` and
  `normalizeRosterContextForCache(rosterContext)` canonicalization helpers
  producing stable-key JSON for cache-key material.

New tests:

- Cache-key canonicalization tests proving semantic equivalence stability
  (same semantics → same key, different semantics → different key).

## Identity Model Strategy

Analysis requires an active course. Two tiers based on roster availability, no
changes to existing `RosterMember` schema. Roster stays a pure LMS concern —
analysis never writes back to it.

1. **Without roster** (teams.txt / no LMS connection) — Person merging only.
   Course exists with groups and cloned repos, but no LMS roster members.
   Teacher-first merge policy applies (`email OR name` after normalization). UI
   shows canonical names + aliases + merge confidence/evidence. No roster
   interaction.
2. **With roster** (LMS-connected course) — Same merge policy first, then
   `bridgeAuthorsToRoster()` matches merged authors to members by email, then
   fuzzy name. AuthorPanel shows a "Roster match" column with matched member
   name and confidence badge (`exact-email` | `fuzzy-name` | `—` for
   unmatched). Read-only display, no import/mutation.

Repo path is derived from the active course's clone configuration
(`repositoryCloneTargetDirectory` + `repositoryCloneDirectoryLayout`) plus the selected
course-derived `repositoryRelativePath` from the Analysis sidebar.
Workflows do not accept a freeform absolute repo path.

Analysis results are ephemeral (in-memory store), not persisted in
`PersistedCourse`.

PersonDB lifecycle:

- `analysis.run` builds `personDbBaseline` from deterministic per-file `git log
  --follow` scans over all files for a selected `asOfCommit` (default `HEAD`).
- `analysis.blame` accepts `personDbBaseline` and incrementally enriches
  `personDbOverlay` from each file's `git blame --follow` output.
- `analysis.blame` enrichment starts from `personDbOverlay` when provided,
  otherwise from `personDbBaseline`, then carries forward in deterministic
  file order.
- `analysis.blame.delta` is computed against the enrichment start state
  (overlay when provided, otherwise baseline).
- PersonDB updates are deterministic and read-only with respect to roster/course
  persistence.

## Analysis Filtering Semantics (Python Parity)

Filtering semantics are migrated from `gigui-python` and treated as
normative behavior.

- **Validation is explicit and two-phase**:
  - **Domain (pure, deterministic)**: `validateAnalysisConfig(...)` and
    `validateAnalysisBlameConfig(...)` execute Zod + cross-field checks and
    return normalized config or path-level validation issues.
  - **Application (environment-aware)**: request preflight validates repo path
    derivation from `{ course, repositoryRelativePath }`, existence/type,
    git-repo status, `asOfCommit` resolvability, and blame-file request
    constraints. These checks use `GitCommandPort` and do not live in domain.
- **Date inputs (`since`, `until`)** use strict `YYYY-MM-DD` format only.
- **Date filtering is git-argument based, not post-filtering** — pass
  `since`/`until` directly to git log args (`--since=...`, `--until=...`) for
  both global commit-range construction and per-file `git log --follow` scans.
- **Timestamp basis** for range inclusion is git committer time (`%ct`),
  matching Python behavior.
- **Snapshot anchor and date range are orthogonal (Python parity)**:
  - `asOfCommit` anchors the snapshot tree (which files exist, blame target).
  - `since`/`until` filter the commit range for log-based stats within that
    tree.
  - Both may be provided simultaneously — `asOfCommit` determines the tree,
    `until` constrains the log window.
  - `analysis.run`: if `input.asOfCommit` is provided, it is authoritative as
    the snapshot head.
  - `analysis.run`: if `input.asOfCommit` is absent and `config.until` is set,
    resolve the top commit at/before `until` as snapshot head.
  - `analysis.run`: if neither is provided, use repository `HEAD`.
- **`analysis.blame` anchor rule** — `input.asOfCommit` is always authoritative.
  `analysis.blame` uses `AnalysisBlameConfig`, which does not include
  `since`/`until`.
- **Timezone/boundary semantics** are delegated to git exactly as in Python: no
  app-side timezone conversion, normalization, or end-of-day expansion.
- **`until` fallback behavior (`analysis.run` without `asOfCommit`)** — when
  `until` is set, resolve the top commit at/before that bound as analysis head;
  if no commit matches, fall back to repository `HEAD` and emit a diagnostic
  via the `output` channel explaining the fallback (e.g. "no commits found
  before {until}, using repository HEAD").
- **File candidate set starts at snapshot tree** — start from files present in
  the resolved snapshot commit, not from live filesystem listings.
- **File filters are applied in this order**: `subfolder` scope → `extensions`
  allowlist → `excludeFiles` patterns → `includeFiles` selection → `nFiles`
  truncation (top N by git blob size descending).
- **Include patterns are additive selection within the filtered set** —
  `includeFiles` patterns use case-insensitive `fnmatch` matching against
  repo-relative paths and cannot re-introduce files removed by
  `subfolder`/`extensions`/`excludeFiles`. For parity, omitted `includeFiles`
  is normalized to `["*"]`.
- **Author/email exclusion** — `excludeAuthors` and `excludeEmails` use
  **case-insensitive `fnmatch` matching** against full alias strings.
  Applied post-merge: exclusion removes the entire merged
  person (all aliases) when any alias matches. Shared across `AnalysisConfig`
  and `AnalysisBlameConfig`.
- **File exclusion** — `excludeFiles` uses the same **case-insensitive
  `fnmatch` matching** against repo-relative file paths.
  `includeFiles` uses the same semantics.
- **Commit-level exclusion (log-only, post-filter)** — `excludeRevisions`
  uses **prefix matching** against commit SHA hashes (e.g. `8755fb` excludes
  any commit whose SHA starts with that prefix). `excludeMessages` uses
  **case-insensitive `fnmatch` matching** against full commit message text.
  Both are applied after git log output is parsed (Python parity:
  these are not git arguments), not present in `AnalysisBlameConfig`.
- **Merge commits are included (Python parity)** — no `--no-merges` or
  `--first-parent` filtering. All commits including merges are processed.
- **Whitespace handling** — `whitespace: false` (default) passes `-w` to git
  log/blame to ignore whitespace-only changes. `whitespace: true` includes all
  whitespace. Shared across both config types.
- **Blame copy/move detection** — `copyMove` (0-4) maps to git blame `-M`/`-C`
  flag depth. Default `1` (within-file detection). Blame-specific, not in
  `AnalysisConfig`.
- **Blame line filtering** — `includeEmptyLines` and `includeComments` control
  whether empty/comment lines count toward blame stats. Applied post-parse,
  not as git arguments. Blame-specific.
- **Pattern validation policy** — preserve Python parity by allowing
  case-insensitive `fnmatch`/glob pattern matching.
  Invalid entries are limited to structural input errors (empty strings after
  trim, control characters, invalid path escapes); non-matching patterns are
  valid and may produce empty result sets.
- **Pattern precedence** — when `includeFiles` is non-empty, include matching
  files from the filtered set; when omitted, normalize to `["*"]` and include
  the full filtered set.
- **Determinism requirement** — after filtering, file iteration order is
  deterministic and stable across runs.
- **Empty result sets are successful outcomes, not validation failures** — if
  no files or no commits match filters, workflows return successful empty
  analysis payloads with explicit reason metadata.
- **Granular progress semantics are mandatory for analysis workflows** (Python
  parity spirit: continuous per-file feedback on long runs):
  - emit at least once at workflow start and end of each phase,
  - emit on every file completion with updated `processedFiles/totalFiles`,
  - include `currentFile` while processing a file,
  - emit commit counters when known (`processedCommits/totalCommits`).

## Metric & Formula Definitions (Python Parity)

All formulas are ported from `gigui-python` and treated as normative.

- **Lines** — total lines currently attributed to the entity via `git blame`
  (the author who last changed each line). When comments/empty lines are
  excluded (default), those lines are NOT counted, so sum of Lines can be less
  than total file lines.
- **Insertions** — total insertions by the entity from `git log --numstat`.
- **Deletions** — total deletions by the entity from `git log --numstat`.
  Stats-only column (deletions cannot appear in blame output). Conditional on
  `showDeletions` display toggle.
- **Commits** — number of commits by the entity.
- **Lines %** — `100 * Lines / SumLines` where SumLines = sum of Lines across
  all non-excluded authors.
- **Insertions %** — `100 * Insertions / SumInsertions`. Sum across all
  authors = 100%.
- **Stability %** — `100 * Lines / Insertions`. 100% means no lines were ever
  overwritten; 50% means each line was changed once on average.
- **Age** — insertion-weighted average commit timestamp, converted to elapsed
  time. Each commit contributes `commitTimestamp * insertionCount` to a running
  `date_sum`; the average timestamp is `date_sum / totalInsertions`, and age is
  `now − averageTimestamp`. Formatted as `Y-M-D` (e.g. `1-4-20` = 1 year,
  4 months, 20 days). This is NOT "time since last contribution" — it is the
  insertion-weighted mean age of all historical commits by the entity, including
  insertions in previous file versions (renames).
- **Scaled Lines %** — `Lines% * NrAuthors`. Optional column, controlled by
  `scaledPercentages` display toggle. Average across authors always = 100
  regardless of author count. Same formula for Scaled Insertions %.
- **NrAuthors** — count of authors with commits after exclusion filters.
  Used in scaled percentage formulas, not shown as a column.

Scope rules for metrics across the four stats tables:

- **Authors** — combines all files per author.
- **Authors-Files** — per author, subdivided by file.
- **Files-Authors** — per file, subdivided by author.
- **Files** — combines all authors per file.

## Key Design Decisions

- **Per-file `git log --follow` is baseline behavior** — correctness first for
  rename history. Runs in deterministic sorted file order and applies a
  Python-parity overlap reduction pass across file commit-group lists: files are
  sorted ascending by commit-group count; iterating from longest to shortest,
  each file's tail commit groups are compared against every shorter file's tail
  — matching trailing groups are popped from the shorter list. This removes
  duplicate rename-history tails (e.g. when `--follow` traces a renamed file's
  history across two paths). Stats still sum all remaining per-file
  commit-group insertions/deletions, so multi-file commits are fully
  represented while commit counts remain unique via per-stat SHA sets. Git
  considers a file renamed/copied when 50% or more lines are shared (git's
  default similarity threshold).
- **Unambiguous log framing/parsing (architectural improvement over Python)** —
  Python uses fragile newline-delimited output with no `-z` flag and crashes on
  binary files (`int("-")` ValueError on binary numstat lines). repo-edu uses
  `-z` (NUL-delimited) plus explicit pretty-format delimiters for robust
  framing, and handles binary numstat (`-`/`-`) gracefully. Python's two rename
  regex patterns (`{old => new}` and `old => new`) are preserved for functional
  parity. The per-file pretty format includes `%aE` (author email) alongside
  `%h`, `%ct`, `%aN` — Python omits email in the per-file log pass and
  resolves it later through PersonsDB; repo-edu captures it upfront.
- **Filter semantics copy Python behavior** — `since`/`until` are passed through
  to git; case-insensitive `fnmatch`/glob pattern matching and include/exclude
  precedence follow `gigui-python`.
- **copy-move affects only blame, never stats tables (Python parity)** —
  `copyMove` controls `git blame -M`/`-C` flags for line-level move/copy
  attribution. Insertions/deletions in the four stats tables (Authors,
  Authors-Files, Files-Authors, Files) are always attributed to the
  committing author because `git log --follow` detects file renames but NOT
  line-level moves/copies. This is an inherent git limitation, not a design
  choice.
- **Reuse existing `GitCommandPort` from `@repo-edu/host-runtime-contract`** —
  request shape is `{ args, cwd, env, stdinText?, signal }`, result is
  `ProcessResult`. No new port types needed.
- **`analysis-workflows/ports.ts` is local typing only** — analysis handler
  factories receive dependencies through the existing desktop/docs registries
  (same injection path used by other workflow modules).
- **Error normalization for analysis workflows is explicit**:
  - domain/app preflight input failures -> `validation` `AppError`,
  - git execution/probe failures -> `provider` `AppError` with `provider: "git"`,
  - unexpected parsing/runtime failures -> `unexpected` `AppError`.
- **Include docs delivery with mocked git execution** — docs runtime provides a
  browser-safe `GitCommandPort` simulation so renderer-app workflow usage
  remains docs-deliverable.
- **Progress cadence mirrors gigui-python behavior** — users should see steady
  progress during per-file log/blame scans instead of sparse milestone jumps.
- **No CLI surface for analysis** — keeps CLI focused on repeatable automation
  paths currently in scope and avoids new command/matrix churn.
- **Keep chart wrappers in `renderer-app`** — analysis visuals are app-specific
  UI and do not belong in shared `@repo-edu/ui` primitives.
- **Concurrency-ready architecture from day one** — both `analysis.run`
  (per-file log) and `analysis.blame` (per-file blame) support bounded
  concurrency via `config.maxConcurrency` (default `1`, domain-validated
  `[1, 16]`). Git calls may run in parallel, but post-processing (overlap
  reduction, stat aggregation, PersonDB updates) is applied in deterministic
  sorted file order.
  Follow-up performance work tunes the default and limits at the config/schema
  level without contract or handler changes.
- **Person merging in domain** — pure, deterministic union-find algorithm with
  teacher-first recall defaults (`email OR name` after normalization), alias
  preservation, and merge-evidence metadata for UI transparency. Roster bridging
  is read-only and runs as part of `analysis.run` when roster context is
  available.
- **PersonDB is explicit and stable across workflows** — `analysis.run` produces
  initial snapshot; `analysis.blame` enriches snapshot incrementally per file
  (not from aggregate blame), preserving deterministic ids and traceable deltas.
- **Person merge call graph is explicit** — `analysis-handler` calls
  `createPersonDbFromLog(...)`, which internally invokes
  `mergePersonIdentities(...)`; `blame-handler` calls
  `applyBlameToPersonDb(...)`. Handlers do not call `mergePersonIdentities(...)`
  directly.
- **Single snapshot engine for HEAD + commit-as-head** — no separate pipelines;
  both call the same revision-parameterized builder with explicit `asOfCommit`.
- **`asOfCommit` lives on workflow input, not in config** — Python bundles
  everything in `Args`, but repo-edu separates the snapshot anchor
  (`input.asOfCommit`) from the reusable analysis parameters
  (`AnalysisConfig`/`AnalysisBlameConfig`). This allows the same config to be
  used against different commits without mutation, and keeps config
  serialization/caching stable.
- **Baseline vs overlay is explicit** — global all-files pass creates baseline;
  per-file blame/commit-as-head runs update overlay. Hidden mutable coupling is
  eliminated.
- **Deterministic blame enrichment order** — even with future parallel blame
  execution, PersonDB updates must be committed in sorted file order so repeated
  runs remain reproducible.
- **No reverse flow** — git authors never create or modify roster members.
  Roster is an LMS-only data structure. Analysis shows matches for context but
  doesn't write back.
- **No manual workflow ID union updates** — `WorkflowId` is computed as `keyof
  WorkflowPayloads`, and `DesktopWorkflowId` is `keyof typeof workflowCatalog`.
  Adding entries to `WorkflowPayloads` + `workflowCatalog` is sufficient.
  Docs/CLI coverage is enforced by alignment tests that filter the catalog by
  `delivery` surface.

## Cancellation Behavior

- UI actions (Cancel button, tab switch, rerun) abort in-flight analysis
  requests.
- Workflow handlers accept `WorkflowCallOptions.signal` and pass it through to
  `gitCommand.run(...)`.
- Long-running loops (commit parsing, per-file blame) check `signal.aborted` and
  stop cooperatively.
- Docs mock `GitCommandPort` honors `AbortSignal` so cancellation behavior
  matches desktop semantics.

## Phased Delivery

### Phase 1: Domain primitives + schema/export wiring

- `domain/src/analysis/` subfolder: `types.ts`, `schemas.ts`,
  `person-merge.ts`, `person-db.ts`, `identity-bridge.ts`, `index.ts` barrel.
- Extend `ActiveTab` in `types.ts` and `persistedAppSettingsSchema` in
  `schemas.ts`.
- Add `./analysis` subpath export in `packages/domain/package.json`.
- Add `@repo-edu/domain/analysis` path mapping in `tsconfig.base.json`.
- Domain tests for `AnalysisConfig` validation/normalization and merge + PersonDB
  - bridge logic, including explicit `same normalized name + different email +
  empty roster` merge expectations and deterministic PersonDB id allocation.
- Explicit `schemas.ts` edge-case tests:
  - malformed shape handling for `subfolder` (for example array/object values)
    with path-level validation issues,
  - valid `fnmatch`/glob patterns that match nothing are accepted (no
    schema validation failure),
  - `since === until` single-day range accepted by cross-field date validation,
  - mixed-case `extensions` normalized to lowercase with deterministic dedupe,
  - `AnalysisBlameConfig` rejects date-range keys (`since`, `until`) and
    log-only keys (`excludeRevisions`, `excludeMessages`),
  - `copyMove` clamped to `[0, 4]`, non-integer values rejected,
  - `excludeAuthors`/`excludeEmails` pattern normalization (trim + dedupe)
    shared across both config types.

### Phase 2: Contract + parsers + handlers + runtime wiring

- Add `analysis.run` and `analysis.blame` to `WorkflowPayloads` with explicit
  `input/progress/output/result` channels.
- Add `workflowCatalog` metadata with `delivery: ["desktop", "docs"]`.
- Implement `analysis-workflows/log-parser.ts`,
  `analysis-workflows/blame-parser.ts`, and revision-parameterized
  `analysis-workflows/snapshot-engine.ts`.
- Create `analysis-workflows/` handlers in application, then export factory from
  `application` index. Backend scope includes both HEAD and commit-as-head
  snapshot execution via `asOfCommit`, and read-only `bridgeAuthorsToRoster`
  output on `analysis.run` when roster context is present.
- Wire handlers in desktop (`apps/desktop/src/trpc.ts`) and docs
  (`apps/docs/src/demo-runtime.ts`).
- Update contract/docs alignment tests impacted by new workflow ids.
- Add parser/engine tests for delimiter-safe `-z` parsing, binary numstat
  handling, per-file `--follow` overlap-reduction correctness, aggregation correctness,
  HEAD + commit-as-head parity, and Python-parity filter semantics
  (`since`/`until`, include/exclude precedence, case-insensitive `fnmatch`
  matching).
- Add workflow-level tests for `AbortSignal` propagation, cooperative
  cancellation, explicit validation/error mapping behavior for invalid config
  and invalid runtime repo/revision inputs, optional roster bridge output,
  contract behavior for `analysis.blame` overlay semantics (absent overlay
  starts from baseline; provided overlay continues from it), granular progress
  semantics (`processedFiles/totalFiles` monotonicity, expected phase
  transitions, deterministic per-file update cadence), determinism parity for
  `config.maxConcurrency=1` and `config.maxConcurrency>1`.
- Add parity tests against curated fixtures derived from `gigui-python` outputs
  for HEAD and commit-as-head snapshots.
- Add cancellation tests for both `analysis.run` and `analysis.blame` that
  verify `AbortSignal` propagation and cooperative stop points.

### Phase 3A: UI — Analysis tab shell, store, sidebar, author panel

Wire the Analysis tab into App.tsx and build the first visible panel. Adopts
Python's four-view structure (Authors, Authors-Files, Files-Authors, Files)
with Tauri's interactive filtering and charting improvements.

**Analysis store** (`stores/analysis-store.ts`):

- Config state: `AnalysisConfig` fields bound to sidebar controls.
- Result state: `AnalysisResult | null`, `BlameResult | null`, workflow
  status (`idle` | `running` | `error`), progress (`AnalysisProgress | null`).
- Filter state (post-analysis, client-side): `selectedAuthors: Set<string>`,
  `selectedFiles: Set<string>`. When non-empty, tables/charts show only
  matching entries from the full result set.
- Display state: `displayMode: "absolute" | "percentage"`,
  `activeMetric: "commits" | "insertions" | "deletions" | "linesOfCode"`,
  `activeView: "authors" | "authors-files" | "files-authors" | "files"`.
- UI-only display toggles: `showDeletions`, `showRenames` (git always
  collects both via `--numstat`/`--follow`; Python parity).

**Tab shell** (`components/tabs/AnalysisTab.tsx`):

- ResizablePanelGroup with sidebar (left) + main panel (right), mirrors
  GroupsAssignmentsTab pattern with persisted sidebar width.
- Main panel contains sub-tab navigation for the four views.
- Guard state: when no active course is loaded, show empty state message
  instead of sidebar + panels.

**Sidebar** (`components/tabs/analysis/AnalysisSidebar.tsx`):

- **Repo selection** — course-derived repo list (groups/assignments with
  cloned repos), not a freeform path picker. Single-select.
- **Date range** — `since`/`until` date inputs with strict YYYY-MM-DD
  format. No calendar picker initially (plain text input).
- **File filters** — `subfolder` text input, `extensions` chip input,
  `includeFiles`/`excludeFiles` pattern inputs.
- **Author/email exclusion** — `excludeAuthors`, `excludeEmails` pattern
  inputs.
- **Commit exclusion** — `excludeRevisions`, `excludeMessages` pattern
  inputs.
- **Options** — `whitespace` toggle (default off = ignore whitespace).
- **Run button** — triggers `analysis.run` workflow. Disabled while running.
  Cancel button appears during execution.
- **Progress display** — inline progress bar or phase/file counter below
  run button, driven by `AnalysisProgress` from workflow.
- **Error display** — inline banner below run button for `AppError` results.

**Author panel — Authors view** (`components/tabs/analysis/AuthorPanel.tsx`):

- **Display controls bar** — metric selector (Commits | Insertions |
  Deletions | Lines of Code), display mode toggle (Absolute | Percentage),
  `showDeletions` / `showRenames` / `scaledPercentages` toggles.
- **Author stats table** (TanStack Table):
  - Columns: Author (sticky left, color-coded), Email, Commits, Insertions,
    Deletions (conditional on `showDeletions`), Lines, Lines %, Insertions %,
    Stability %, Age (mean insertion age, formatted as Y-M-D). Optional
    columns: Scaled Lines %, Scaled Insertions % (conditional on
    `scaledPercentages`).
  - Percentage mode replaces absolute counts with percentages of total.
  - Sortable columns, default sort by commits descending.
  - Author color from rotating palette (Python: 9 colors; adopt Tauri's
    expanded 20-color palette for better differentiation).
  - Row click selects author for filtering.
- **Author charts** (`components/tabs/analysis/charts/AuthorCharts.tsx`):
  - Bar chart: daily activity by author, stacked, metric-selectable.
  - Line chart: cumulative lines of code over time per author (shown when
    metric = linesOfCode).
  - Pie chart: distribution per author for selected metric.
  - All Recharts, wrapped in ResponsiveContainer. No animations.
  - Custom tooltips with formatted values.
- **Post-analysis filter controls** (below table or in sidebar section):
  - Author checkboxes with colored labels (Tauri improvement). Select
    all / clear all. Filters table + charts client-side without re-running
    analysis.

**Author panel — Authors-Files view**
(`components/tabs/analysis/AuthorFilesPanel.tsx`):

- Same table structure as Authors view but grouped by author with expandable
  per-file breakdown rows (Python: Authors-Files tab). Each author row
  expands to show file-level stats for that author.
- Shares `displayMode` and `activeMetric` from store.

### Phase 3B: UI — File panel, charts, cross-reference views

**File panel — Files view** (`components/tabs/analysis/FilePanel.tsx`):

- **File stats table** (TanStack Table):
  - Columns: File (sticky left), Commits, Insertions, Deletions
    (conditional), Lines, Stability, Last Modified (relative time:
    Xy Mm Dd ago, Tauri improvement over Python).
  - Sortable columns, default sort by lines descending.
  - Row click opens file for blame (Phase 4 wiring).
- **File charts** (`components/tabs/analysis/charts/FileCharts.tsx`):
  - Stacked bar chart: top 25 files by selected metric, author-colored
    segments (Tauri improvement). "X/Y files shown" label.
  - Metric selector shared with file table.
  - Custom tooltip showing file path + per-author breakdown.
- **Post-analysis file filter** — file checkboxes grouped by folder in
  accordion (Tauri improvement). Select all / clear all per folder.

**File panel — Files-Authors view**
(`components/tabs/analysis/FileAuthorsPanel.tsx`):

- Same table structure as Files view but grouped by file with expandable
  per-author breakdown rows (Python: Files-Authors tab). Each file row
  expands to show author-level stats within that file.
- Shares `displayMode` and `activeMetric` from store.

### Phase 4: Blame analysis UI

**Blame config sidebar controls** (extend `AnalysisSidebar`):

- `copyMove` spinner (0-4, default 1) with label explaining detection levels.
- `includeEmptyLines`, `includeComments` toggles.
- `blameExclusions` selector (`hide` | `show` | `remove`, default `hide`).
- `blameSkip` toggle (default off). When on, blame sub-tab is hidden and
  `analysis.blame` is not invoked.
- `asOfCommit` text input (defaults to `resolvedAsOfOid` from last `analysis.run` result).
- Baseline/overlay mode indicator showing current PersonDB state.

**Blame panel — multi-file viewer**
(`components/tabs/analysis/BlamePanel.tsx`):

- Tabbed interface for multiple open blame files (Tauri improvement over
  Python's single-file view). Tab bar shows open file paths with close
  buttons. "Add files" button opens modal with file list from analysis
  result. "Close all" button.
- File selection from FilePanel row click opens blame tab for that file
  and triggers `analysis.blame` if not already loaded.

**Blame tab — per-file view**
(`components/tabs/analysis/BlameTab.tsx`):

- **Control toggles** (toolbar above blame grid):
  - Show metadata (author + commit columns) — toggle, default on.
  - Colorize author contributions — toggle, default on.
  - Hide empty lines — toggle, default off.
  - Hide comments — toggle, default off.
- **Author contributions summary** (shown when colorize is on):
  - Grid of author color bars + line count + percentage of file.
  - Sorted by line count descending. Uses same 20-color author palette.
- **Blame grid** (CSS grid, not a TanStack table — matches Tauri pattern):
  - Columns: ID (author rank by line count: most lines = 1), Author
    (color-coded left border), Date (YYYY-MM-DD), Message (truncated,
    tooltip for full), SHA (monospace, 7-char truncated), Commit# (sequential
    from 1 for initial commit, ordered by commit time), Line# (sticky left),
    Code (monospace, preserve whitespace).
  - Commit grouping: metadata shown only on first line of each commit
    group (subsequent lines show empty ID/author/date/message/SHA/commit#
    cells).
  - Row background: author color at 40% opacity when colorize is on.
  - Left border: 2px solid author color for entire commit group.
  - Excluded lines (author-excluded, comment, empty) rendered according to
    `blameExclusions` mode: `hide` = uncolored/white, `show` = colored
    normally, `remove` = omitted from output.
  - Empty lines rendered as non-breaking space. Comment lines italicized.
  - Scrollable container with sticky header row.
- **PersonDB enrichment display**:
  - After blame completes, show delta summary: new persons discovered,
    new aliases linked, relinked identities. Inline below blame grid.
  - Incremental PersonDB updates from each per-file blame result applied
    in deterministic file order.

### Phase 5: Roster match display

- Consume existing `analysis.run` roster bridge output in the Analysis UI.
- Add "Roster match" column to AuthorPanel (matched member name + confidence
  badge).
- Add renderer/docs tests for matched/unmatched states and confidence badge
  rendering.

### Phase 6 (Fast Follow): Analysis result cache

- Add cache support for `analysis.run` behind `AnalysisResultCache` in
  `AnalysisWorkflowPorts`; desktop provides the cache, docs does not.
- Desktop cache avoids repeated multi-minute runs for large repositories.
- Cache key: `repoGitDir + resolvedAsOfOid + normalizedAnalysisConfigJson +
  normalizedRosterContextFingerprint + analysisSchemaVersion`. Uses the
  repo's `.git` directory path (stable across worktree locations) rather
  than `repoRoot` to avoid absolute-path sensitivity.
- Define `normalizeAnalysisConfigForCache(config)` as the canonicalization step:
  - Expand default values for omitted optional fields.
  - Apply the same normalization as domain `validateAnalysisConfig(...)` (trim,
    POSIX path normalization, extension normalization).
  - Canonicalize arrays by semantic role:
    - unordered sets (`extensions`, `includeFiles`, `excludeFiles`) are
      deduplicated and sorted lexicographically;
    - ordered lists (if introduced later) preserve order.
  - Canonicalize empty equivalents (`undefined`, `null`, empty string, empty
    list) to one canonical representation per field.
  - Exclude non-semantic/transient UI-only fields from cache-key material.
  - Serialize the normalized object using stable-key JSON so semantically
    equivalent configs produce identical key material.
- Define `normalizeRosterContextForCache(rosterContext)` and derive
  `normalizedRosterContextFingerprint`:
  - Canonicalize unmatched/no-context states to one representation.
  - Canonicalize roster members used for matching (trim/case normalization
    rules aligned with bridge semantics, stable ordering).
  - Serialize with stable-key JSON and hash for compact cache-key material.
- Cache value: full `analysis.run` result payload (including `personDbBaseline`
  and optional roster match output).
- Cache lookup policy: exact-key hit returns cached result; miss runs full
  analysis and stores result.
- Cache control: bounded size (LRU) and explicit cache-version bump path via
  `analysisSchemaVersion`.
- Surface gating: when `ports.cache` is `undefined` (docs runtime), handlers
  skip cache lookup/store entirely.
- Phase 6 starts only after canonicalization helper tests prove semantic
  equivalence stability (same semantics -> same key, different semantics ->
  different key).
- Docs runtime remains in-memory only (no persistence).

## Future Work

- **Parallel git execution tuning** — after correctness is proven through
  extensive testing, raise/tune bounded concurrency defaults (for example 4-8
  workers) for both `git log --follow` and `git blame`. Overlap reduction, stat
  aggregation, and PersonDB updates must still be applied in sorted file order
  regardless of execution order.

## Verification

Each phase:

- `pnpm fix`
- `pnpm check` (full workspace: lint + typecheck + build:types +
  check:fixtures + check:architecture)

Milestone checks:

- Contract catalog/alignment tests pass after workflow additions.
- Docs workflow alignment remains exhaustive.
- App settings round-trip supports `activeTab: "analysis"`.
- Analysis parser + aggregation tests pass for `analysis.run`.
- PersonDB determinism checks pass: same log/blame inputs produce identical
  snapshot ids and deltas.
- Python parity fixture checks pass for both HEAD and commit-as-head snapshots,
  except explicitly documented architectural deviation.

End-to-end:

- Desktop: open app → load course → Analysis tab → select repo → run analysis → verify
  author/file tables → run blame → verify blame view → load a course → verify
  identity matching column and confidence badges are correct for
  matched/unmatched authors (read-only, no roster mutation).
- Docs: open demo runtime with analysis tab available → run mocked
  analysis/blame flows → verify tab renders and workflow calls complete without
  Node/Electron APIs.
