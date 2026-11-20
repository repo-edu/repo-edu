import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir, stat } from "node:fs/promises"
import { dirname } from "node:path"
import { test } from "node:test"
import {
  answerFormText,
  listenForRuling,
  type RulingQuestion,
  rulingSocketPath,
  sendRulingAnswer,
  type WaitingRuling,
  waitingRulingText,
  waitingRun,
} from "../ruling-wait.js"
import { shortCacheRoot as cacheRoot, socketRequirement } from "./helpers.js"

/**
 * A round's questions before the fix, which have no ruling document, or an
 * implementation worker's ruling, which asks about no finding.
 */
function waiting(
  target: string,
  questions: readonly RulingQuestion[] = [
    { finding: 1, needs: "winner" },
    { finding: 2, needs: "choice" },
  ],
): WaitingRuling {
  const worker = questions.length === 0
  return {
    target,
    title: `Implementation audit of ${target}.md, step 1 (round 1)`,
    ruling: worker ? `/active/${target}-ruling.md` : null,
    reports: worker
      ? []
      : [`/active/${target}-audit.md`, `/active/${target}-vet.abh.md`],
    fixerSide: worker ? null : "auditor",
    questions,
    panel: worker ? [] : ["abh", "oth"],
  }
}

/** Questions that ask only for winners, on the given findings. */
const winners = (...findings: number[]): RulingQuestion[] =>
  findings.map((finding) => ({ finding, needs: "winner" }))

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

test("a complete answer is accepted, keeps winners apart from choices and ends the wait", {
  skip: socketRequirement,
}, async (t) => {
  const cache = await cacheRoot(t)
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting("example"),
  })
  const { ruling } = await waitingRun(cache, undefined)
  assert.deepEqual(ruling, waiting("example"))
  const sent = await send(cache, "example", {
    rulings: [
      {
        finding: 1,
        winner: ["abh"],
        reason: "  The vet read the contract.  ",
        choice: " Keep the field.\nDrop the test. ",
      },
      { finding: 2, choice: "Take the smaller rule." },
    ],
    reply: "",
  })
  assert.equal(sent.accepted, true)
  assert.match(sent.text, /^Accepted: /)
  assert.deepEqual(await wait.answer, {
    rulings: [
      { finding: 1, winner: ["abh"], reason: "The vet read the contract." },
    ],
    choices: [
      { finding: 1, choice: "Keep the field.\nDrop the test." },
      { finding: 2, choice: "Take the smaller rule." },
    ],
    reply: "",
  })
  // Closing the server removes its file, so no command finds the run again.
  assert.equal(await exists(rulingSocketPath(cache, "example")), false)
  await assert.rejects(waitingRun(cache, "example"), {
    message: "No run waits for a ruling on example.",
  })
})

