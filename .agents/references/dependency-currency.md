# Dependency currency

Keep every resolved package current, including transitive dependencies. Renovate
uses `renovate.json` for routine updates.

## Renovate

Ordinary updates run throughout Saturday and Sunday. At most three branches can
be open, enough for the non-major batch and two other updates. Each branch reruns
CI whenever `main` advances. Pull requests have no separate concurrency or hourly
limit, so every failed branch becomes visible.

One branch batches all minor, patch, pin and digest updates, including those for
new dependencies. Renovate lands one branch per run. On a still `main` the batch
needs only one CI run and one landing, though one failing update holds the batch.
Each major update gets its own branch because it can break separately. Major
updates of the peer-coupled Anthropic and MCP SDKs share a branch so they move
in lockstep.

Renovate waits for new releases to mature so others encounter early bugs first.
It raises security fixes immediately. Every Sunday it refreshes the lockfile to
advance transitive packages within range. A refresh has no release date for
Renovate to check, so its maturity window is off for that job. pnpm's default
`minimumReleaseAge` still holds new transitive releases back. After CI passes on
a `renovate/**` branch, the update fast-forwards onto `main`. CI failure opens
a pull request.

Electron carries the runtime and stays outside the batch. Its patch and minor
updates run weekly after a short maturity window. Major updates run monthly.
CI must package and smoke-run the desktop app before these branches fast-forward.

## Changing dependencies

- For local or out-of-band catch-up, use `pnpm deps:latest`
  (`pnpm up -r --latest && pnpm dedupe`). It updates direct dependencies to
  latest and re-resolves transitives within range. Accept upstream lag when a
  current parent constrains a package to an older version. Never use
  `pnpm.overrides` to force it past that range.
- When adding, promoting or replacing a dependency, check the published version
  with `pnpm view <pkg> version`. Adopt current unless a concrete repo constraint
  requires a pin. Record the reason in the plan or commit body.
- The default pnpm catalog owns the version of a desktop runtime external shared
  by multiple workspace manifests. A new consumer uses the catalog version.
  Promote a package across the desktop runtime boundary separately from upgrading it.
- Apply the [release license policy](../../tools/release/CLAUDE.md) to the installed
  evidence. A new version alone must never require clarification or an approval-list
  edit. Tests cover that behaviour independently of any package's notice layout.
