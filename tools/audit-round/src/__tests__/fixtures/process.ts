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

if (assistant === "claude") {
  const requests = []
  for await (const line of createInterface({ input: process.stdin }))
    requests.push(JSON.parse(line))
  await appendFile(
    join(root, "requests.jsonl"),
    `${JSON.stringify(requests)}\n`,
  )
  prompt = requests.find((request) => request.type === "user")?.message.content
  if (args.includes("--no-session-persistence")) {
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
  `${JSON.stringify({ assistant, args, prompt, auditor: process.env.COMMIT_AUDITOR ?? null, phases: process.env.COMMIT_PHASES ?? null })}\n`,
)

scenario = { ...scenario, ...scenario.assistants?.[assistant] }
if (scenario.phases !== undefined) {
  const phase =
    /^Run the (audit|vet|rebut|fix|implement|watch|close) phase\b/.exec(
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
  const configuredDocument =
    selected?.documents?.[assistant] ?? selected?.document
  let document = configuredDocument
  if (configuredDocument?.sources !== undefined) {
    const counter = join(root, `${phase}-${assistant}-document-count`)
    let index = 0
    try {
      index = Number(await readFile(counter, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    await writeFile(counter, String(index + 1))
    document = {
      source:
        configuredDocument.sources[index] ?? configuredDocument.sources.at(-1),
    }
  }
  if (document !== undefined) {
    const outputIndex = {
      audit: 0,
      vet: 1,
      rebut: 2,
      watch: 0,
    }[phase]
    const output =
      phase === "fix" || phase === "implement"
        ? JSON.parse(
            /^Ruling output path \(JSON string\): (.+)$/m.exec(
              prompt ?? "",
            )?.[1] ?? "null",
          )
        : outputIndex === undefined
          ? null
          : phaseArguments[outputIndex]
    if (output !== null) {
      // A fixture audit names its target from the arguments it was given,
      // as a real auditor does, so one report serves every scope.
      const target = (): string => {
        const [, first, ...rest] = phaseArguments as [
          string,
          string | { references: string[] },
          ...(string | { references: string[] })[],
        ]
        if (typeof first !== "string")
          return [first, ...rest]
            .flatMap((group) =>
              typeof group === "string" ? [group] : group.references,
            )
            .join(" ")
        if (!first.endsWith(".md")) return [first, ...rest].join(" ")
        const plan = basename(first)
        return rest.length === 0 ? plan : `${plan} ${rest[0]}`
      }
      const written: string =
        document.source === undefined
          ? document.text
          : await readFile(document.source, "utf8")
      const text =
        phase === "audit"
          ? written.replace("Target: <arguments>", `Target: ${target()}`)
          : written
      if (["audit", "vet", "rebut"].includes(phase)) {
        // Report assistants return text; only the runner writes their output.
        const final = (value: string) =>
          value
            .trimEnd()
            .endsWith('PHASE RESULT: {"status":"finished","reason":null}')
            ? `${text.trimEnd()}\n${value.trimEnd().split("\n").at(-1)}`
            : value
        scenario.stream = scenario.stream
          .trimEnd()
          .split("\n")
          .map((line: string) => {
            const event = JSON.parse(line)
            if (event.type === "result") event.result = final(event.result)
            if (event.type === "assistant") {
              for (const block of event.message.content)
                if (block.type === "text") block.text = final(block.text)
            }
            if (
              event.type === "item.completed" &&
              event.item.type === "agent_message"
            )
              event.item.text = final(event.item.text)
            return JSON.stringify(event)
          })
          .join("\n")
      } else await writeFile(output, text)
    }
  }
}

for (const commit of scenario.commits ?? []) {
  const phaseStamp = process.env.COMMIT_PHASES?.trim()
  const body = [
    ...(commit.roundStamp === false || phaseStamp === undefined
      ? []
      : [phaseStamp]),
    ...(commit.body === undefined ? [] : [commit.body]),
  ].join("\n\n")
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
      commitTarget && commit.commitSubject !== undefined
        ? commit.commitSubject
        : commit.subject,
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
