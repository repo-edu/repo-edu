# Command-Line Help for `redu`

This document contains the help content for the `redu` command-line program.

**Command Overview:**

* [`redu`↴](#redu)
* [`redu lms`↴](#redu-lms)
* [`redu lms verify`↴](#redu-lms-verify)
* [`redu lms generate`↴](#redu-lms-generate)
* [`redu repo`↴](#redu-repo)
* [`redu repo verify`↴](#redu-repo-verify)
* [`redu repo setup`↴](#redu-repo-setup)
* [`redu repo clone`↴](#redu-repo-clone)
* [`redu profile`↴](#redu-profile)
* [`redu profile list`↴](#redu-profile-list)
* [`redu profile active`↴](#redu-profile-active)
* [`redu profile show`↴](#redu-profile-show)
* [`redu profile load`↴](#redu-profile-load)

## `redu`

Repository and LMS management for education

**Usage:** `redu [OPTIONS] [COMMAND]`

### **Subcommands:**

* `lms` — LMS operations (Canvas/Moodle)
* `repo` — Repository operations (GitHub/GitLab/Gitea)
* `profile` — Profile management

#### **Options:**

* `--markdown-help` — Print complete CLI documentation as markdown

## `redu lms`

LMS operations (Canvas/Moodle)

**Usage:** `redu lms <COMMAND>`

### **Subcommands:**

* `verify` — Verify LMS course connection
* `generate` — Generate student files from LMS

## `redu lms verify`

Verify LMS course connection

**Usage:** `redu lms verify [OPTIONS]`

### **Options:**

* `--lms-type <LMS_TYPE>` — Override LMS type (Canvas, Moodle)
* `--course-id <COURSE_ID>` — Override course ID

## `redu lms generate`

Generate student files from LMS

**Usage:** `redu lms generate [OPTIONS]`

### **Options:**

* `--output <OUTPUT>` — Override output folder
* `--yaml <YAML>` — Generate YAML file

  Possible values: `true`, `false`

* `--csv <CSV>` — Generate CSV file

  Possible values: `true`, `false`

## `redu repo`

Repository operations (GitHub/GitLab/Gitea)

**Usage:** `redu repo <COMMAND>`

### **Subcommands:**

* `verify` — Verify git platform connection
* `setup` — Set up student repositories from templates
* `clone` — Clone student repositories

## `redu repo verify`

Verify git platform connection

**Usage:** `redu repo verify [OPTIONS]`

### **Options:**

* `-p`, `--platform <PLATFORM>` — Platform (github, gitlab, gitea, local)

  Possible values: `github`, `gitlab`, `gitea`, `local`

## `redu repo setup`

Set up student repositories from templates

**Usage:** `redu repo setup [OPTIONS]`

### **Options:**

* `-p`, `--platform <PLATFORM>` — Platform to use

  Possible values: `github`, `gitlab`, `gitea`, `local`

* `--template <TEMPLATES>` — Template repository names (can be specified multiple times)
* `--teams-file <TEAMS_FILE>` — Student teams file (JSON/YAML format)
* `--work-dir <WORK_DIR>` — Working directory for cloning templates
* `--private <PRIVATE>` — Create private repositories

  Possible values: `true`, `false`

* `--team <TEAMS>` — Student teams in format "name:member1,member2" (can be specified multiple
  times)

## `redu repo clone`

Clone student repositories

**Usage:** `redu repo clone [OPTIONS]`

### **Options:**

* `-p`, `--platform <PLATFORM>` — Platform to use

  Possible values: `github`, `gitlab`, `gitea`, `local`

* `--assignments <ASSIGNMENTS>` — Specific assignments to clone (overrides settings)

## `redu profile`

Profile management

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
