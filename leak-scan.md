# Leak scan

This repository is public. A commit is public the moment it is pushed, and a
later revert does not unpublish it. So the check runs before the commit, not
after the push: `pnpm leak-scan`, run by a git hook on every commit.

Rulings behind this file, made on 2026-09-04: an accidental paste is the
likely leak, not a deliberate one, so the scan must fire without anyone
remembering to run it. The account names `aivm`, `dvbeek` and `davbeek` are
publishable and are not leaks. The author email `d.a.v.beek@tue.nl` is on
every commit already and is not a leak. There is no reading step for names of
real people: no scan finds a name, and the user has not asked for a manual
step.

The rules and the one-time setup live in this file at the repository root,
beside `CLAUDE.md`, so the scripts can name it in one line.

## What counts as a leak

- A credential value: a token, a key, a password, a signed URL.
- Data about a real person: a student or teacher name, a student number, a
  real email address, a roster, an export from the learning system.
- Pasted output that carries either of the above: a log, an HTTP header, a
  shell transcript, a settings dump.

Test fixtures use invented people and reserved domains. An invented email
uses a domain under `example.com`, `example.org` or `example.net`, such as
`alice@uni.example.com` and `alice@personal.example.com`, or any domain ending
in `.test`, `.invalid` or `.local`. Names under the example domains keep a
distinction a test needs, such as a university address against a personal
one.

## `pnpm leak-scan` on every commit

Two commands run one scanner, Betterleaks, with one rule set: its default
credential rules plus one email rule, both read from `.betterleaks.toml` at
the repository root. Each command runs the whole rule set over its own scope:

| Command              | Scope                        | Exit on a hit |
| -------------------- | ---------------------------- | ------------- |
| `pnpm leak-scan`     | the whole staged tree        | 1, the gate   |
| `pnpm leak-scan:git` | every commit on every branch | 0, a report   |

The scripts live under `scripts/`, one per command, beside the other root
shell scripts. The root `package.json` names them:

```json
"leak-scan": "bash ./scripts/leak-scan.sh",
"leak-scan:git": "sh ./scripts/leak-scan-git.sh"
```

A git pre-commit hook runs `pnpm leak-scan` on every commit from every client:
the shell, GitKraken and any editor. A hit stops the commit: fix the file,
stage it, commit again. Do not skip the hook, with `git commit -n`, `HUSKY=0`
or GitKraken's skip-hooks option: a hit that is judged by eye is a hit nobody
checked. The scan prints each hit as file, line and the matched text;
Betterleaks needs its `-v` flag for that, because without it the hook only
printed a count and blocked a commit without showing what it caught.

The hook script:

```sh
#!/usr/bin/env bash
# Leak scan before a commit: credentials and email addresses in every tracked file as staged.
# The rules are in leak-scan.md.
#
# Betterleaks has no tracked-tree mode: `dir` walks the file system with .gitignore unread, and
# `git` reads commit diffs. So the staged tree is exported once and scanned as one folder, where
# Betterleaks also finds .betterleaks.toml on its own.

set -euo pipefail

if ! command -v betterleaks >/dev/null 2>&1; then
  printf 'leak-scan: betterleaks is not installed; run: brew install betterleaks\n' >&2
  exit 1
fi

tree=$(mktemp -d "${TMPDIR:-/tmp}/leak-scan.XXXXXX")
trap 'rm -rf "$tree"' EXIT
git archive "$(git write-tree)" | tar -x -C "$tree"
betterleaks dir --no-banner -v "$tree"
```

The hook follows `quick-failure` in `BOUNDARIES.md`. If temporary-folder
creation or the staged-tree export fails, it stops with the command's error
and a non-zero exit. It never scans an incomplete export. Bash's `pipefail`
makes a failure on either side of the export pipeline fail the hook; `-e`
stops before the scanner runs. The package command invokes Bash explicitly
so these settings apply on both supported developer platforms.

The hook scans the whole staged tree, not only the changes a commit stages,
so the tree stays clean on every commit: a leak an earlier commit let through,
for example one made on a clone without the hook, is caught by the next
commit anywhere. The tree is exported with `git archive` of `git write-tree`
into a temporary folder and scanned as one folder, because Betterleaks has no
tracked-tree mode of its own: `dir` walks the file system, `.gitignore`
unread, and `git` reads commit diffs. Passing the tracked files one by one is
slow, because each command-line path is a scan source of its own: 1116 file
arguments took 16 seconds, one exported folder takes about half a second, and
one folder also lets Betterleaks find `.betterleaks.toml` on its own. A
staged-diff scan beside the tree scan would read the same content twice, so
the hook makes the one call and no separate whole-tree command exists.

