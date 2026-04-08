import type {
  GitAuthorIdentity,
  MergedPerson,
  MergeEvidence,
  PersonAlias,
  PersonMergeResult,
} from "./types.js"

// ---------------------------------------------------------------------------
// Normalization (analysis-local, not reusing roster normalization to keep
// analysis domain self-contained)
// ---------------------------------------------------------------------------

function normalizeNameForMerge(name: string): string {
  return name.trim().split(/\s+/).join(" ").toLowerCase()
}

function normalizeEmailForMerge(email: string): string {
  return email.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Union-find
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: number[]
  private rank: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i)
    this.rank = new Array(size).fill(0)
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }

  union(a: number, b: number): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA
    } else {
      this.parent[rootB] = rootA
      this.rank[rootA]++
    }
  }
}

// ---------------------------------------------------------------------------
// Canonical identity selection
// ---------------------------------------------------------------------------

function selectCanonical(
  identities: GitAuthorIdentity[],
  commitCounts: Map<string, number>,
): GitAuthorIdentity {
  let best = identities[0]
  let bestCount = 0

  for (const identity of identities) {
    const key = identityKey(identity)
    const count = commitCounts.get(key) ?? 0
    if (
      count > bestCount ||
      (count === bestCount &&
        normalizeEmailForMerge(identity.email) <
          normalizeEmailForMerge(best.email))
    ) {
      best = identity
      bestCount = count
    }
  }

  return best
}

function identityKey(identity: GitAuthorIdentity): string {
  return `${normalizeEmailForMerge(identity.email)}\0${normalizeNameForMerge(identity.name)}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mergePersonIdentities(
  identities: GitAuthorIdentity[],
  commitCounts?: Map<string, number>,
): PersonMergeResult {
  if (identities.length === 0) {
    return { persons: [] }
  }

  const counts = commitCounts ?? new Map<string, number>()
  const uf = new UnionFind(identities.length)

  const emailIndex = new Map<string, number>()
  const nameIndex = new Map<string, number>()
  const evidenceMap = new Map<string, Set<MergeEvidence>>()

  function addEvidence(a: number, b: number, evidence: MergeEvidence) {
    const rootA = uf.find(a)
    const rootB = uf.find(b)
    if (rootA === rootB) return
    const pairKey = [Math.min(a, b), Math.max(a, b)].join(",")
    const existing = evidenceMap.get(pairKey)
    if (existing) {
      existing.add(evidence)
    } else {
      evidenceMap.set(pairKey, new Set([evidence]))
    }
  }

  for (let i = 0; i < identities.length; i++) {
    const identity = identities[i]
    const normEmail = normalizeEmailForMerge(identity.email)
    const normName = normalizeNameForMerge(identity.name)

    if (normEmail.length > 0) {
      const existing = emailIndex.get(normEmail)
      if (existing !== undefined) {
        addEvidence(i, existing, "email-link")
        uf.union(i, existing)
      } else {
        emailIndex.set(normEmail, i)
      }
    }

    if (normName.length > 0) {
      const existing = nameIndex.get(normName)
      if (existing !== undefined) {
        addEvidence(i, existing, "name-only")
        uf.union(i, existing)
      } else {
        nameIndex.set(normName, i)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < identities.length; i++) {
    const root = uf.find(i)
    const group = groups.get(root)
    if (group) {
      group.push(i)
    } else {
      groups.set(root, [i])
    }
  }

  const sortedRoots = [...groups.keys()].sort((a, b) => a - b)
  const persons: MergedPerson[] = []

  for (const root of sortedRoots) {
    const memberIndices = groups.get(root) ?? []
    const memberIdentities = memberIndices.map((i) => identities[i])
    const canonical = selectCanonical(memberIdentities, counts)

    const allEvidence = new Set<MergeEvidence>()
    for (const [pairKey, evidenceSet] of evidenceMap) {
      const [a, _b] = pairKey.split(",").map(Number)
      if (uf.find(a) === root) {
        for (const e of evidenceSet) allEvidence.add(e)
      }
    }

    const aliases: PersonAlias[] = memberIdentities
      .filter((id) => identityKey(id) !== identityKey(canonical))
      .map((id) => ({
        name: id.name,
        email: id.email,
        evidence: allEvidence.has("email-link")
          ? ("email-link" as const)
          : ("name-only" as const),
      }))

    let totalCommits = 0
    for (const id of memberIdentities) {
      totalCommits += counts.get(identityKey(id)) ?? 0
    }

    persons.push({
      id: `p_${String(persons.length).padStart(4, "0")}`,
      canonicalName: canonical.name,
      canonicalEmail: canonical.email,
      aliases,
      commitCount: totalCommits,
      evidence: [...allEvidence],
    })
  }

  return { persons }
}
