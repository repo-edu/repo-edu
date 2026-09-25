import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { checkRendererStartSources } from "../renderer-start-checks.js"

const file = "packages/renderer-app/src/components/Example.tsx"
const imports = `
import React, { useEffect as effect, useLayoutEffect, useInsertionEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useQuery as watch, useQueries, QueryObserver, useQueryClient } from "@tanstack/react-query"
import { useCourseStore } from "../stores/course-store.js"
import { subscribeCourseRemoval } from "../session/source-lifecycle-events.js"
import { useWorkflowClient as useGateway } from "../contexts/workflow-client.js"
import { useSessionController as useController } from "../session/session-controller-context.js"
import type { SessionOperationGateway } from "../session/session-operations.js"
import type { SessionController } from "../session/session-controller.js"
import { bindSessionStart as bind } from "../session/session-start.js"
const gateway = useGateway()
const controller = useController()
const cache = useQueryClient()
const observer = new QueryObserver(cache, { enabled: false })
const run = bind("analysis.start", (start) => gateway.execute(start, "analysis.run", body))
const alias = run
`
const check = (body: string) =>
  checkRendererStartSources([{ file, content: imports + body }])

describe("the local renderer start contract", () => {
  const automaticContexts = [
    ["effect", (body: string) => `effect(() => { ${body} }, [])`],
    ["effect", (body: string) => `useLayoutEffect(() => { ${body} }, [])`],
    ["effect", (body: string) => `useInsertionEffect(() => { ${body} }, [])`],
    [
      "Query observer",
      (body: string) => `watch({ enabled: false, select: () => { ${body} } })`,
    ],
    [
      "Query observer",
      (body: string) =>
        `useQueries({ queries: [{ enabled: false, select() { ${body} } }] })`,
    ],
    [
      "Query observer",
      (body: string) => `observer.subscribe(() => { ${body} })`,
    ],
    [
      "Query observer",
      (body: string) => `cache.getQueryCache().subscribe(() => { ${body} })`,
    ],
    [
      "store subscription",
      (body: string) => `useCourseStore.subscribe(() => { ${body} })`,
    ],
    [
      "store subscription",
      (body: string) => `subscribeCourseRemoval(() => { ${body} })`,
    ],
    [
      "store subscription",
      (body: string) =>
        `useSyncExternalStore(controller.subscribe, () => { ${body} })`,
    ],
  ] as const
  const calls = [
    'gateway.execute(start, "analysis.run", body)',
    'gateway.reserve(start, "analysis.run")',
    "controller.activateSurface(start, surface)",
    "controller.createCourse(start, input)",
    "controller.renameCourse(start, id, name)",
    "controller.duplicateCourse(start, id)",
    "controller.deleteCourse(start, id)",
    'bind("analysis.start", body)',
    "run()",
    "alias()",
  ]
  for (const [context, wrap] of automaticContexts) {
    it(`rejects admissions, bindings and local bound handlers in ${wrap("work")}`, () => {
      for (const call of calls) {
        const findings = check(wrap(call))
        assert.equal(findings.length, 1, call)
        assert.ok(findings[0]?.message.includes(`in ${context} at line`), call)
      }
    })
  }

  it("rejects direct admission and bound invocation during render, including hooks and inline render callbacks", () => {
    for (const call of calls.filter((call) => !call.startsWith("bind("))) {
      for (const render of [
        `function Example() { ${call}; return null }`,
        `const Example = () => { ${call}; return null }`,
        `function useExample() { ${call} }`,
        `const Example = React.memo(() => { ${call}; return null })`,
        `const Example = React.forwardRef(() => { ${call}; return null })`,
        `function Example() { useMemo(() => { ${call} }, []); return null }`,
        `function Example() { useState(() => { ${call} }); return null }`,
        `function Example() { (() => { ${call} })(); return null }`,
      ])
        assert.equal(check(render).length, 1, render)
    }
  })

  it("follows API and handler aliases with lexical name lookup", () => {
    assert.equal(
      check(`
      const renamed = bind
      const handler = renamed("analysis.start", body)
      const again = handler
      const effects = effect
      const { execute: executeAlias } = gateway
      const reserveAlias = gateway["reserve"]
      const { deleteCourse: remove } = controller
      const { subscribe: subscribeAlias } = useCourseStore
      const observed = observer
      effects(() => { again(); executeAlias(start, id, body); reserveAlias(start, id); remove(start, id) })
      subscribeAlias(() => again())
      observed.subscribe(() => again())
    `).length,
      6,
    )
    assert.deepEqual(
      check(`
      effect(() => { const run = () => {}; run() })
      function helper(effect) { effect(() => run()) }
      const unrelated = { execute() {}, reserve() {}, subscribe() {} }
      effect(() => unrelated.execute())
      unrelated.subscribe(() => run())
    `),
      [],
    )
  })

  it("recognises locally constructed stores and controllers without classifying unrelated store exports", () => {
    assert.equal(
      check(`
      import { create as makeStore } from "zustand"
      const localStore = makeStore<State>()(() => ({}))
      const localController = new SessionController(options)
      localStore.subscribe(() => alias())
      effect(() => localController.activateSurface(start, surface))
    `).length,
      2,
    )
    assert.deepEqual(
      check(`
      import { selectCourse } from "../stores/course-store-selectors.js"
      selectCourse(() => run())
    `),
      [],
    )
  })

  it("recognises imported namespaces, namespace aliases and typed admission receivers", () => {
    assert.equal(
      checkRendererStartSources([
        {
          file,
          content: `
      import * as React from "react"
      import * as Starts from "../session/session-start.js"
      import * as Gateway from "../contexts/workflow-client.js"
      import * as Session from "../session/session-controller-context.js"
      import * as Queries from "@tanstack/react-query"
      import type { SessionOperationGateway as Operations } from "../session/session-operations.js"
      import type { SessionController as Controller } from "../session/session-controller.js"
      const Hooks = React
      const Binding = Starts
      const { useEffect: aliasedEffect } = Hooks
      const { bindSessionStart: aliasedBinding } = Binding
      const handler = Binding.bindSessionStart("analysis.start", body)
      const aliasedHandler = aliasedBinding("analysis.start", body)
      function Example(gateway: Operations, controller: Controller) {
        Hooks.useEffect(() => handler())
        Hooks.useEffect(() => gateway.reserve(start, id))
        Hooks.useEffect(() => controller.createCourse(start, input))
        Hooks.useEffect(() => Gateway.getWorkflowClient().execute(start, id, body))
        Hooks.useEffect(() => Session.getSessionController().deleteCourse(start, id))
        Queries.useQuery({ enabled: false, select: () => handler() })
        aliasedEffect(() => aliasedHandler())
      }
    `,
        },
      ]).length,
      7,
    )
  })

  it("permits binding during render and starts from nested control events", () => {
    assert.deepEqual(
      check(`
      function Example() {
        const start = bind("analysis.start", (entry) => gateway.execute(entry, id, body))
        const handleClick = () => start()
        return <button onClick={() => { alias(); handleClick() }}>Start</button>
      }
      const Example = React.memo(() => {
        const handleClick = bind("course.create", (entry) => controller.createCourse(entry, input))
        return <button onClick={handleClick}>New</button>
      })
    `),
      [],
    )
  })

  it("recognises the memoised local bindings used by production controls", () => {
    for (const declaration of [
      'useMemo(() => bind("analysis.start", body), [])',
      'React.useMemo(() => { return bind("analysis.start", body) }, [])',
      'React.useCallback(bind("analysis.start", body), [])',
    ]) {
      const setup = `const handler = ${declaration}; const renamed = handler;`
      assert.equal(
        check(`function Example() { ${setup} effect(() => renamed()) }`).length,
        1,
      )
      assert.equal(check(`function Example() { ${setup} renamed() }`).length, 1)
      assert.deepEqual(
        check(
          `function Example() { ${setup} return <button onClick={() => renamed()} /> }`,
        ),
        [],
      )
    }
  })

  it("keeps lifecycle and presentation calls distinct from user admission", () => {
    assert.deepEqual(
      check(`
      effect(() => {
        controller.start()
        controller.requestClose(commit)
        controller.flush()
        gateway.presentation(id, input)
        gateway.stop(id)
      })
    `),
      [],
    )
  })

  it("checks session-owner source without a controller-wide exemption", () => {
    const findings = checkRendererStartSources([
      {
        file: "packages/renderer-app/src/session/session-controller.ts",
        content: `${imports}effect(() => controller.createCourse(start, input))`,
      },
    ])
    assert.equal(findings.length, 1)
  })

  it("records the accepted limit: an imported helper can invoke a bound handler without a local origin claim", () => {
    assert.deepEqual(
      checkRendererStartSources([
        {
          file,
          content:
            imports +
            `
        import { invoke } from "./helper.js"
        effect(() => invoke(run))
      `,
        },
        {
          file: "packages/renderer-app/src/components/helper.ts",
          content: `
        export function invoke(handler: () => void) { handler() }
      `,
        },
      ]),
      [],
    )
  })

  it("does not trace helper bodies, named callbacks, other returns or forwarded properties", () => {
    assert.deepEqual(
      check(`
      function helper() { run() }
      effect(helper)
      effect(() => helper())
      function factory() { return run }
      const returned = factory()
      effect(() => returned())
      function Child({ onStart }) { effect(() => onStart()); return null }
      function Example() { return <Child onStart={run} /> }
    `),
      [],
    )
  })
})
