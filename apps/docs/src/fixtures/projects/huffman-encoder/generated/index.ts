import type { GeneratedRepoSlot } from "../../../analysis-git-fixture-types.js"
import { recordedAtForSlots } from "../../../recorded-repo-slots.js"
import { huffman_encoderSlot_team_01 } from "./team-01.fixture.js"
import { huffman_encoderSlot_team_02 } from "./team-02.fixture.js"
import { huffman_encoderSlot_team_03 } from "./team-03.fixture.js"

export const projectId = "huffman-encoder"
export const generatedRepoSlots = [
  huffman_encoderSlot_team_01,
  huffman_encoderSlot_team_02,
  huffman_encoderSlot_team_03,
] satisfies GeneratedRepoSlot[]
export const recordedAt = recordedAtForSlots(generatedRepoSlots)
