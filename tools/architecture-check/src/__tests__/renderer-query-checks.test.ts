import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { checkRendererQuerySource } from "../renderer-query-checks.js"

const file = "packages/renderer-app/src/analysis/example.ts"
const imports = `
import { useQuery as watch, useQueries, useMutation, useQueryClient, QueryClient, QueryObserver, MutationObserver, skipToken } from "@tanstack/react-query"
import type { SessionOperationGateway, SessionOperationScope } from "../session/session-operations.js"
import { scopedSessionQueryOptions as scoped } from "../session/session-query.js"
import { useWorkflowClient } from "../contexts/workflow-client.js"
const cache = useQueryClient()
const operations = useWorkflowClient()
`
const check = (body: string) => checkRendererQuerySource(file, imports + body)

describe("Query body ownership", () => {
  for (const body of [
    'watch({ queryKey: ["rows"] })',
    "watch({ enabled: true })",
    "watch({ enabled: false, ...options })",
    "const observer = new QueryObserver(cache, { enabled: true })",
    "const observer = watch({ enabled: false }); observer.refetch()",
    "const observer = new QueryObserver(cache, { enabled: false }); observer.setOptions({ enabled: true })",
    "useQueries({ queries: [{ enabled: false }, { enabled: true }] })",
    "cache.fetchQuery(options)",
    'const alias = cache; alias["fetchQuery"](options)',
    "const { fetchQuery: fetch } = cache; fetch(options)",
    'cache.invalidateQueries({ queryKey: ["rows"] })',
    "const mutation = useMutation({ mutationFn: work }); mutation.mutateAsync(input)",
    "const mutation = useMutation({ mutationFn: work }); const { mutateAsync: start } = mutation; start(input)",
    'operations.execute("analysis.run", async (scope) => { cache.fetchQuery({ ...scoped(scope, signal, fetch) }) })',
    'operations.execute("analysis.run", async (scope) => { await cache.fetchQuery({}) })',
    'operations.execute("analysis.run", async (scope) => {}).then(() => cache.fetchQuery(options))',
    'const mutation = useMutation({ mutationFn: work }); operations.execute("repo.bulkClone", async (scope) => { mutation.mutate(input) })',
  ]) {
    it(`rejects a start without its body: ${body}`, () => {
      assert.ok(check(body).length > 0)
    })
  }

  for (const body of [
    "watch({ ...policy, enabled: false, queryFn: skipToken })",
    "useQueries({ queries: [{ enabled: false }, { enabled: false }] })",
    "const observer = new QueryObserver(cache, { enabled: false })",
    'cache.invalidateQueries({ queryKey: ["rows"], refetchType: "none" })',
    'operations.execute("analysis.run", async (scope) => { await cache.fetchQuery({ ...scoped(scope, signal, fetch) }) })',
    'const reservation = operations.reserve("analysis.run"); reservation.run(async (scope) => { await cache.fetchQuery({ ...scoped(scope, signal, fetch) }) })',
    "async function fetchRepo(scope: SessionOperationScope, cache: QueryClient) { return await cache.fetchQuery({ ...scoped(scope, signal, fetch) }) }",
    'class Runner { constructor(private operations: SessionOperationGateway, private cache: QueryClient) {} run() { return this.operations.execute("analysis.run", async (scope) => { return await this.cache.fetchQuery({ ...scoped(scope, signal, fetch) }) }) } }',
    'const mutation = useMutation({ mutationFn: work }); operations.execute("repo.bulkClone", async (scope) => { await mutation.mutateAsync(input); scope.publish(apply) })',
    'operations.execute("repo.bulkClone", async (scope) => { const mutation = new MutationObserver(cache, { mutationFn: work }); await mutation.mutate(input); scope.publish(apply) })',
    'const mutate = "mutateAsync"; const unrelated = { mutationFn: 1 }; function mutateAsync() {} mutateAsync()',
  ]) {
    it(`admits an owned start or a watcher: ${body}`, () => {
      assert.deepEqual(check(body), [])
    })
  }

  it("requires the scoped helper for query functions", () => {
    const violations = check("const options = { queryFn: () => work() }")
    assert.match(violations[0]?.message ?? "", /scopedSessionQueryOptions/)
  })

  it("resolves namespace imports", () => {
    assert.equal(
      checkRendererQuerySource(
        file,
        `
      import * as Query from "@tanstack/react-query"
      Query.useQuery({ enabled: true })
    `,
      ).length,
      1,
    )
  })
})
