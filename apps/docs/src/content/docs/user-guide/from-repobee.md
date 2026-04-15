---
title: Coming from RepoBee
description: Conceptual mapping, migration path, and behavioral differences when moving from RepoBee to repo-edu
---

This page is for teachers who already use [RepoBee](https://github.com/repobee/repobee) to manage student repositories and want to understand how repo-edu relates. It covers the conceptual mapping, how to move an in-flight course across, and the points where the two tools behave differently.

repo-edu is not a drop-in replacement for RepoBee — it takes a different stance on what to persist between operations. But the practical migration path is small: import your `students.txt`, configure the naming template to match what you already have on the server, and the existing repositories are adopted the first time you run Clone or Create.

## Conceptual mapping

| RepoBee concept | repo-edu equivalent | Notes |
|-----------------|---------------------|-------|
| Student | Roster member | Imported from an LMS or a file. |
| Team (in `students.txt`) | Unnamed group set + team | `students.txt` lines become `UsernameTeam` entries in a group set with `nameMode: "unnamed"`. Teams are identified by a generated `ut_NNNN` id. |
| Master/template repository | Assignment repository template | Configured per group set or per assignment. Either a remote `owner/name` or a local directory. |
| Assignment (as a CLI flag, e.g. `--assignment lab1`) | `Assignment` entity | First-class in repo-edu: it persists, links to a group set, and tracks operation artifacts (template commit SHA, recorded repository names). |
| Organization / namespace | Git organization on the course, or namespace on `redu repo discover` | repo-edu stores the organization on `PersistedCourse`; `discover` takes it as a flag. |
| `repobee repos setup` | `redu repo create` (or the desktop **Create Repos** button) | |
| `repobee repos clone` | `redu repo clone` (or **Clone Repos**) | |
| `repobee repos update` | `redu repo update` (or **Update Repos**) | Opens a pull request per target repo instead of force-pushing. |
| `repobee repos --discover-repos` | `redu repo discover` (or **Clone All**) | Reduced form: lists and clones by name pattern, but does not match server repos back to teams. |

## Migration flow

Pick the course that's already running with RepoBee. You need:

- Your RepoBee `students.txt` (the teams file).
- The naming template you used with RepoBee (e.g. `{assignment}-{members}` where `{members}` is a dash-joined username list).
- Admin access to the Git organization where the repositories live.

### 1. Import students and teams

In the desktop app, create a course and import your RepoBee `students.txt`:

- From the **Groups & Assignments** tab, open the group-set dropdown → **Import from RepoBee students file**. Each whitespace-separated line becomes a team (unnamed group set). See [Output Formats](/repo-edu/reference/output-formats/#repobee-students-import-txt) for the exact shape.

Members are materialized as Git usernames; email and LMS identity are left blank until you import an LMS roster (optional — repo-edu can operate on usernames alone for assignments against unnamed group sets).

### 2. Configure the naming template

On the imported group set, set `repoNameTemplate` to match the names on the server. If your RepoBee repos are `lab1-alice-bob`, the template is `{assignment}-{members}`. The `{members}` token expands to the team's dash-joined, sorted, lowercase usernames.

### 3. Create the assignment(s)

Add an `Assignment` under the imported group set for each RepoBee `--assignment` name you've already used (e.g. `lab1`, `lab2`). This is what anchors the template commit SHA and the recorded repository names.

### 4. Adopt the existing repositories

Run **Clone Repos** (or `redu repo clone --assignment lab1 --target …`). For every team, repo-edu derives the expected name from the template, clones the existing server repo, and records the accepted name on the assignment. From that point on, the recorded name is the source of truth — subsequent Update and Clone runs use it directly and no longer depend on roster state or template interpolation.

Mismatches (for example, a repository named slightly differently on the server) show up as failures in `repositoriesFailed` with a `not_found` reason. Adjust the template, re-run, and the gap closes.

You can also start from Create: **Create Repos** sends each derived name to the provider, which returns `alreadyExisted` for every repo you previously made with RepoBee. Those count as `repositoriesAdopted` and have their names recorded; no template content is pushed to them (adopted repos keep whatever content they already have).

## Behavioral differences to expect

### Names are recorded, not re-derived

RepoBee derives the repository name from the current team name (or usernames) on every operation. If a team's makeup changes, the expected name changes too, and the bookkeeping drifts.

repo-edu records the accepted repository name on the assignment the first time an operation succeeds. Subsequent Update and Clone runs use the recorded name verbatim, so a roster edit cannot silently break operations that target repositories the teacher has already created.

The practical consequence: once repo-edu has recorded a name, renaming a team in the UI is a cosmetic change. It doesn't touch the server and doesn't break future operations.

### Missing repositories are surfaced, not silently skipped

If `repobee repos clone` encounters a team whose repository doesn't exist, the repo is dropped from the result set without much signal. repo-edu counts missing repositories as failures (`repositoriesFailed`) and logs the miss explicitly — so a partial failure is visible in the summary rather than hidden.

### Update creates pull requests

`repobee repos update` typically force-pushes template changes onto the student repository's main branch. repo-edu's Update opens a pull request per target repository with the template diff as commits, leaving the student's `main` untouched. This is a deliberate pedagogy choice: students see a review surface for incoming template changes rather than finding their branch rewritten.

### Access control is out of scope

RepoBee wires team membership and access with its own commands. repo-edu creates the repositories and initializes content; it does not manage teams, permissions, branch protection, or issue templates. Set up access and protection through your Git provider's own interfaces.

### `--discover-repos` has a reduced analogue

`repobee repos --discover-repos` lists every repository in the org and attempts to match them back to teams in the current roster. repo-edu splits that into two operations:

- [`redu repo discover`](/repo-edu/cli/repo-commands/#redu-repo-discover) (or **Clone All**) — lists and clones every repository that matches a glob pattern, without matching them to teams.
- Assignment-scoped Clone — when the naming template aligns, each derived name is cloned and the record is set as a side effect.

The match-to-team step is intentionally not automated: when the template lines up, Clone adopts the repos naturally; when it doesn't, automatic matching would guess incorrectly and write the wrong records.

## What does not carry over

- **RepoBee issue templates and plug-ins.** There is no equivalent.
- **CI configuration pushed via RepoBee.** repo-edu pushes the template repository's initial content to fresh-created repos; on subsequent Update runs, only the diff since the stored template SHA is proposed as a pull request. Anything your RepoBee setup pushed outside of the template repository will not be replicated.
- **RepoBee's local cache of team/repo state.** repo-edu's equivalent state lives inside the course JSON (`repositories` per assignment, `templateCommitSha` per assignment) and is versioned with the course.

## Where to go next

- [Repository Setup](/repo-edu/user-guide/repository-setup/) — the full assignment-scoped workflow (Create / Clone / Update).
- [Repository Commands](/repo-edu/cli/repo-commands/) — CLI reference for `repo create` / `repo clone` / `repo update` / `repo discover`.
- [Repository Records](/repo-edu/development/repository-records/) — the design rationale for why names are recorded, for readers who want the developer-level story.
