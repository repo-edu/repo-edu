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
