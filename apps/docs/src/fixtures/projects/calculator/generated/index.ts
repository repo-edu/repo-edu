import type { GeneratedRepoSlot } from "../../../analysis-git-fixture-types.js"
import { recordedAtForSlots } from "../../../recorded-repo-slots.js"
import { calculatorSlot_team_01 } from "./team-01.fixture.js"
import { calculatorSlot_team_02 } from "./team-02.fixture.js"
import { calculatorSlot_team_03 } from "./team-03.fixture.js"

export const projectId = "calculator"
export const generatedRepoSlots = [
  calculatorSlot_team_01,
  calculatorSlot_team_02,
  calculatorSlot_team_03,
] satisfies GeneratedRepoSlot[]
export const recordedAt = recordedAtForSlots(generatedRepoSlots)
