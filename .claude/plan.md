# Fix repo.clone: auth token leakage and sequential cloning

## Problem 1: Auth token persisted in `.git/config`

All three provider adapters embed the API token directly in the clone URL
(`https://token:SECRET@host/org/repo.git`). `git clone` stores this URL as
the `origin` remote in `.git/config`, leaving the token in plaintext on disk.

### Fix — init + pull (repobee's approach), then set a clean remote

Replace the single `git clone <auth-url> <path>` with three git commands per repo:

1. `git init <path>`
2. `git pull <auth-url>` (cwd: `<path>`) — fetches content without writing the
   URL to any config
3. `git remote add origin <clean-url>` (cwd: `<path>`) — sets a token-free
   remote so `git pull` still works for future manual use

This requires the clone URL to be split into an **auth URL** (for the pull)
and a **clean URL** (for the remote). The clean URL is simply the clone URL
with credentials stripped.

**Changes:**

- `packages/application/src/index.ts` — replace the `git clone` call in the
  `repo.clone` handler with the init→pull→remote-add sequence.
- No port/contract changes needed — `GitCommandPort.run` already accepts
  `args`, `cwd`, `env`.

## Problem 2: Sequential cloning

The current loop `for (const target of cloneTargets)` awaits each clone
serially. For a class of 30 students × 3 assignments = 90 repos, this is
unnecessarily slow.

### Fix — bounded-concurrency helper

Add a small `mapConcurrent(items, fn, limit)` utility (inline in the handler
or as a local function) that runs up to N clones in parallel using a pool
pattern. Default concurrency of 8 is reasonable for git operations hitting a
single host.

**Changes:**

- `packages/application/src/index.ts` — extract the per-repo clone logic into
  a helper function, then run it through a concurrency-limited map instead of
  a sequential `for` loop.

## Scope of changes

| File | What changes |
|------|-------------|
| `packages/application/src/index.ts` | Clone loop rewritten: init+pull+remote-add, concurrency pool |

No contract, port, adapter, or test-infra changes are required.

## Testing

Existing `validation.test.ts` coverage for `repo.clone` uses a mock
`gitCommand` port — the mock records `args` passed to `run()`. Update the
assertions to expect the new three-command sequence instead of a single `clone`
call.
