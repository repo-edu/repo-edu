import type { GeneratedRepoSlot } from "../../../analysis-git-fixture-types.js"
import { recordedAtForSlots } from "../../../recorded-repo-slots.js"

export const projectId = "topological-task-scheduler"
export const generatedRepoSlots = [] satisfies GeneratedRepoSlot[]
export const recordedAt = recordedAtForSlots(generatedRepoSlots)
