---
title: Groups & Assignments
description: Organize students into teams, create assignments, and configure repository templates
---

The Groups & Assignments tab has a sidebar listing group sets and a detail panel showing groups, assignments, and repository templates for the selected group set.

## Group sets

A group set is a named collection of groups (teams). Each group set organizes students differently — for example, one group set for lab partners and another for project teams. Assignments are linked to group sets, so each assignment uses one team organization.

There are three kinds of group sets:

### System group sets

Created automatically and always present:

- **Individual Students** — every active student as a solo group. Use this for individual assignments where each student gets their own repository.
- **Staff** — all staff members in a single group.

System group sets cannot be renamed, deleted, or manually edited.

### LMS group sets

Imported from your connected LMS (Canvas group sets or Moodle groupings). These are linked to the LMS source and can be synced to pull in membership changes.

To add an LMS group set, click the **+** button next to the LMS section header. This fetches available group sets from the LMS and lets you select which one to connect.

After connecting, click **Sync** on a group set to refresh its membership from the LMS.

### Local group sets

Created within repo-edu, either manually or by importing files.

- **Create manually** — use the dropdown menu to create an empty group set, then add groups and assign members
- **Import from CSV** — upload `group_name,name,email` rows (see [Output Formats](/repo-edu/reference/output-formats/) for the format). CSV import updates matching groups and appends new groups without deleting unmentioned groups.
- **Import from RepoBee students file** — upload a `.txt` file with whitespace-separated Git usernames per line. RepoBee import uses full-replace semantics for the target imported group set.

Local group sets can be freely renamed, edited, and deleted.

## Managing groups within a group set

Select a group set in the sidebar to see its groups in the detail panel. Each group shows:

- **Group name** — editable for local groups
- **Members** — shown as chips. Click to add or remove members.
- **Assignments** — badges showing which assignments use this group set

### Adding a group

Click **Add Group** in the detail panel to create a new group within the selected group set. Give it a name, then assign members.

### Editing membership

Click the member area of a group to open the member picker. You can add students from the roster or remove existing members. A student can belong to only one group within a group set — assigning them to a new group automatically removes them from their previous one.

### Deleting a group

Remove a group from the set. Members are unassigned but remain in the roster.

## Assignments

Assignments are created within a group set and represent a deliverable that needs repositories. Each assignment has:

- **Name** — the assignment display name (e.g., "Project 1", "Lab 3")
- **Group set** — which team organization to use (inherited from where you create it)

### Creating an assignment

In the detail panel for a group set, click **Add Assignment**. Enter a name, and the assignment is linked to that group set.

### Repository template

Each group set can have a repository template that applies to all its assignments. The template defines:

- **Owner and name** — the source repository on your Git provider (e.g., `my-org/project-template`)
- **Visibility** — whether created repositories are private, internal, or public

When repositories are created for an assignment, they are initialized with the template's content and configured with the specified visibility.

## Exporting group sets

Select a group set and click **Export** to download it as:

- **CSV** — for named group sets; one row per member per group, with `group_name,name,email` columns
- **TXT** — for unnamed group sets; RepoBee-compatible `students.txt` (one whitespace-separated username team per line)

## Reimporting a group set

For editable local/imported group sets, use **Import** again with a target group set:

- **CSV reimport** keeps existing groups unless explicitly updated/added in the file.
- **RepoBee reimport** replaces the target imported set and shows membership-based add/remove/change preview buckets.

## Repository operations

The detail panel for a group set includes an operations bar with four buttons. The first three run against the selected assignment's group set; the fourth is namespace-scoped.

- **Create Repos** — creates one repository per group. Template content is pushed to fresh repositories only. Groups with no members are skipped with an `N empty groups will be skipped` caption.
- **Update Repos** — opens a pull request in every recorded repository with the latest template diff. Uses the stored template commit SHA as the baseline.
- **Clone Repos** — clones each recorded repository to the target folder. Fields: target folder and directory layout (`flat`, `by-team`, `by-task`). Target folder must be an absolute path or start with `~`. Groups without a recorded name fall back to deriving the name from the current template and roster, which supports importing repositories created externally (e.g. with RepoBee) by running Clone once with a matching naming template.
- **Clone All** — lists every repository in the configured namespace and clones the selected subset to a target folder. Target folder must be an absolute path or start with `~`. Does not require an assignment and does not touch course state.

Create, Clone, and Update all record the accepted repository names on the assignment. Recorded names take precedence over derived names on subsequent runs, which is what keeps Update/Clone stable across roster edits and `{members}`-parameterized templates.

### Clone All

Opens a live panel: the preview list populates automatically from the configured Git connection and namespace, and re-runs whenever you edit an input that affects the query.

- **Name filter** (optional, e.g. `1*`) — filters by leaf name. Syntax: `*` = any characters, `?` = one character; leave blank to list all. The filter matches the leaf shown, never the subgroup prefix, so `1*` selects leaves starting with `1` and a leaf like `group-30-2iv60` living inside a team subgroup `111_…` is not matched. When a repo sits inside a subgroup, the panel shows the subgroup path next to the leaf (e.g. `group-30-2iv60  (111_dyliiev_…)`) so its origin is obvious at a glance.
- **Include archived** — toggles archived repos into/out of the preview.
- **Target folder** — destination for the clone. Must be an absolute path or start with `~`. Editing this field does *not* re-run the listing (the target isn't part of the listing query).
- **Clone N Repositories** — bulk-clones every repository in the current preview into the target folder. Each local folder uses only the repository's leaf name, so a GitLab project at `parent-group/team-101/lab-1` clones into `<target>/lab-1` (not the flattened subgroup path). If two listed repositories share the same leaf name, the operation aborts with a validation error rather than overwriting. Disabled while the preview is refreshing so a stale list can't be cloned by mistake.

Filter edits are debounced and the in-flight listing request is cancelled when inputs change again, so rapid typing coalesces into a single provider call. A small "refreshing…" indicator appears next to the match count while the next listing is resolving.

The target folder is pre-filled from the course-level clone target but edits are held in panel state only — assignment-scoped Clone remains the sole writer of the course setting.

## Validation

Before running repository operations, validate your setup. The desktop app shows validation issues as cards that you can click to see affected members. Common issues:

- Students missing Git usernames
- Empty groups
- Duplicate repository names
- Missing Git connection or organization

See [Repository Setup](/repo-edu/user-guide/repository-setup/) for the full validation and creation workflow.
