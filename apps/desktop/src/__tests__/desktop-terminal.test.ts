import assert from "node:assert/strict"
import { it } from "node:test"
import type { ChildProcessLifetimeEnding } from "@repo-edu/host-node/child-process-lifetime"
import { childProcessUnconfirmedTreeMessage } from "@repo-edu/host-node/child-process-lifetime"
import { endDesktopHost } from "../desktop-terminal"
import { HostAdmission } from "../host-admission"
import type {
  HostAdmissionEvent,
  HostAdmissionState,
} from "../host-admission-model"
import { runDesktopEntry } from "./desktop-entry-harness"

function harness() {
  const ending = Promise.withResolvers<ChildProcessLifetimeEnding>()
  const trace: string[] = []
  const pending: Promise<void>[] = []
  const request = { cancel: () => trace.push("cancel") }
  const admission = new HostAdmission((effect) => {
    if (effect.type === "disable-input") trace.push("disable")
    if (effect.type === "prepare-close") trace.push("prepare-close")
    if (effect.type === "end-host") {
      pending.push(
        endDesktopHost({
          reason: effect.reason,
          controller: {
            stopAndConfirm() {
              trace.push("stop")
              return ending.promise
            },
          },
          snapshot: admission.getSnapshot,
          disableInput: () => trace.push("disable"),
          closeStorage: () => trace.push("close-storage"),
          warn: (message) => {
            assert.equal(message, childProcessUnconfirmedTreeMessage)
            trace.push("warn")
          },
          report: () => trace.push("report"),
          exit: (code) => trace.push(`exit:${code}`),
          installUpdate: () => trace.push("install"),
        }),
      )
    }
  })
  const send = (event: HostAdmissionEvent) => admission.dispatch(event)
  const close = () =>
    send({ type: "host-start", source: "window-close", request })
  const ready = () => send({ type: "close-ready", request })
  const interactive = () => send({ type: "bootstrap-acknowledged" })
  return {
    admission,
    request,
    send,
    close,
    ready,
    interactive,
    trace,
    ending,
    pending,
  }
}

for (const outcome of ["confirmed", "unconfirmed"] as const) {
  it(`clean close disables input, drains accepted work and awaits ${outcome} ending`, async () => {
    const h = harness()
    h.interactive()
    const retire = h.admission.startWorkflow("course.list", h.request)
    h.close()
    assert.deepEqual(h.trace, ["disable"])
    assert.throws(() => h.admission.startWorkflow("course.save", h.request))
    retire()
    retire()
    assert.deepEqual(h.trace, ["disable", "prepare-close"])
    h.ready()
    h.close()
    assert.deepEqual(h.trace, ["disable", "prepare-close", "disable", "stop"])
    h.ending.resolve({ outcome })
    await Promise.all(h.pending)
    assert.deepEqual(
      h.trace.slice(4),
      outcome === "confirmed"
        ? ["close-storage", "exit:0"]
        : ["close-storage", "warn", "exit:1"],
    )
    assert.equal(h.pending.length, 1)
  })
}

const phases = [
  "starting",
  "interactive",
  "preparing.bundle",
  "preparing.input",
  "executing.running",
  "executing.settling",
  "closing.draining",
  "closing.preparing",
  "closing.ready",
  "closing.aborting",
  "terminal",
] as const

function enter(h: ReturnType<typeof harness>, phase: (typeof phases)[number]) {
  if (phase === "starting") return
  if (phase === "closing.aborting") {
    h.close()
    return
  }
  if (phase === "terminal") {
    h.admission.terminal(new Error("first failure"))
    return
  }
  h.interactive()
  if (phase === "interactive") return
  if (phase.startsWith("closing.")) {
    if (phase === "closing.draining")
      h.admission.startWorkflow("course.list", h.request)
    h.close()
    if (phase === "closing.ready") h.ready()
    return
  }
  h.send({
    type: "exclusive-intent",
    command: "repo.clone",
    request: h.request,
  })
  if (phase === "preparing.bundle") return
  h.send({ type: "preparation-committed", request: h.request })
  if (phase === "preparing.input") return
  h.send({ type: "input-prepared", request: h.request })
  if (phase === "executing.running") return
  h.send({
    type: "outcome-fixed",
    request: h.request,
    completion: {
      operation: {} as never,
      outcome: {} as never,
    },
  })
}

