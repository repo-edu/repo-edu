import { validatePersistedCourse } from "@repo-edu/domain/schemas"
import {
  hasBlockingIssues,
  isBlockingValidationKind,
  validateAssignment,
  validateRoster,
} from "@repo-edu/domain/validation"
import { fixturePresets, fixtureTiers } from "./fixture-defs.js"
import type { FixtureMatrix, FixtureRecord } from "./fixtures.js"
import { fixtureTierCounts } from "./generator-lib.js"

function fail(message: string): never {
  throw new Error(`[fixture] ${message}`)
}

function assertUnique(values: readonly string[], description: string): void {
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.push(value)
      continue
    }
    seen.add(value)
  }

  if (duplicates.length > 0) {
    fail(`Duplicate ${description}: ${duplicates.slice(0, 5).join(", ")}`)
  }
}

function validateFixtureReferences(
  fixture: FixtureRecord,
  memberIds: ReadonlySet<string>,
  groupIds: ReadonlySet<string>,
  groupSetIds: ReadonlySet<string>,
  tier: string,
  preset: string,
): void {
  const course = fixture.course

  for (const group of course.roster.groups) {
    for (const memberId of group.memberIds) {
      if (!memberIds.has(memberId)) {
        fail(
          `${tier}/${preset}: group '${group.id}' references missing member '${memberId}'`,
        )
      }
    }
  }

  for (const groupSet of course.roster.groupSets) {
    for (const groupId of groupSet.groupIds) {
      if (!groupIds.has(groupId)) {
        fail(
          `${tier}/${preset}: group set '${groupSet.id}' references missing group '${groupId}'`,
        )
      }
    }
  }

  for (const assignment of course.roster.assignments) {
    if (!groupSetIds.has(assignment.groupSetId)) {
      fail(
        `${tier}/${preset}: assignment '${assignment.id}' references missing group set '${assignment.groupSetId}'`,
      )
    }
  }
}

function formatIssueKinds(kinds: readonly string[]): string {
  return kinds.slice(0, 8).join(", ")
}

export function validateFixtureMatrix(matrix: FixtureMatrix): void {
  for (const tier of fixtureTiers) {
    for (const preset of fixturePresets) {
      const fixture = matrix[tier][preset]
      if (!fixture) {
        fail(`Missing fixture entry for ${tier}/${preset}`)
      }

      const expectedCounts = fixtureTierCounts[tier]
      const course = fixture.course
      const settings = fixture.settings

      if (course.roster.students.length !== expectedCounts.students) {
        fail(
          `${tier}/${preset}: expected ${expectedCounts.students} students, got ${course.roster.students.length}`,
        )
      }

      if (course.roster.staff.length !== expectedCounts.staff) {
        fail(
          `${tier}/${preset}: expected ${expectedCounts.staff} staff, got ${course.roster.staff.length}`,
        )
      }

      if (settings.activeCourseId !== course.id) {
        fail(
          `${tier}/${preset}: activeCourseId '${settings.activeCourseId}' must match course id '${course.id}'`,
        )
      }

      const profileValidation = validatePersistedCourse(course)
      if (!profileValidation.ok) {
        fail(
          `${tier}/${preset}: course schema invalid: ${profileValidation.issues
            .slice(0, 3)
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join(" | ")}`,
        )
      }

      const memberIds = course.roster.students
        .concat(course.roster.staff)
        .map((member) => member.id)
      const memberEmails = course.roster.students
        .concat(course.roster.staff)
        .map((member) => member.email.trim().toLowerCase())
      const groupIds = course.roster.groups.map((group) => group.id)
      const groupSetIds = course.roster.groupSets.map((groupSet) => groupSet.id)

      assertUnique(memberIds, `${tier}/${preset} member ids`)
      assertUnique(memberEmails, `${tier}/${preset} member emails`)
      assertUnique(groupIds, `${tier}/${preset} group ids`)
      assertUnique(groupSetIds, `${tier}/${preset} group set ids`)

      validateFixtureReferences(
        fixture,
        new Set(memberIds),
        new Set(groupIds),
        new Set(groupSetIds),
        tier,
        preset,
      )

      const rosterValidation = validateRoster(course.roster)
      if (hasBlockingIssues(rosterValidation)) {
        const blockingKinds = rosterValidation.issues
          .filter((issue) => isBlockingValidationKind(issue.kind))
          .map((issue) => issue.kind)
        fail(
          `${tier}/${preset}: blocking roster issues: ${formatIssueKinds(blockingKinds)}`,
        )
      }

      for (const assignment of course.roster.assignments) {
        const assignmentValidation = validateAssignment(
          course.roster,
          assignment.id,
          "username",
        )
        if (hasBlockingIssues(assignmentValidation)) {
          const blockingKinds = assignmentValidation.issues
            .filter((issue) => isBlockingValidationKind(issue.kind))
            .map((issue) => issue.kind)
          fail(
            `${tier}/${preset}: assignment '${assignment.id}' has blocking issues: ${formatIssueKinds(
              blockingKinds,
            )}`,
          )
        }
      }

      if (fixture.artifacts.length === 0) {
        fail(`${tier}/${preset}: expected seeded artifacts`)
      }
    }
  }
}
