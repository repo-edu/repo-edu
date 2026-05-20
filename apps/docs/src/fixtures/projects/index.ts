import type { GeneratedRepoSlot } from "../analysis-git-fixture-types.js"
import { recordedAtForSlots } from "../recorded-repo-slots.js"
import * as calculator from "./calculator/index.js"
import * as huffmanEncoder from "./huffman-encoder/index.js"
import * as topologicalTaskScheduler from "./topological-task-scheduler/index.js"

export const fixtureProjects = [
  calculator,
  topologicalTaskScheduler,
  huffmanEncoder,
]
export const allGeneratedRepoSlots = fixtureProjects.flatMap(
  (project) => project.generatedRepoSlots,
) satisfies GeneratedRepoSlot[]
export const recordedAt = recordedAtForSlots(allGeneratedRepoSlots)
