export type EnvOverride = {
  envOverrides: Record<string, string>
  unsetVars: string[]
}

export function applyEnvOverrides(resolved: EnvOverride): {
  restore: () => void
} {
  const previous = new Map<string, string | undefined>()
  for (const key of [
    ...Object.keys(resolved.envOverrides),
    ...resolved.unsetVars,
  ]) {
    if (!previous.has(key)) previous.set(key, process.env[key])
  }
  for (const key of resolved.unsetVars) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(resolved.envOverrides)) {
    process.env[key] = value
  }
  return {
    restore() {
      for (const [key, value] of previous) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    },
  }
}
