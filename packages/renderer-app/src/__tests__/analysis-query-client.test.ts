import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { QueryObserver } from "@tanstack/react-query"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
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

function buildBlameKey(snapshotCommitOid: string) {
  return analysisQueryKeys.blame(
    buildBlameQueryIdentity({
      source,
      repoPath,
      analysis: buildAnalysisQueryIdentity({
        source,
        repoPath,
        snapshotCommitOid,
        config: {},
        rosterContext: undefined,
      }),
      config: {},
    }),
  )
}

function buildBlameData(lineCount: number) {
  return {
    fileBlames: [
      {
        path: "src/index.ts",
        lines: Array.from({ length: lineCount }, (_, index) => ({
          lineNumber: index + 1,
        })),
      },
    ],
  }
}

describe("renderer analysis query cache", () => {
  it("evicts oldest inactive blame results over the line budget", () => {
    const queryClient = createRendererQueryClient({
      retainedBlameLineBudget: 3,
    })
    const firstKey = buildBlameKey("first")
    const secondKey = buildBlameKey("second")
    const firstData = buildBlameData(2)
    const secondData = buildBlameData(2)

    queryClient.setQueryData(firstKey, firstData, { updatedAt: 1 })
    queryClient.setQueryData(secondKey, secondData, { updatedAt: 2 })

    assert.equal(queryClient.getQueryData(firstKey), undefined)
    assert.deepEqual(queryClient.getQueryData(secondKey), secondData)
  })

  it("never evicts analysis results", () => {
    const queryClient = createRendererQueryClient({
      retainedBlameLineBudget: 0,
    })
    const firstKey = buildResultKey("first")
    const secondKey = buildResultKey("second")

    queryClient.setQueryData(firstKey, { result: 1 }, { updatedAt: 1 })
    queryClient.setQueryData(secondKey, { result: 2 }, { updatedAt: 2 })

    assert.deepEqual(queryClient.getQueryData(firstKey), { result: 1 })
    assert.deepEqual(queryClient.getQueryData(secondKey), { result: 2 })
  })

  it("keeps observed blame results while evicting inactive entries", () => {
    const queryClient = createRendererQueryClient({
      retainedBlameLineBudget: 3,
    })
    const activeKey = buildBlameKey("active")
    const inactiveKey = buildBlameKey("inactive")
    const activeData = buildBlameData(2)
    const inactiveData = buildBlameData(2)
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
