import type {
  PersistedAppSettings,
  PersistedCourse,
} from "@repo-edu/domain/types"
import {
  defaultFixtureSelection,
  type FixtureSelection,
  getFixture,
} from "@repo-edu/test-fixtures"

export function getCourseScenario(
  selection: FixtureSelection = defaultFixtureSelection,
  overrides?: Partial<PersistedCourse>,
): PersistedCourse {
  const base = structuredClone(getFixture(selection).course)
  return overrides ? Object.assign(base, overrides) : base
}

export function getSettingsScenario(
  selection: FixtureSelection = defaultFixtureSelection,
  overrides?: Partial<PersistedAppSettings>,
): PersistedAppSettings {
  const base = structuredClone(getFixture(selection).settings)
  return overrides ? Object.assign(base, overrides) : base
}

export function getCourseAndSettingsScenario(
  selection: FixtureSelection = defaultFixtureSelection,
  customize?: (scenarios: {
    course: PersistedCourse
    settings: PersistedAppSettings
  }) => void,
): { course: PersistedCourse; settings: PersistedAppSettings } {
  const fixture = getFixture(selection)
  const course = structuredClone(fixture.course)
  const settings = structuredClone(fixture.settings)
  customize?.({ course, settings })
  return { course, settings }
}