Email addresses are found by one rule in `.betterleaks.toml`, not by a
separate script. The rule matches any address, upper case included, and
carries its own allow list, checked against the matched address alone and
never against the rest of the line. That closes the two holes the earlier
shell scan had: an allowed address on a line hid every other address on that
line, and an address with a capitalised domain passed. The rule's allow list
is:

- The author and the project mailbox `opensource@repo-edu.dev`.
- The reserved fixture domains from the section above, `.local` included
  because the Gitea and GitLab integration fixtures use it. Each domain
  allowance is checked against the matched address and must reach its end, so
  a file named `something.test.ts` gets no allowance from its name.
- Third-party licence texts under a `licenses/` folder, whose copyright lines
  belong to their authors. Matched on the file path, for this rule only.
- The address part of the fixture clone URL `x-access-token:token@github.com`,
  with an optional `-1` on the token, which the repository test harness uses.
  The email rule sees `token@github.com`, so its allowance names that form; the
  credential allowance for the same URL is a separate entry, listed below.

The allow list grows only for a line that is not a person and cannot be
rewritten. A placeholder or a fixture is rewritten instead.

`leak-scan:git` runs
`betterleaks git . --no-banner -v --log-opts=--all --exit-code 0`, the same
rule set over every commit on every branch, with `-v` so each hit shows its
file, line and matched text. It always exits `0`: a hit
in history was pushed and is public, so it is a report to act on, not a gate
to pass. `--log-opts=--all` matters because the default reads the current
branch alone, and a leak on any pushed branch is as public as one on `main`.

### The scanner

The scanner is Betterleaks, `v1.8.1` on 2026-09-04, MIT licensed. Homebrew
installs the current release and nothing pins it. It is the successor to
gitleaks from the same author: the gitleaks README states that gitleaks is
feature complete and will only receive security patches, so new token shapes
land in Betterleaks alone. The two commands the scan needs are the same in
both, `dir` for a folder and `git` for a history, and both find a config file
at the scanned path on their own. Decision 9 of `public-migration.md` chose
gitleaks before that README notice; the user switched to Betterleaks on
2026-09-04 and that decision now names Betterleaks too, landed as
`public-migration/B1` in this repository.

Betterleaks is also the email scanner, through one custom rule in its config,
so there is one scanner, one config and one allow-list format to own. A
hand-written email scan in shell stood beside it before; it needed its own
pattern file and had two holes, recorded above, that the rule closes by
construction. A rule in Betterleaks reports each matched address on its own
and checks the allow list against that match, which the shell scan could not
do line by line. The user accepted the move on 2026-09-05.

A credential hit is rewritten so it no longer looks like a secret. Only a
fixture that must keep its secret shape is allowed, by its exact text. The
`.betterleaks.toml` at the repository root holds those allowances and the
email rule:

```toml
[extend]
useDefault = true

# Credential fixtures, each by its exact text, never by path.
[[allowlists]]
regexTarget = "match"
regexes = ['''<the exact fixture text>''']

# Every email address, checked against the allow list of this rule alone.
[[rules]]
id = "email-address"
description = "Email address outside the fixture allow list"
regex = '''(?i)[a-z0-9._%+-]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}'''
keywords = ["@"]

[[rules.allowlists]]
regexTarget = "match"
regexes = [
  '''(?i)^d\.a\.v\.beek@tue\.nl$''',
  '''(?i)^opensource@repo-edu\.dev$''',
  '''(?i)@([a-z0-9-]+\.)*example\.(com|org|net)$''',
  '''(?i)@[a-z0-9.-]+\.(test|invalid|local)$''',
  '''^token(-[0-9]+)?@github\.com$''',
]

[[rules.allowlists]]
paths = ['''(^|/)licenses/''']
```

Betterleaks accepts these gitleaks-style blocks for compatibility and adds them
to the default rules. Do not use a top-level `filter` expression for this: a
`filter` in this file replaces the default rule set's own filter, which drops
the false-positive protection that ships with the scanner. Allow credentials
by text, never by path: a path allowance turns every test folder into a place
where a real secret passes. The one path allowance belongs to the email rule
alone, so it does not exempt credentials in licence files. Betterleaks skips
`pnpm-lock.yaml` before any rule runs, so the file needs no allowance; only
pnpm writes that file. The
match text starts where the rule's pattern starts, so a `generic-password`
allowance begins at the bare `PASSWORD` key, not at a longer variable name in
front of it.

