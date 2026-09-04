# Leak scan

This repository is public. A commit is public the moment it is pushed, and a later revert does not
unpublish it. So the check runs before the commit, not after the push. Two parts: `pnpm leak-scan`,
run by a git hook on every commit, and a server-side net on GitHub.

An accidental paste is the likely leak, not a deliberate one, so every part fires without anyone
remembering to run it. The account names `aivm`, `dvbeek` and `davbeek` are publishable and are not
leaks. The author email `d.a.v.beek@tue.nl` is on every commit already and is not a leak. There is
no reading step for names of real people: no scan finds a name.

## What counts as a leak

- A credential value: a token, a key, a password, a signed URL.
- Data about a real person: a student or teacher name, a student number, a real email address, a
  roster, an export from the learning system.
- Pasted output that carries either of the above: a log, an HTTP header, a shell transcript, a
  settings dump.

Test fixtures use invented people and reserved domains. An invented email uses a domain under
`example.com`, `example.org` or `example.net`, such as `alice@uni.example.com` and
`alice@personal.example.com`, or any domain ending in `.test`, `.invalid` or `.local`. Names under
the example domains keep a distinction a test needs, such as a university address against a
personal one.

## Part 1: `pnpm leak-scan` on every commit

Three commands share two scans, a credential scan by Betterleaks and an email scan, and each runs
both over its own scope:

| Command              | Scope                 | Credentials              | Emails                | Exit on a hit |
| -------------------- | --------------------- | ------------------------ | --------------------- | ------------- |
| `pnpm leak-scan`     | the staged commit     | the staged diff          | the whole staged tree | 1, the gate   |
| `pnpm leak-scan:all` | the whole staged tree | the exported staged tree | the whole staged tree | 1             |
| `pnpm leak-scan:git` | every commit          | the history              | every added line      | 0, a report   |

The scripts live under `scripts/`, one per command, beside the other root shell scripts, and
`scripts/leak-scan-patterns.sh` holds the email pattern and its allow list once for all three.

A git pre-commit hook runs `pnpm leak-scan` on every commit from every client: the shell, GitKraken
and any editor. A hit stops the commit: fix the file, stage it, commit again. Do not skip the hook,
with `git commit -n`, `HUSKY=0` or GitKraken's skip-hooks option: a hit that is judged by eye is a
hit nobody checked. Each scan prints each hit as file, line and text.

The credential scan of the hook is Betterleaks over the staged changes, with its default rule set.
The email scan reads the staged copy of every tracked file, through `git grep --cached`, and
prints every email address that is not on the allow list. It reads the whole tree rather than the
touched files, so the tree stays clean on every commit. `git grep` always prints the file path, so
the two path allowances below match on it. The allow list is:

- The author and the project mailbox `opensource@repo-edu.dev`.
- The reserved fixture domains from the section above, `.local` included because the Gitea and
  GitLab integration fixtures use it. Each allowance is tied to the `@` of the address, never
  matched against the file path, so a file named `something.test.ts` gets no allowance from its
  name.
- Third-party licence texts under a `licenses/` folder, whose copyright lines belong to their
  authors. Matched on the file path.
- `pnpm-lock.yaml`, which only pnpm writes and which carries upstream package text. Matched on the
  file path.
- The fixture clone URL `x-access-token:token@github.com`, with an optional `-1` on the token,
  which the repository test harness uses.

The allow list grows only for a line that is not a person and cannot be rewritten. A placeholder
or a fixture is rewritten instead.

`leak-scan:all` exports the staged tree with `git archive` into a temporary folder and scans that
folder, because Betterleaks has no tracked-tree mode of its own: `dir` walks the file system,
`.gitignore` unread, and `git` reads commit diffs. Passing the tracked files one by one is slow,
because each command-line path is a scan source of its own; one exported folder scans in well
under a second. `leak-scan:git` prefixes every added line in `git log -p` with its file path, so
the same allow list applies, and reports each address with the number of lines it was added on.

### The scanner

