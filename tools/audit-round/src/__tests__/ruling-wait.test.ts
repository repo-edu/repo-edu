import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir, stat } from "node:fs/promises"
import { dirname } from "node:path"
import { test } from "node:test"
import {
  answerFormText,
  listenForRuling,
  rulingSocketPath,
  sendRulingAnswer,
  type WaitingRuling,
  waitingRun,
} from "../ruling-wait.js"
import { shortCacheRoot as cacheRoot } from "./helpers.js"

function waiting(
  target: string,
  findings: readonly number[] = [1, 2],
): WaitingRuling {
  return {
    target,
    title: `Implementation audit of ${target}.md, step 1 (round 1)`,
    ruling: `/active/${target}-ruling.md`,
    folder: "/repo-edu",
    fixerSide: findings.length === 0 ? null : "auditor",
    findings,
    panel: findings.length === 0 ? [] : ["abh", "oth"],
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function send(cache: string, target: string, answer: unknown) {
  const { socket } = await waitingRun(cache, target)
  return sendRulingAnswer(
    socket,
    target,
    typeof answer === "string" ? answer : JSON.stringify(answer),
  )
}

test("a complete answer is accepted, drops not yet and ends the wait", async (t) => {
  const cache = await cacheRoot(t)
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting("example"),
  })
  const { ruling } = await waitingRun(cache, undefined)
  assert.deepEqual(ruling, waiting("example"))
  const sent = await send(cache, "example", {
    rulings: [
      { finding: 1, winner: ["abh"], reason: "  The vet read the contract.  " },
      { finding: 2, winner: "not yet" },
    ],
    reply: "Explain the evidence for finding 2.\nQuote the plan.",
  })
  assert.equal(sent.accepted, true)
  assert.match(sent.text, /^Accepted: /)
  assert.deepEqual(await wait.answer, {
    rulings: [
      { finding: 1, winner: ["abh"], reason: "The vet read the contract." },
    ],
    reply: "Explain the evidence for finding 2.\nQuote the plan.",
  })
  // Closing the server removes its file, so no command finds the run again.
  assert.equal(await exists(rulingSocketPath(cache, "example")), false)
  await assert.rejects(waitingRun(cache, "example"), {
    message: "No run waits for a ruling on example.",
  })
})

test("every winner may close the answer without a reply", async (t) => {
  const cache = await cacheRoot(t)
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting("example", [1, 2, 3]),
  })
  const sent = await send(cache, "example", {
    rulings: [
      { finding: 1, winner: "report", reason: "The finding stands." },
      { finding: 2, winner: "neither", reason: "A later commit resolved it." },
      { finding: 3, winner: ["abh", "oth"], reason: "Both vets were right." },
    ],
    reply: "",
  })
  assert.equal(sent.accepted, true)
  assert.deepEqual((await wait.answer)?.reply, "")
})

test("the answer form writes vet tags as a list and an implementation ruling as its reply", () => {
  assert.match(
    answerFormText(waiting("example", [1])),
    /with report, neither and not yet as strings and vet tags as a list, as \["abh"\]; not yet takes no reason:$/m,
  )
  assert.match(
    answerFormText(waiting("example", [])),
    /This ruling has no finding, so its answer is the reply alone:$/m,
  )
})

test("an implementation ruling takes a free reply alone", async (t) => {
  const cache = await cacheRoot(t)
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting("example", []),
  })
  const sent = await send(cache, "example", {
    rulings: [],
    reply: "Use the existing parser.",
  })
  assert.equal(sent.accepted, true)
  assert.deepEqual(await wait.answer, {
    rulings: [],
    reply: "Use the existing parser.",
  })
})