test("every winner word answers a finding that needs a winner", {
  skip: socketRequirement,
}, async (t) => {
  const cache = await cacheRoot(t)
  const wait = await listenForRuling({
    cacheRoot: cache,
    ruling: waiting("example", winners(1, 2, 3)),
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
  assert.deepEqual((await wait.answer)?.choices, [])
})

test("the notice names the round reports and what each finding needs", () => {
  const text = waitingRulingText(waiting("example"))
  assert.doesNotMatch(text, /^Ruling:/m)
  assert.match(
    text,
    /^Round reports:\n {2}\/active\/example-audit\.md\n {2}\/active\/example-vet\.abh\.md$/m,
  )
  assert.match(text, /^Findings that need a winner: 1$/m)
  assert.match(text, /^Findings that need a choice: 2$/m)
  assert.match(
    text,
    /^Winner words: report, neither or one or more of the vetter tags abh, oth$/m,
  )
  const worker = waitingRulingText(waiting("example", []))
  assert.match(worker, /^Ruling: \/active\/example-ruling\.md$/m)
  assert.doesNotMatch(worker, /^Round reports:|^Winner words:/m)
})

test("the answer form writes vetter tags as a list and an implementation ruling as its reply", () => {
  const form = answerFormText(waiting("example"))
  assert.match(
    form,
    /with report and neither as strings and vetter tags as a list, as \["abh"\]; add a choice when the winning side leaves one open\. Give each finding that needs a choice the choice alone\. The reply stays empty:$/m,
  )
  assert.match(form, /"rulings":\[\{"finding":1,"winner":"report"/)
  assert.match(form, /\{"finding":2,"choice":/)
  assert.match(
    answerFormText(waiting("example", [])),
    /This ruling asks about no finding, so its answer is the reply alone:$/m,
  )
})

test("an implementation ruling takes a free reply alone", {
  skip: socketRequirement,
}, async (t) => {
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
    choices: [],
    reply: "Use the existing parser.",
  })
})

const winnerWords = "report, neither or one or more of the vetter tags abh, oth"

for (const { name, questions, answer, refusal } of [
  {
    name: "a finding that is not asked",
    questions: winners(1),
    answer: {
      rulings: [
        { finding: 1, winner: ["abh"], reason: "Fine." },
        { finding: 3, winner: ["abh"], reason: "Fine." },
      ],
      reply: "",
    },
    refusal: "Finding 3 is not asked.",
  },
  {
    name: "a finding answered twice",
    questions: winners(1),
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
    questions: winners(1, 2),
    answer: {
      rulings: [{ finding: 1, winner: ["abh"], reason: "Fine." }],
      reply: "",
    },
    refusal: `Finding 2 has no answer; use ${winnerWords}.`,
  },
  {
    name: "a choice in place of a winner",
    questions: winners(1),
    answer: { rulings: [{ finding: 1, choice: "Keep it." }], reply: "" },
    refusal: `Finding 1 needs a winner; use ${winnerWords}.`,
  },
  {
    name: "a winner on a finding that needs a choice",
    questions: [{ finding: 1, needs: "choice" }],
    answer: {
      rulings: [{ finding: 1, winner: "report", reason: "Fine." }],
      reply: "",
    },
    refusal:
      "Finding 1 needs a choice, which names no winner and takes no reason.",
  },
  {
    name: "an empty choice",
    questions: [{ finding: 1, needs: "choice" }],
    answer: { rulings: [{ finding: 1, choice: " " }], reply: "" },
    refusal: "Finding 1 has an empty choice.",
  },
  {
    name: "a finding that needs a choice without one",
    questions: [{ finding: 1, needs: "choice" }],
    answer: { rulings: [{ finding: 1 }], reply: "" },
    refusal: "Finding 1 needs a choice.",
  },
  {
    name: "a vetter tag outside the round's panel",
    questions: winners(1),
    answer: {
      rulings: [{ finding: 1, winner: ["abh", "atx"], reason: "Fine." }],
      reply: "",
    },
    refusal: `Finding 1 names atx, which is no vetter of this round; use ${winnerWords}.`,
  },
  {
    name: "a winner without a reason",
    questions: winners(1),
    answer: { rulings: [{ finding: 1, winner: ["abh"] }], reply: "" },
    refusal: "Finding 1 needs a one-line reason for its winner.",
  },
  {
    name: "a reason over two lines",
    questions: winners(1),
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
    name: "a reply before the fix",
    questions: winners(1),
    answer: {
      rulings: [{ finding: 1, winner: "report", reason: "Fine." }],
      reply: "Explain finding 1.",
    },
    refusal:
      "The reply must be empty, because no session reads it before the fix; put the user's words in a finding's reason or choice.",
  },
  {
    name: "an implementation ruling without a reply",
    questions: [],
    answer: { rulings: [], reply: "" },
    refusal:
      "The reply is empty; this ruling asks about no finding, so its answer is the reply.",
  },
  {
    name: "the removed word that left a finding open",
    questions: winners(1),
    answer: { rulings: [{ finding: 1, winner: "not yet" }], reply: "" },
    refusal: "The answer does not have the answer form:",
  },
  {
    name: "the single vetter's old winner word",
    questions: winners(1),
    answer: {
      rulings: [{ finding: 1, winner: "auditor", reason: "Fine." }],
      reply: "",
    },
    refusal: "The answer does not have the answer form:",
  },
  {
    name: "a document that is not JSON",
    questions: winners(1),
    answer: "auditor — the finding stands",
    refusal: "The answer is not JSON:",
  },
] as const satisfies readonly {
  name: string
  questions: readonly RulingQuestion[]
  answer: unknown
  refusal: string
}[]) {
  test(`the waiting run refuses ${name} and keeps waiting`, {
    skip: socketRequirement,
  }, async (t) => {
    const cache = await cacheRoot(t)
    const wait = await listenForRuling({
      cacheRoot: cache,
      ruling: waiting("example", questions),
    })
    const refused = await send(cache, "example", answer)
    assert.equal(refused.accepted, false)
    assert.ok(
      refused.text.startsWith(`Refused: ${refusal}`),
      `${refused.text} should start with ${refusal}`,
    )
    // A refusal leaves the run waiting for a complete answer.
    const accepted = await send(cache, "example", {
      rulings: questions.map(({ finding, needs }) =>
        needs === "winner"
          ? { finding, winner: ["abh"], reason: "The vet read the contract." }
          : { finding, choice: "Keep it." },
      ),
      reply: questions.length === 0 ? "Go on." : "",
    })
    assert.equal(accepted.accepted, true)
    assert.notEqual(await wait.answer, null)
  })
}

test("ending the wait returns no answer and removes the socket", {
  skip: socketRequirement,
}, async (t) => {
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

test("no waiting run is reported for an absent target and an empty folder", {
  skip: socketRequirement,
}, async (t) => {
  const cache = await cacheRoot(t)
  await assert.rejects(waitingRun(cache, undefined), {
    message: "No run waits for a ruling.",
  })
  await assert.rejects(waitingRun(cache, "example"), {
    message: "No run waits for a ruling on example.",
  })
})

test("a dead run's socket file blocks neither the commands nor a later wait", {
  skip: socketRequirement,
}, async (t) => {
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

test("several waiting runs need the target named", {
  skip: socketRequirement,
}, async (t) => {
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

test("a long target keeps a short socket path", {
  skip: socketRequirement,
}, async (t) => {
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
