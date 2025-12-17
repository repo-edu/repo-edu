# Command-Line Help for `redu`

This document contains the help content for the `redu` command-line program.

**Command Overview:**

* [`redu`↴](#redu)
* [`redu setup`↴](#redu-setup)
* [`redu verify`↴](#redu-verify)
* [`redu clone`↴](#redu-clone)
* [`redu profile`↴](#redu-profile)
* [`redu profile list`↴](#redu-profile-list)
* [`redu profile active`↴](#redu-profile-active)
* [`redu profile show`↴](#redu-profile-show)
* [`redu profile load`↴](#redu-profile-load)

## `redu`

**Usage:** `redu [OPTIONS] [COMMAND]`

### **Subcommands:**

* `setup` — Set up student repositories from templates
* `verify` — Verify platform settings and authentication
* `clone` — Clone student repositories
* `profile` — Profile management commands

#### **Options:**

* `--markdown-help` — Print complete CLI documentation as markdown
* `--git-base-url <GIT_BASE_URL>` — Git platform base URL
* `--git-token <GIT_TOKEN>` — Git access token (or use REPOBEE_TOKEN env var)
* `--git-user <GIT_USER>` — Git user name
* `--student-org <STUDENT_ORG>` — Student repositories organization/group
* `--template-org <TEMPLATE_ORG>` — Template repositories organization/group
* `--yaml-file <YAML_FILE>` — YAML file with student teams
* `--target-folder <TARGET_FOLDER>` — Target folder for cloning repositories
* `--assignments <ASSIGNMENTS>` — Assignments (comma-separated)
* `--directory-layout <LAYOUT>` — Directory layout (by-team, flat, by-task)

## `redu setup`

Set up student repositories from templates

**Usage:** `redu setup [OPTIONS]`

### **Options:**

* `-p`, `--platform <PLATFORM>` — Platform to use (github, gitlab, gitea, local)

  Possible values: `git-hub`, `git-lab`, `gitea`, `local`

* `--template <TEMPLATES>` — Template repository names (can be specified multiple times)
* `--teams-file <TEAMS_FILE>` — Student teams file (JSON/YAML format)
* `--work-dir <WORK_DIR>` — Working directory for cloning templates
* `--private <PRIVATE>` — Create private repositories

  Possible values: `true`, `false`

* `--team <TEAMS>` — Student teams in format "name:member1,member2" (can be specified multiple
  times)

## `redu verify`

Verify platform settings and authentication

**Usage:** `redu verify [OPTIONS]`

### **Options:**

* `-p`, `--platform <PLATFORM>` — Platform to use

  Possible values: `git-hub`, `git-lab`, `gitea`, `local`

## `redu clone`

Clone student repositories

**Usage:** `redu clone [OPTIONS]`

### **Options:**

* `-p`, `--platform <PLATFORM>` — Platform to use

  Possible values: `git-hub`, `git-lab`, `gitea`, `local`

* `--assignments <ASSIGNMENTS>` — Specific assignments to clone (overrides settings)

## `redu profile`

Profile management commands

**Usage:** `redu profile <COMMAND>`

### **Subcommands:**

* `list` — List all available profiles
* `active` — Show the active profile name
* `show` — Show settings of active profile
* `load` — Load a profile (set as active)

## `redu profile list`

List all available profiles

**Usage:** `redu profile list`

## `redu profile active`

Show the active profile name

**Usage:** `redu profile active`

## `redu profile show`

Show settings of active profile

**Usage:** `redu profile show`

## `redu profile load`

Load a profile (set as active)

**Usage:** `redu profile load <NAME>`

### **Arguments:**

* `<NAME>` — Profile name to load

<hr/>

<small><i>
    This document was generated automatically by
    <a href="https://crates.io/crates/clap-markdown"><code>clap-markdown</code></a>.
</i></small>