The allowed credential fixtures today are the harness clone URL above, the PEM
block the examination privacy filter test must detect, the Gitea and GitLab
harness account passwords for the local Docker instances and the signing test
value whose redaction a test asserts.

### The hook

Husky `9.1.7` installs the hook. Three pieces, all at the repository root:

1. `husky` as a development dependency in `package.json`.
2. A `prepare` script in `package.json` with the value `husky`. pnpm runs
   `prepare` after every `pnpm install`, and the `husky` command points git's
   `core.hooksPath` at the generated `.husky/_` folder, whose runner calls the
   tracked `.husky/pre-commit`.
3. The tracked file `.husky/pre-commit` with the one line `pnpm leak-scan`.

The hook is why the scan needs no sentence in any workflow file. A sentence
fires only when a session follows it, and the user's own commits through
GitKraken never read it; the ruling above asks for a check nobody has to
remember. Husky is chosen because `pnpm install` installs the hook on every
clone with no extra step. Lefthook does the same with a parallel runner this
repository has no use for. A plain hooks folder with `core.hooksPath` set by
hand needs one command per clone that someone must remember, which the ruling
rules out.

### Setup, once

On each development machine, in this order. Developer tools run on macOS and
Linux only, per the `developer-tool-platforms` boundary.

1. Install the scanner:

   ```bash
   brew install betterleaks
   ```

2. Run `pnpm install`, which installs the hook.
3. On macOS, GitKraken and other desktop apps do not see the shell PATH, so a
   hook they start cannot find `pnpm` or `betterleaks`. Husky reads
   `~/.config/husky/init.sh` before every hook. Put the folders that hold the
   two commands there once. Betterleaks from Homebrew lives in
   `/opt/homebrew/bin`; the machine of 2026-09-04 keeps a standalone pnpm in
   `~/Library/pnpm`, so the line names both:

   ```sh
   export PATH="/opt/homebrew/bin:$HOME/Library/pnpm:$PATH"
   ```

No first run is needed: the hook scans the whole staged tree on the first
commit. `pnpm leak-scan` can be run by hand at any time to check the staged
tree without committing.

On 2026-09-04 the first email scan over the whole tree printed 120 lines in 24
files, all rewritten in the implementation commit:

- Fixture addresses in test files under `packages/domain`,
  `packages/renderer-app`, `packages/application`, `packages/integrations-git`,
  `packages/integrations-lms` and `apps/cli`, on the domains `uni.edu`,
  `test.com`, `example.edu`, `personal.com`, `work.com`, `other.com`, `a.com`,
  `b.com`, `school.edu` and `work.edu`. Each moved to a name under
  `example.com` that keeps its role, such as `alice@uni.example.com` for a
  university address and `alice@personal.example.com` for a personal one.
- The placeholder shown in the empty email field of `GitConnectionsPane.tsx`
  and `LmsConnectionsPane.tsx` under
  `packages/renderer-app/src/components/settings`, an address on a
  `university.edu` domain, became `name@example.com`.
- Four token clone addresses in test files, with `ghp_test_token`,
  `created-token`, `glpat-test-token` or `gitea-test-token` before the `@`,
  moved to the allowed `x-access-token:token@github.com` form. This file is
  scanned too, so the record names the old forms without writing them as
  addresses.

The whole-tree Betterleaks run of the same day found 20 hits in tracked files:
2 rewritten, 18 allowed by exact text in `.betterleaks.toml` as the seven
fixtures the scanner section names.

## What this file does not do

- It does not clean history. `pnpm leak-scan:git` reports what every commit
  added without failing, because a secret or address it finds there was pushed
  and is public: revoke or rotate a secret first, then remove it from the tree.
- It does not scan the released app or the CI logs. Those are separate
  surfaces.
- It does not cover GitHub's push protection, which refuses a push carrying a
  known token pattern. That is a repository setting an administrator switches
  on, and the GitHub account split in `dev-config/docs/ai-safety.md` owns it.
- It does not replace the examination privacy filter in
  `packages/application/src/examination-workflows/privacy-policy`, which
  guards data sent to a model provider at runtime, not data committed here.
