import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { QueryObserver } from "@tanstack/react-query"
import {
  createRendererQueryClient,
  refreshSourceSnapshotHeadQueries,
} from "../analysis/analysis-query-client.js"
import {
  analysisQueryKeys,
  buildAnalysisQueryIdentity,
  buildBlameQueryIdentity,
} from "../analysis/analysis-query-keys.js"

const source = ["folder", "/courses"] as const
const repoPath = "/courses/repo-a"

function buildResultKey(snapshotCommitOid: string) {
  return analysisQueryKeys.result(
    buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid,
      config: {},
      rosterContext: undefined,
    }),
  )
}

describe("renderer analysis query cache", () => {
  it("refreshes active snapshot heads and removes inactive ones without dropping settled repo data", async () => {
    const queryClient = createRendererQueryClient()
    const analysis = buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid: "old-head",
      config: {},
      rosterContext: undefined,
    })
    const blame = buildBlameQueryIdentity({
      source,
      repoPath,
      analysis,
      config: {},
    })
    const snapshotKey = analysisQueryKeys.snapshotHead({
      source,
      repoPath,
      until: null,
    })
    const inactiveSnapshotKey = analysisQueryKeys.snapshotHead({
      source,
      repoPath: "/courses/repo-b",
      until: null,
    })
    const discoveryKey = analysisQueryKeys.discovery(source, "/courses", 5)
    const resultKey = analysisQueryKeys.result(analysis)
    const blameKey = analysisQueryKeys.blame(blame)
    let snapshotFetchCount = 0

    queryClient.setQueryData(snapshotKey, "old-head")
    queryClient.setQueryData(inactiveSnapshotKey, "inactive-head")
    queryClient.setQueryData(discoveryKey, { repos: [] })
    queryClient.setQueryData(resultKey, { result: true })
    queryClient.setQueryData(blameKey, { blame: true })
    const observer = new QueryObserver(queryClient, {
      queryKey: snapshotKey,
      queryFn: async () => {
        snapshotFetchCount++
        return "new-head"
      },
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
      await refreshSourceSnapshotHeadQueries(queryClient, source)

      assert.equal(queryClient.getQueryData(snapshotKey), "new-head")
      assert.equal(queryClient.getQueryData(inactiveSnapshotKey), undefined)
      assert.equal(snapshotFetchCount, 1)
      assert.deepEqual(queryClient.getQueryData(discoveryKey), { repos: [] })
      assert.deepEqual(queryClient.getQueryData(resultKey), { result: true })
      assert.deepEqual(queryClient.getQueryData(blameKey), { blame: true })
    } finally {
      unsubscribe()
    }
  })

  it("evicts oldest inactive analysis data over the size budget", () => {
    const queryClient = createRendererQueryClient({
      analysisDataCacheBudgetBytes: 300,
    })
    const firstKey = buildResultKey("first")
    const secondKey = buildResultKey("second")
    const firstData = { payload: "x".repeat(120) }
    const secondData = { payload: "y".repeat(120) }

    queryClient.setQueryData(firstKey, firstData, { updatedAt: 1 })
    queryClient.setQueryData(secondKey, secondData, { updatedAt: 2 })

    assert.equal(queryClient.getQueryData(firstKey), undefined)
    assert.deepEqual(queryClient.getQueryData(secondKey), secondData)
  })

  it("keeps active analysis data while evicting inactive entries", () => {
    const queryClient = createRendererQueryClient({
      analysisDataCacheBudgetBytes: 300,
    })
    const activeKey = buildResultKey("active")
    const inactiveKey = buildResultKey("inactive")
    const activeData = { payload: "a".repeat(120) }
    const inactiveData = { payload: "i".repeat(120) }
    const observer = new QueryObserver(queryClient, {
      queryKey: activeKey,
      queryFn: async () => activeData,
      enabled: false,
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
      queryClient.setQueryData(activeKey, activeData, { updatedAt: 1 })
      queryClient.setQueryData(inactiveKey, inactiveData, { updatedAt: 2 })

      assert.deepEqual(queryClient.getQueryData(activeKey), activeData)
      assert.equal(queryClient.getQueryData(inactiveKey), undefined)
    } finally {
      unsubscribe()
    }
  })
})