The credential scanner is Betterleaks, MIT licensed. Homebrew installs the current release and
nothing pins it. It is the successor to gitleaks from the same author: the gitleaks README states
that gitleaks is feature complete and will only receive security patches, so new token shapes land
in Betterleaks alone. The two commands the scan needs are the same in both,
`git --pre-commit --staged` for the staged diff and `dir` for a folder, and both find a config file
at the scanned path on their own.

A hit is rewritten so it no longer looks like a secret. Only a fixture that must keep its secret
shape is allowed, by its exact text in `.betterleaks.toml` at the repository root:

```toml
[extend]
useDefault = true

[[allowlists]]
regexTarget = "match"
regexes = ['''<the exact fixture text>''']
```

Betterleaks accepts this gitleaks-style block for compatibility and adds it to the default rules.
Do not use a top-level `filter` expression for this: a `filter` in this file replaces the default
rule set's own filter, which drops the false-positive protection that ships with the scanner. Allow
by text, never by path: a path allowance turns every test folder into a place where a real secret
passes. The match text starts where the rule's pattern starts, so a `generic-password` allowance
begins at the bare `PASSWORD` key, not at a longer variable name in front of it.

The allowed fixtures today are the harness clone URL above, the PEM block the examination privacy
filter test must detect, the Gitea and GitLab harness account passwords for the local Docker
instances and the signing test value whose redaction a test asserts.

### The hook

Husky installs the hook. Three pieces, all at the repository root:

1. `husky` as a development dependency in `package.json`.
2. A `prepare` script in `package.json` with the value `husky`. pnpm runs `prepare` after every
   `pnpm install`, and the `husky` command points git's `core.hooksPath` at the tracked `.husky/`
   folder.
3. The tracked file `.husky/pre-commit` with the one line `pnpm leak-scan`.

The hook is why part 1 needs no sentence in any workflow file. A sentence fires only when a session
follows it, and commits through GitKraken never read it. Husky is chosen because `pnpm install`
installs the hook on every clone with no extra step. Lefthook does the same with a parallel runner
this repository has no use for. A plain hooks folder with `core.hooksPath` set by hand needs one
command per clone that someone must remember.

### Setup, once

On each development machine, in this order. Developer tools run on macOS and Linux only.

1. Install the scanner:

   ```bash
   brew install betterleaks
   ```

2. Run `pnpm install`, which installs the hook.
3. On macOS, GitKraken and other desktop apps do not see the shell PATH, so a hook they start
   cannot find `pnpm` or `betterleaks`. Husky reads `~/.config/husky/init.sh` before every hook.
   Put the folders that hold the two commands there once. Betterleaks from Homebrew lives in
   `/opt/homebrew/bin`; a standalone pnpm lives in `~/Library/pnpm`:

   ```sh
   export PATH="/opt/homebrew/bin:$HOME/Library/pnpm:$PATH"
   ```

Then run `pnpm leak-scan:all` once, because the credential scan of the hook only sees the changes
a commit stages.

## Part 2: push protection on GitHub

GitHub can refuse a push that carries a known token pattern. It runs on every push, needs nothing
on any machine and is switched on once by an account with administrator rights on the repository:

1. Open the repository's Settings tab.
2. Under Security and quality, open Advanced Security.
3. Press Enable next to Secret Protection.
4. Press Enable next to Push protection.

A blocked push shows GitHub's message in the git client. Anyone with Write access can push anyway
by typing a bypass reason, which leaves an alert and an audit entry. Do not bypass: remove the
secret from the commit and push again.

Push protection knows token patterns only. It does not see emails, names or pasted output. Those
rest on part 1 and on the person writing the commit.

## What this file does not do

- It does not clean history. `pnpm leak-scan:git` reports what every commit added without failing,
  because a secret or address it finds there was pushed and is public: revoke or rotate a secret
  first, then remove it from the tree.
- It does not scan the released app or the CI logs. Those are separate surfaces.
- It does not replace the examination privacy filter in
  `packages/application/src/examination-workflows/privacy-policy`, which guards data sent to a
  model provider at runtime, not data committed here.