for (const phase of phases) {
  for (const outcome of ["confirmed", "unconfirmed"] as const) {
    it(`failure in ${phase} makes one ending request and exits after ${outcome}`, async () => {
      const h = harness()
      enter(h, phase)
      h.admission.terminal(new Error("failure"))
      h.admission.terminal(new Error("cascade"))
      h.close()
      assert.equal(h.pending.length, 1)
      assert.equal(
        h.trace.some((event) => event.startsWith("exit:")),
        false,
      )
      h.ending.resolve({ outcome })
      await Promise.all(h.pending)
      assert.deepEqual(
        h.trace.slice(-(outcome === "confirmed" ? 2 : 3)),
        outcome === "confirmed"
          ? ["close-storage", "exit:1"]
          : ["close-storage", "warn", "exit:1"],
      )
      assert.equal(h.trace.filter((event) => event === "stop").length, 1)
      assert.equal(
        h.trace.filter((event) => event === "cancel").length,
        phase === "closing.draining" || phase === "executing.running" ? 1 : 0,
      )
    })
  }
  it(`normal close in ${phase} never reopens admission or requests another flush`, async () => {
    const h = harness()
    enter(h, phase)
    const priorPreparations = h.trace.filter(
      (event) => event === "prepare-close",
    ).length
    h.close()
    h.close()
    const state = h.admission.getSnapshot()
    if (state.phase === "closing.draining") {
      h.send({ type: "call-settled", call: h.request })
    }
    if (h.admission.getSnapshot().phase === "closing.preparing") h.ready()
    assert.equal(h.pending.length, 1)
    h.ending.resolve({ outcome: "confirmed" })
    await Promise.all(h.pending)
    assert.equal(
      h.trace.filter((event) => event === "prepare-close").length,
      phase === "interactive" || phase === "closing.draining"
        ? 1
        : priorPreparations,
    )
    assert.equal(h.trace.at(-1), phase === "terminal" ? "exit:1" : "exit:0")
  })
}

it("unconfirmed shutdown warns once and retains the real entry's gate until process exit", async () => {
  const result = await runDesktopEntry({ scenario: "unconfirmed-close" })
  assert.equal(result.status, 1, result.stderr)
  assert.deepEqual(result.events.slice(-7), [
    "disable",
    "stop-owned-work",
    "dialog",
    childProcessUnconfirmedTreeMessage,
    "app-exit:1",
    "process-exit:1",
    "release",
  ])
})

it("close before readiness prevents later bootstrap work while ending is pending", async () => {
  const result = await runDesktopEntry({ scenario: "close-before-ready" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.events.includes("storage"), false)
  assert.ok(
    result.events.indexOf("stop-owned-work") < result.events.indexOf("ready"),
  )
  assert.deepEqual(result.events.slice(-3), [
    "app-exit:0",
    "process-exit:0",
    "release",
  ])
})

it("warning failure still exits once without claiming confirmation", async () => {
  const trace: string[] = []
  await endDesktopHost({
    reason: "close",
    controller: { stopAndConfirm: async () => ({ outcome: "unconfirmed" }) },
    snapshot: (): HostAdmissionState => ({
      phase: "closing.ready",
      reason: "close",
    }),
    disableInput() {},
    closeStorage() {},
    warn() {
      throw new Error("dialog unavailable")
    },
    report: () => trace.push("report"),
    exit: (code) => trace.push(`exit:${code}`),
    installUpdate: () => assert.fail("Unexpected installation"),
  })
  assert.deepEqual(trace, ["report", "exit:1"])
})
