export const fixtureTiers = ["small", "medium", "stress"] as const
export const fixturePresets = [
  "shared-teams",
  "assignment-scoped",
  "repobee-teams",
] as const

export type FixtureTier = (typeof fixtureTiers)[number]
export type FixturePreset = (typeof fixturePresets)[number]

export type FixtureSelection = {
  tier: FixtureTier
  preset: FixturePreset
}

export const defaultFixtureSelection: FixtureSelection = {
  tier: "medium",
  preset: "shared-teams",
}

export function isFixtureTier(
  candidate: string | null | undefined,
): candidate is FixtureTier {
  return (
    candidate !== null &&
    candidate !== undefined &&
    (fixtureTiers as readonly string[]).includes(candidate)
  )
}

export function isFixturePreset(
  candidate: string | null | undefined,
): candidate is FixturePreset {
  return (
    candidate !== null &&
    candidate !== undefined &&
    (fixturePresets as readonly string[]).includes(candidate)
  )
}
