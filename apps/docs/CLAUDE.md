# CLAUDE.md

This is the static Astro/Starlight documentation site (`@repo-edu/docs`).

## Purpose

`apps/docs` publishes product, user and developer documentation. It does not
host application code or depend on application workspace packages.

## Structure

- `src/content/docs/*`: Starlight documentation content; `astro.config.mjs` configures the site.
- `src/components/*`: Astro-only presentation components used by documentation pages.
- `src/styles/custom.css`: Starlight theme and documentation layout styles.

## Rules

- Keep this package structurally static: no application runtime, React host,
  simulated host, recorded application data or application-workspace dependencies.
- Repository-wide source, export and test-runner rules belong to
  `tools/architecture-check`, not this package.
