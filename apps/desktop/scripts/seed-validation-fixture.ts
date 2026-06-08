#!/usr/bin/env tsx

import { seedDesktopFixtureFromEnvironment } from "../src/fixture-seed"

const [storageRoot, fixtureSelector] = process.argv.slice(2)

if (!storageRoot || !fixtureSelector) {
  throw new Error(
    "Usage: tsx scripts/seed-validation-fixture.ts <storage-root> <fixture-selector>",
  )
}

const seededFixture = await seedDesktopFixtureFromEnvironment(storageRoot, {
  REPO_EDU_FIXTURE: fixtureSelector,
})

if (!seededFixture) {
  throw new Error("Fixture selector did not produce a seeded fixture.")
}

process.stdout.write(`${JSON.stringify(seededFixture)}\n`)
