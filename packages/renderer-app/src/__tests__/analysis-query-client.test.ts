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
  it("clears observed snapshot heads without fetching and removes inactive ones", async () => {
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
      enabled: false,
      queryFn: async () => {
        snapshotFetchCount++
        return "new-head"
      },
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
      await refreshSourceSnapshotHeadQueries(queryClient, source)

      assert.equal(queryClient.getQueryData(snapshotKey), undefined)
      assert.equal(observer.getCurrentResult().data, undefined)
      assert.equal(queryClient.getQueryData(inactiveSnapshotKey), undefined)
      assert.equal(snapshotFetchCount, 0)
      assert.deepEqual(queryClient.getQueryData(discoveryKey), { repos: [] })
      assert.deepEqual(queryClient.getQueryData(resultKey), { result: true })
      assert.deepEqual(queryClient.getQueryData(blameKey), { blame: true })
    } finally {
      unsubscribe()
    }
  })

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
