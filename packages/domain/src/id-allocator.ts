import type { IdSequences } from "./types.js"

function formatId(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(4, "0")}`
}

export function allocateGroupId(sequences: IdSequences): {
  id: string
  sequences: IdSequences
} {
  const id = formatId("g_", sequences.nextGroupSeq)
  return {
    id,
    sequences: { ...sequences, nextGroupSeq: sequences.nextGroupSeq + 1 },
  }
}

export function allocateGroupSetId(sequences: IdSequences): {
  id: string
  sequences: IdSequences
} {
  const id = formatId("gs_", sequences.nextGroupSetSeq)
  return {
    id,
    sequences: {
      ...sequences,
      nextGroupSetSeq: sequences.nextGroupSetSeq + 1,
    },
  }
}

export function allocateMemberId(sequences: IdSequences): {
  id: string
  sequences: IdSequences
} {
  const id = formatId("m_", sequences.nextMemberSeq)
  return {
    id,
    sequences: { ...sequences, nextMemberSeq: sequences.nextMemberSeq + 1 },
  }
}

export function allocateAssignmentId(sequences: IdSequences): {
  id: string
  sequences: IdSequences
} {
  const id = formatId("a_", sequences.nextAssignmentSeq)
  return {
    id,
    sequences: {
      ...sequences,
      nextAssignmentSeq: sequences.nextAssignmentSeq + 1,
    },
  }
}

export function allocateGroupIds(
  sequences: IdSequences,
  count: number,
): { ids: string[]; sequences: IdSequences } {
  const ids: string[] = []
  let seq = sequences.nextGroupSeq
  for (let i = 0; i < count; i++) {
    ids.push(formatId("g_", seq))
    seq += 1
  }
  return { ids, sequences: { ...sequences, nextGroupSeq: seq } }
}

export function allocateMemberIds(
  sequences: IdSequences,
  count: number,
): { ids: string[]; sequences: IdSequences } {
  const ids: string[] = []
  let seq = sequences.nextMemberSeq
  for (let i = 0; i < count; i++) {
    ids.push(formatId("m_", seq))
    seq += 1
  }
  return { ids, sequences: { ...sequences, nextMemberSeq: seq } }
}
