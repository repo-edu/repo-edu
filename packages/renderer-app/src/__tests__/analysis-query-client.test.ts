import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { QueryObserver } from "@tanstack/react-query"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import {
  analysisQueryKeys,
  buildAnalysisQueryIdentity,
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
