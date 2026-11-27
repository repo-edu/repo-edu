import { execFile } from "node:child_process"
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { setTimeout } from "node:timers/promises"
import { promisify } from "node:util"

const [root, assistant, ...args] = process.argv.slice(2)
let scenario = JSON.parse(await readFile(join(root, "scenario.json"), "utf8"))
let prompt: string | undefined
let commitTarget = false
await appendFile(
  join(root, "calls.jsonl"),
  `${JSON.stringify({
    assistant,
    args,
    pid: process.pid,
    cwd: process.cwd(),
    phases: process.env.COMMIT_PHASES ?? null,
    auditor: process.env.COMMIT_AUDITOR ?? null,
    series: process.env.COMMIT_SERIES ?? null,
    openContests: process.env.COMMIT_OPEN_CONTESTS ?? null,
    cacheLifetime: process.env.CLAUDE_CODE_PROMPT_CACHE_TTL ?? null,
  })}\n`,
)

function send(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

if (args[0] === "--version") {
  console.log(
    scenario.versionOutput ?? `${assistant}-cli ${scenario.version ?? "1.0.0"}`,
  )
  process.exit(scenario.versionExit ?? 0)
}

if (args[0] === "update") {
  console.log(scenario.updateOutput ?? `${assistant} update output`)
  if (scenario.updateStderr) process.stderr.write(scenario.updateStderr)
  if (scenario.updateWait) await new Promise(() => setInterval(() => {}, 1000))
  if (scenario.updateFail === assistant) process.exit(7)
  if (assistant === "codex" && scenario.updatedVersion !== undefined) {
    await writeFile(
      join(root, "scenario.json"),
      JSON.stringify({ ...scenario, version: scenario.updatedVersion }),
    )
  }
  process.exit(0)
}

process.on("SIGTERM", () => {
  void writeFile(join(root, "stopped"), "SIGTERM").then(() => process.exit(0))
})

if (assistant === "claude" || assistant === "gemini") {
  const requests = []
  for await (const line of createInterface({ input: process.stdin }))
    requests.push(JSON.parse(line))
  await appendFile(
    join(root, "requests.jsonl"),
    `${JSON.stringify(requests)}\n`,
  )
  prompt = requests.find(
    (request) =>
      (assistant === "gemini" ? request.event : request.type) === "user",
  )?.message.content
  if (assistant === "claude" && args.includes("--no-session-persistence")) {
    if (scenario.settingsMode === "exit") process.exit(3)
    if (scenario.settingsMode === "missing") process.exit(0)
    // A named model applies as the release the scenario resolves it to.
    const named = args.includes("--model")
      ? args[args.indexOf("--model") + 1]
      : undefined
    const model =
      named === undefined
        ? "claude-model"
        : (scenario.releases?.[named] ?? named)
    send({
      type: "control_response",
      response: {
        request_id: "audit-round-settings",
        subtype: scenario.settingsMode === "error" ? "error" : "success",
        response: { applied: { model, effort: "high" } },
      },
    })
    process.exit(0)
  }
} else {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  prompt = Buffer.concat(chunks).toString("utf8")
}
await appendFile(
  join(root, "prompts.jsonl"),
  `${JSON.stringify({ assistant, args, prompt, auditor: process.env.COMMIT_AUDITOR ?? null, phases: process.env.COMMIT_PHASES ?? null, series: process.env.COMMIT_SERIES ?? null })}\n`,
)

scenario = { ...scenario, ...scenario.assistants?.[assistant] }
if (scenario.phases !== undefined) {
  const phase =
    /^Run the (design|pick|audit|vet|rebut|rule|fix|implement|watch|close) phase\b/.exec(
      prompt ?? "",
    )?.[1]
  if (phase === undefined) throw new Error("Fixture received no phase prompt")
  const selected = scenario.phases[phase]
  // A chained round changes who audits, so a phase may answer as either CLI.
  scenario = { ...scenario, ...selected, ...selected?.assistants?.[assistant] }
  // A fix may answer differently when resumed in detailing and then started
  // fresh in widening.
  if (selected?.streams !== undefined) {
    const counter = join(root, `${phase}-count`)
    let index = 0
    try {
      index = Number(await readFile(counter, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await writeFile(counter, String(index + 1))
    scenario = {
      ...scenario,
      stream: selected.streams[index] ?? selected.streams.at(-1),
    }
  }
  const phaseArguments = JSON.parse(
    /^Phase arguments \(JSON array\): (.+)$/m.exec(prompt ?? "")?.[1] ?? "[]",
  )
  commitTarget =
    phase === "fix" &&
    typeof phaseArguments[0] === "string" &&
    basename(phaseArguments[0]).startsWith("commit-")
  const document = selected?.document
  if (document !== undefined && (phase === "fix" || phase === "implement")) {
    const output = JSON.parse(
      /^Ruling output path \(JSON string\): (.+)$/m.exec(prompt ?? "")?.[1] ??
        "null",
    )
    if (output !== null) await writeFile(output, document.text)
  }
  let result = selected?.results?.[assistant] ?? selected?.result
  if (Array.isArray(result)) {
    const counter = join(root, `${phase}-${assistant}-result-count`)
    let index = 0
    try {
      index = Number(await readFile(counter, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await writeFile(counter, String(index + 1))
    result = result[index] ?? result.at(-1)
  }
  if (result !== undefined) {
    // Use the fixture result for the chosen phase and retain the CLI events
    // around it, including session, usage and tool events.
    const lines: string[] = scenario.stream.trimEnd().split("\n")
    const events = lines.map((line) => JSON.parse(line))
    const final = events.findLast((event) => {
      if (assistant === "gemini") return event.event === "result"
      if (assistant === "claude")
        return event.type === "result" && event.num_turns > 0
      return (
        event.type === "item.completed" && event.item.type === "agent_message"
      )
    })
    const payload = structuredClone(result)
    if (phase === "audit" && payload.report !== null) {
      const scope = JSON.parse(
        /^Audit scope \(JSON\): (.+)$/m.exec(prompt ?? "")?.[1] ?? "{}",
      )
      if (scope.planPhase === "widening" && payload.report.settling === null)
        payload.report.settling = {
          recommendation: "settle",
          reason: "The shape holds.",
        }
    }
    if (phase === "rebut" && payload.report !== null) {
      const vet = basename(String(phaseArguments[1])).split(".").at(-2)
      for (const answers of Object.values(payload.report.answers) as Record<
        string,
        unknown
      >[]) {
        if (vet !== undefined && Object.hasOwn(answers, "first")) {
          answers[vet] = answers.first
          delete answers.first
        }
      }
    }
    if (final !== undefined) {
      if (assistant === "claude") final.structured_output = payload
      else if (assistant === "gemini") final.result.structured_output = payload
      else final.item.text = JSON.stringify(payload)
    }
    scenario.stream = events.map((event) => JSON.stringify(event)).join("\n")
  }
}

// The commits skip the hooks, so a round's commit stamps are written here as
// the hook writes them: the phase lines open the body and a commit round's
// series label opens the subject in place of any form it opened with. A
// commit without the round's stamps stands for hand-run work.
for (const commit of scenario.commits ?? []) {
  const stamped = commit.roundStamp !== false
  const phaseStamp = process.env.COMMIT_PHASES?.trim()
  const series = process.env.COMMIT_SERIES || undefined
  const body = [
    ...(!stamped || phaseStamp === undefined ? [] : [phaseStamp]),
    ...(commit.body === undefined ? [] : [commit.body]),
  ].join("\n\n")
  const subject =
    commitTarget && commit.commitSubject !== undefined
      ? commit.commitSubject
      : commit.subject
  const [opening = "", ...rest] = subject.split(" ")
  const unformed = opening.includes("/") ? rest.join(" ") : subject
  await promisify(execFile)(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-q",
      "-m",
      stamped && series !== undefined
        ? `${series}/commit-audit ${unformed}`
        : subject,
      ...(body.length === 0 ? [] : ["-m", body]),
    ],
    { cwd: commit.cwd },
  )
}

// A close moves its plan out of the active folder.
for (const move of scenario.moves ?? []) {
  await mkdir(dirname(move.to), { recursive: true })
  await rename(move.from, move.to)
}
for (const file of scenario.remove ?? []) await rm(file, { force: true })

if (scenario.usage !== undefined)
  await appendFile(scenario.usage.path, scenario.usage.text)
if (scenario.stderr !== undefined) process.stderr.write(scenario.stderr)
const bytes = Buffer.from(scenario.stream ?? "")
const chunkSize = scenario.chunkSize ?? bytes.length
for (let offset = 0; offset < bytes.length; offset += chunkSize) {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(bytes.subarray(offset, offset + chunkSize), (error) =>
      error ? reject(error) : resolve(),
    )
  })
  if (scenario.chunkSize !== undefined) await setTimeout(1)
}
if (scenario.wait) await new Promise(() => setInterval(() => {}, 1000))
process.exit(scenario.exitCode ?? 0)