for (const { name, findings, answer, refusal } of [
  {
    name: "a finding that needs no winner",
    findings: [1],
    answer: {
      rulings: [
        { finding: 1, winner: ["abh"], reason: "Fine." },
        { finding: 3, winner: ["abh"], reason: "Fine." },
      ],
      reply: "",
    },
    refusal: "Finding 3 does not need a winner.",
  },
  {
    name: "a finding answered twice",
    findings: [1],
    answer: {
      rulings: [
        { finding: 1, winner: ["abh"], reason: "Fine." },
        { finding: 1, winner: "report", reason: "Fine." },
      ],
      reply: "",
    },
    refusal: "Finding 1 is answered more than once.",
  },
  {
    name: "a finding without an answer",
    findings: [1, 2],
    answer: {
      rulings: [{ finding: 1, winner: ["abh"], reason: "Fine." }],
      reply: "Go on.",
    },
    refusal:
      "Finding 2 has no answer; use report, neither, one or more of the vet tags abh, oth or not yet.",
  },
  {
    name: "a vet tag outside the round's panel",
    findings: [1],
    answer: {
      rulings: [{ finding: 1, winner: ["abh", "atx"], reason: "Fine." }],
      reply: "",
    },
    refusal:
      "Finding 1 names atx, which is no vet of this round; use report, neither, one or more of the vet tags abh, oth or not yet.",
  },
  {
    name: "a winner without a reason",
    findings: [1],
    answer: { rulings: [{ finding: 1, winner: ["abh"] }], reply: "" },
    refusal: "Finding 1 needs a one-line reason for its winner.",
  },
  {
    name: "a reason over two lines",
    findings: [1],
    answer: {
      rulings: [
        {
          finding: 1,
          winner: "report",
          reason:
            "Decision 4 and its old reason must be named in the\nBaseline.",
        },
      ],
      reply: "",
    },
    refusal: "Finding 1 needs its reason on one line.",
  },
  {
    name: "a reason beside not yet",
    findings: [1],
    answer: {
      rulings: [{ finding: 1, winner: "not yet", reason: "Why?" }],
      reply: "Explain it.",
    },
    refusal:
      "Finding 1 is left open with not yet, so it takes no reason; put the question in the reply.",
  },
  {
    name: "not yet without a reply",
    findings: [1],
    answer: { rulings: [{ finding: 1, winner: "not yet" }], reply: " " },
    refusal:
      "The reply is empty; it may be empty only when every finding has a winner.",
  },
  {
    name: "an implementation ruling without a reply",
    findings: [],
    answer: { rulings: [], reply: "" },
    refusal:
      "The reply is empty; this ruling has no finding to decide, so its answer is the reply.",
  },
  {
    name: "a winner outside the runner's list",
    findings: [1],
    answer: { rulings: [{ finding: 1, winner: "vett" }], reply: "" },
    refusal: "The answer does not have the answer form:",
  },
  {
    name: "the single vet's old winner word",
    findings: [1],
    answer: {
      rulings: [{ finding: 1, winner: "auditor", reason: "Fine." }],
      reply: "",
    },
    refusal: "The answer does not have the answer form:",
  },
  {
    name: "a document that is not JSON",
    findings: [1],
    answer: "auditor — the finding stands",
    refusal: "The answer is not JSON:",
  },
] as const) {
  test(`the waiting run refuses ${name} and keeps waiting`, async (t) => {
    const cache = await cacheRoot(t)
    const wait = await listenForRuling({
      cacheRoot: cache,
      ruling: waiting("example", findings),
    })
    const refused = await send(cache, "example", answer)
    assert.equal(refused.accepted, false)
    assert.ok(
      refused.text.startsWith(`Refused: ${refusal}`),
      `${refused.text} should start with ${refusal}`,
    )
    // A refusal leaves the run waiting for a complete answer.
    const accepted = await send(cache, "example", {
      rulings: findings.map((finding) => ({
        finding,
        winner: ["abh"],
        reason: "The vet read the contract.",
      })),
      reply: "Go on.",
    })
    assert.equal(accepted.accepted, true)
    assert.notEqual(await wait.answer, null)
  })
}

test("ending the wait returns no answer and removes the socket", async (t) => {
  const cache = await cacheRoot(t)
  const interruption = new AbortController()
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting("example"),
    signal: interruption.signal,
  })
  interruption.abort(new Error("Interrupted"))
  assert.equal(await wait.answer, null)
  assert.equal(await exists(rulingSocketPath(cache, "example")), false)
})

test("no waiting run is reported for an absent target and an empty folder", async (t) => {
  const cache = await cacheRoot(t)
  await assert.rejects(waitingRun(cache, undefined), {
    message: "No run waits for a ruling.",
  })
  await assert.rejects(waitingRun(cache, "example"), {
    message: "No run waits for a ruling on example.",
  })
})

test("a dead run's socket file blocks neither the commands nor a later wait", async (t) => {
  const cache = await cacheRoot(t)
  const path = rulingSocketPath(cache, "example")
  await mkdir(dirname(path), { recursive: true })
  // A killed run never closes its server, so its socket file stays.
  const child = spawn(
    process.execPath,
    [
      "-e",
      `require("node:net").createServer().listen(${JSON.stringify(path)}, () => console.log("up"))`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  )
  await once(child.stdout, "data")
  child.kill("SIGKILL")
  await once(child, "exit")
  assert.equal(await exists(path), true)
  await assert.rejects(waitingRun(cache, undefined), {
    message: "No run waits for a ruling.",
  })
  await assert.rejects(waitingRun(cache, "example"), {
    message: "No run waits for a ruling on example.",
  })
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting("example", []),
  })
  assert.equal(
    (await send(cache, "example", { rulings: [], reply: "Go on." })).accepted,
    true,
  )
  assert.notEqual(await wait.answer, null)
})

test("several waiting runs need the target named", async (t) => {
  const cache = await cacheRoot(t)
  const waits = await Promise.all(
    ["alpha", "beta"].map((target) =>
      listenForRuling({ cacheRoot: cache, ruling: waiting(target, []) }),
    ),
  )
  await assert.rejects(waitingRun(cache, undefined), {
    message:
      /^Several runs wait for a ruling; name one of: (alpha, beta|beta, alpha)\.$/,
  })
  for (const target of ["alpha", "beta"]) {
    assert.equal((await waitingRun(cache, target)).ruling.target, target)
    assert.equal(
      (await send(cache, target, { rulings: [], reply: `Go on, ${target}.` }))
        .accepted,
      true,
    )
  }
  assert.deepEqual(
    (await Promise.all(waits.map((wait) => wait.answer))).map(
      (answer) => answer?.reply,
    ),
    ["Go on, alpha.", "Go on, beta."],
  )
})

test("a long target keeps a short socket path", async (t) => {
  const cache = await cacheRoot(t)
  const target = `commit-${"0123456789abcdef".repeat(12)}+plan-${"f".repeat(80)}`
  const path = rulingSocketPath(cache, target)
  assert.equal(path.length - cache.length, "/rulings/".length + 16 + 5)
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting(target, []),
  })
  assert.equal((await waitingRun(cache, undefined)).ruling.target, target)
  assert.equal(
    (await send(cache, target, { rulings: [], reply: "Go on." })).accepted,
    true,
  )
  assert.notEqual(await wait.answer, null)
})
