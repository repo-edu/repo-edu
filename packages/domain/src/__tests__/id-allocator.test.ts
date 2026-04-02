import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  allocateAssignmentId,
  allocateGroupId,
  allocateGroupIds,
  allocateGroupSetId,
  allocateMemberId,
  allocateMemberIds,
} from "../id-allocator.js"
import { initialIdSequences } from "../types.js"

describe("allocateGroupId", () => {
  it("emits g_ prefixed ID with zero-padded sequence", () => {
    const result = allocateGroupId(initialIdSequences())
    assert.equal(result.id, "g_0001")
    assert.equal(result.sequences.nextGroupSeq, 2)
  })

  it("increments monotonically", () => {
    let seq = initialIdSequences()
    const first = allocateGroupId(seq)
    seq = first.sequences
    const second = allocateGroupId(seq)
    assert.equal(first.id, "g_0001")
    assert.equal(second.id, "g_0002")
    assert.equal(second.sequences.nextGroupSeq, 3)
  })

  it("does not affect other counters", () => {
    const result = allocateGroupId(initialIdSequences())
    assert.equal(result.sequences.nextGroupSetSeq, 1)
    assert.equal(result.sequences.nextMemberSeq, 1)
    assert.equal(result.sequences.nextAssignmentSeq, 1)
  })

  it("handles overflow past 4-digit padding", () => {
    const seq = {
      nextGroupSeq: 10000,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    }
    const result = allocateGroupId(seq)
    assert.equal(result.id, "g_10000")
  })
})

describe("allocateGroupSetId", () => {
  it("emits gs_ prefixed ID", () => {
    const result = allocateGroupSetId(initialIdSequences())
    assert.equal(result.id, "gs_0001")
    assert.equal(result.sequences.nextGroupSetSeq, 2)
  })

  it("does not affect other counters", () => {
    const result = allocateGroupSetId(initialIdSequences())
    assert.equal(result.sequences.nextGroupSeq, 1)
    assert.equal(result.sequences.nextMemberSeq, 1)
    assert.equal(result.sequences.nextAssignmentSeq, 1)
  })
})

describe("allocateMemberId", () => {
  it("emits m_ prefixed ID", () => {
    const result = allocateMemberId(initialIdSequences())
    assert.equal(result.id, "m_0001")
    assert.equal(result.sequences.nextMemberSeq, 2)
  })

  it("does not affect other counters", () => {
    const result = allocateMemberId(initialIdSequences())
    assert.equal(result.sequences.nextGroupSeq, 1)
    assert.equal(result.sequences.nextGroupSetSeq, 1)
    assert.equal(result.sequences.nextAssignmentSeq, 1)
  })
})

describe("allocateAssignmentId", () => {
  it("emits a_ prefixed ID", () => {
    const result = allocateAssignmentId(initialIdSequences())
    assert.equal(result.id, "a_0001")
    assert.equal(result.sequences.nextAssignmentSeq, 2)
  })

  it("does not affect other counters", () => {
    const result = allocateAssignmentId(initialIdSequences())
    assert.equal(result.sequences.nextGroupSeq, 1)
    assert.equal(result.sequences.nextGroupSetSeq, 1)
    assert.equal(result.sequences.nextMemberSeq, 1)
  })
})

describe("allocateGroupIds (bulk)", () => {
  it("returns contiguous block of IDs", () => {
    const result = allocateGroupIds(initialIdSequences(), 3)
    assert.deepStrictEqual(result.ids, ["g_0001", "g_0002", "g_0003"])
    assert.equal(result.sequences.nextGroupSeq, 4)
  })

  it("returns empty array for count 0", () => {
    const result = allocateGroupIds(initialIdSequences(), 0)
    assert.deepStrictEqual(result.ids, [])
    assert.equal(result.sequences.nextGroupSeq, 1)
  })

  it("continues from current sequence", () => {
    const seq = {
      nextGroupSeq: 5,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    }
    const result = allocateGroupIds(seq, 2)
    assert.deepStrictEqual(result.ids, ["g_0005", "g_0006"])
    assert.equal(result.sequences.nextGroupSeq, 7)
  })
})

describe("allocateMemberIds (bulk)", () => {
  it("returns contiguous block of IDs", () => {
    const result = allocateMemberIds(initialIdSequences(), 3)
    assert.deepStrictEqual(result.ids, ["m_0001", "m_0002", "m_0003"])
    assert.equal(result.sequences.nextMemberSeq, 4)
  })

  it("returns empty array for count 0", () => {
    const result = allocateMemberIds(initialIdSequences(), 0)
    assert.deepStrictEqual(result.ids, [])
    assert.equal(result.sequences.nextMemberSeq, 1)
  })
})

describe("counter monotonicity across entity types", () => {
  it("allocating different entity types does not interfere", () => {
    let seq = initialIdSequences()
    const g = allocateGroupId(seq)
    seq = g.sequences
    const gs = allocateGroupSetId(seq)
    seq = gs.sequences
    const m = allocateMemberId(seq)
    seq = m.sequences
    const a = allocateAssignmentId(seq)
    seq = a.sequences

    assert.equal(g.id, "g_0001")
    assert.equal(gs.id, "gs_0001")
    assert.equal(m.id, "m_0001")
    assert.equal(a.id, "a_0001")
    assert.equal(seq.nextGroupSeq, 2)
    assert.equal(seq.nextGroupSetSeq, 2)
    assert.equal(seq.nextMemberSeq, 2)
    assert.equal(seq.nextAssignmentSeq, 2)
  })
})
