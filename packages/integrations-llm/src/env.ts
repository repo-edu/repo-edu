// Shared helper that temporarily mutates `process.env` so an SDK call inherits
// adapter-resolved values, then restores the previous state in `finally`. The
// Claude and Codex adapters both rely on this to switch API/subscription auth
// modes without leaking env edits across calls.

export type EnvOverrides = {
  envOverrides: Record<string, string>
  unsetVars: string[]
}

export type EnvOverrideHandle = {
  restore: () => void
}

export function applyEnvOverrides(overrides: EnvOverrides): EnvOverrideHandle {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(overrides.envOverrides)) {
    previous[key] = process.env[key]
    process.env[key] = overrides.envOverrides[key]
  }
  for (const key of overrides.unsetVars) {
    previous[key] = process.env[key]
    delete process.env[key]
  }
  return {
    restore: () => {
      for (const key of Object.keys(previous)) {
        const prior = previous[key]
        if (prior === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = prior
        }
      }
    },
  }
}
