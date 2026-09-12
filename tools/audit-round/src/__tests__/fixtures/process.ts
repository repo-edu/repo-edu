import { appendFile, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { setTimeout } from "node:timers/promises"

const [root, assistant, ...args] = process.argv.slice(2)
let scenario = JSON.parse(await readFile(join(root, "scenario.json"), "utf8"))
let prompt = assistant === "codex" ? args.at(-1) : undefined
await appendFile(
  join(root, "calls.jsonl"),
  `${JSON.stringify({ assistant, args, pid: process.pid })}\n`,
)

function send(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

if (args[0] === "--version") {
  console.log(`${assistant} fixture CLI 1.0.0`)
  process.exit(0)
}

if (args[0] === "update") {
  console.log(`${assistant} update output`)
  if (scenario.updateWait) await new Promise(() => setInterval(() => {}, 1000))
  process.exit(scenario.updateFail === assistant ? 7 : 0)
}

if (args[0] === "app-server") {
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line)
    await appendFile(join(root, "requests.jsonl"), `${line}\n`)
    if (request.id === undefined) continue
    if (scenario.settingsMode === "exit") process.exit(3)
    if (scenario.settingsMode === "malformed") {
      console.log("invalid JSON")
      continue
    }
    if (scenario.settingsMode === "error") {
      send({
        id: request.id,
        error: { code: -32603, message: "Settings unavailable" },
      })
      continue
    }
    if (request.method === "initialize") send({ id: request.id, result: {} })
    if (request.method === "config/read") {
      send({
        id: request.id,
        result: {
          config: scenario.config ?? {
            model: "chosen-model",
            model_reasoning_effort: "high",
          },
        },
      })
    }
    if (request.method === "model/list") {
      send({
        id: request.id,
        result:
          request.params.cursor === undefined
            ? {
                data: [
                  {
                    model: "other",
                    defaultReasoningEffort: "low",
                    isDefault: false,
                  },
                ],
                nextCursor: "second-page",
              }
            : {
                data: [
                  {
                    model: "chosen-model",
                    defaultReasoningEffort: "xhigh",
                    isDefault: true,
                  },
                ],
                nextCursor: null,
              },
      })
    }
  }
  process.exit(scenario.settingsExit ?? 0)
}

process.on("SIGTERM", () => {
  void writeFile(join(root, "stopped"), "SIGTERM").then(() => process.exit(0))
})

if (args[0] === "resume" || args[0] === "--resume") {
  const continuation = scenario.interactive
  if (continuation?.usage !== undefined) {
    const bytes = Buffer.from(continuation.usage.text)
    const size = continuation.chunkSize ?? bytes.length
    for (let offset = 0; offset < bytes.length; offset += size) {
      await appendFile(
        continuation.usage.path,
        bytes.subarray(offset, offset + size),
      )
      if (continuation.chunkSize !== undefined) await setTimeout(1)
    }
    if (continuation.waitForFile !== undefined) {
      while (true) {
        try {
          await readFile(continuation.waitForFile)
          break
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          await setTimeout(10)
        }
      }
    }
    if (continuation.finalText !== undefined)
      await appendFile(continuation.usage.path, continuation.finalText)
  }
  if (continuation?.wait) await new Promise(() => setInterval(() => {}, 1000))
  process.exit(continuation?.exitCode ?? scenario.exitCode ?? 0)
}

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
    send({
      type: "control_response",
      response: {
        request_id: "audit-round-settings",
        subtype: scenario.settingsMode === "error" ? "error" : "success",
        response: { applied: { model: "claude-model", effort: "high" } },
      },
    })
    process.exit(0)
  }
}

scenario = { ...scenario, ...scenario.assistants?.[assistant] }
if (scenario.phases !== undefined) {
  const phase = /^Run the (audit|vet|rebut|fix|brief) phase /.exec(
    prompt ?? "",
  )?.[1]
  if (phase === undefined) throw new Error("Fixture received no phase prompt")
  scenario = { ...scenario, ...scenario.phases[phase] }
}

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
