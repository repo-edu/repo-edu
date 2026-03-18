import type { LmsProviderKind } from "@repo-edu/domain"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { LmsClient } from "@repo-edu/integrations-lms-contract"
import { packageId as contractPackageId } from "@repo-edu/integrations-lms-contract"
import { createCanvasClient } from "./canvas/index.js"
import { createMoodleClient } from "./moodle/index.js"

export const packageId = "@repo-edu/integrations-lms"
export const workspaceDependencies = [contractPackageId] as const

export { createCanvasClient } from "./canvas/index.js"
export { createMoodleClient } from "./moodle/index.js"

export function createLmsClient(
  provider: LmsProviderKind,
  http: HttpPort,
): LmsClient {
  switch (provider) {
    case "canvas":
      return createCanvasClient(http)
    case "moodle":
      return createMoodleClient(http)
  }
}

export function createLmsProviderDispatch(http: HttpPort): LmsClient {
  const clients = new Map<LmsProviderKind, LmsClient>()

  const resolveClient = (provider: LmsProviderKind): LmsClient => {
    const existing = clients.get(provider)
    if (existing) {
      return existing
    }

    const next = createLmsClient(provider, http)
    clients.set(provider, next)
    return next
  }

  return {
    verifyConnection(draft, signal) {
      return resolveClient(draft.provider).verifyConnection(draft, signal)
    },
    listCourses(draft, signal) {
      return resolveClient(draft.provider).listCourses(draft, signal)
    },
    fetchRoster(draft, courseId, signal, onProgress) {
      return resolveClient(draft.provider).fetchRoster(
        draft,
        courseId,
        signal,
        onProgress,
      )
    },
    listGroupSets(draft, courseId, signal) {
      return resolveClient(draft.provider).listGroupSets(
        draft,
        courseId,
        signal,
      )
    },
    fetchGroupSet(draft, courseId, groupSetId, signal, onProgress) {
      return resolveClient(draft.provider).fetchGroupSet(
        draft,
        courseId,
        groupSetId,
        signal,
        onProgress,
      )
    },
  }
}
