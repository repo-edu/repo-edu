import {
  checkbox,
  password,
  select,
  input as textInput,
} from "@inquirer/prompts"
import type { TerminalPromptControl } from "./terminal-output.js"

export type HumanReviewPermission = "file-system" | "network"

export type HumanReviewQuestion = {
  readonly id: string
  readonly header: string
  readonly question: string
  readonly options: readonly {
    readonly label: string
    readonly description: string
  }[]
  readonly allowOther: boolean
  readonly secret: boolean
}

type HumanReviewRequestBase = {
  readonly requestId: string
  readonly summary: string
}

export type HumanReviewRequest =
  | (HumanReviewRequestBase & {
      readonly category: "command" | "file-change"
      readonly allowSession: boolean
    })
  | (HumanReviewRequestBase & {
      readonly category: "permission"
      readonly permissions: readonly HumanReviewPermission[]
    })
  | (HumanReviewRequestBase & {
      readonly category: "user-input"
      readonly questions: readonly HumanReviewQuestion[]
    })

export type HumanReviewResponse =
  | {
      readonly decision:
        | "accepted"
        | "accepted-for-session"
        | "declined"
        | "cancelled"
        | "cleared"
    }
  | {
      readonly decision: "permissions"
      readonly permissions: readonly HumanReviewPermission[]
      readonly scope: "turn" | "session"
    }
  | {
      readonly decision: "answered"
      readonly answers: Readonly<Record<string, readonly string[]>>
    }

export type HumanReviewPort = {
  review(request: HumanReviewRequest): Promise<HumanReviewResponse>
  clear(requestId: string): boolean
  dispose(): void
}

type InteractiveInput = NodeJS.ReadableStream & { readonly isTTY?: boolean }
type InteractiveOutput = NodeJS.WritableStream & { readonly isTTY?: boolean }

type PromptContext = {
  readonly input: NodeJS.ReadableStream
  readonly output: NodeJS.WritableStream
  readonly signal: AbortSignal
}

export type HumanReviewPromptDriver = {
  select(options: {
    readonly message: string
    readonly choices: readonly {
      readonly name: string
      readonly value: string
      readonly description?: string
    }[]
    readonly context: PromptContext
  }): Promise<string>
  checkbox(options: {
    readonly message: string
    readonly choices: readonly {
      readonly name: string
      readonly value: string
      readonly description?: string
    }[]
    readonly context: PromptContext
  }): Promise<readonly string[]>
  text(options: {
    readonly message: string
    readonly secret: boolean
    readonly context: PromptContext
  }): Promise<string>
}

export const inquirerHumanReviewPromptDriver: HumanReviewPromptDriver = {
  select: ({ message, choices, context }) =>
    select({ message, choices }, { ...context, clearPromptOnDone: true }),
  checkbox: ({ message, choices, context }) =>
    checkbox(
      { message, choices, required: false },
      { ...context, clearPromptOnDone: true },
    ),
  text: ({ message, secret, context }) =>
    secret
      ? password(
          { message, mask: "*" },
          { ...context, clearPromptOnDone: true },
        )
      : textInput({ message }, { ...context, clearPromptOnDone: true }),
}

export class HumanReviewAdmissionError extends Error {
  override readonly name = "HumanReviewAdmissionError"
}

type QueueEntry = {
  readonly request: HumanReviewRequest
  readonly completion: PromiseWithResolvers<HumanReviewResponse>
  forcedDecision: "cancelled" | "cleared" | null
  controller: AbortController | null
}

export type TerminalHumanReviewOptions = {
  readonly input: InteractiveInput
  readonly output: InteractiveOutput
  readonly prompts?: HumanReviewPromptDriver
  readonly signal?: AbortSignal
  readonly terminal: TerminalPromptControl
}

function isPromptCancellation(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "ExitPromptError")
  )
}

function approvalChoices(allowSession: boolean) {
  return [
    { name: "Approve this action", value: "accepted" },
    ...(allowSession
      ? [
          {
            name: "Approve for this session",
            value: "accepted-for-session",
          },
        ]
      : []),
    { name: "Decline and continue", value: "declined" },
    { name: "Cancel the turn", value: "cancelled" },
  ] as const
}

function permissionName(permission: HumanReviewPermission): string {
  return permission === "file-system" ? "File-system access" : "Network access"
}

function questionChoiceValue(index: number): string {
  return `option:${index}`
}

async function askQuestion(
  question: HumanReviewQuestion,
  prompts: HumanReviewPromptDriver,
  context: PromptContext,
): Promise<readonly string[]> {
  if (question.options.length === 0) {
    return [
      await prompts.text({
        message: `${question.header}: ${question.question}`,
        secret: question.secret,
        context,
      }),
    ]
  }

  const other = "other"
  const selected = await prompts.select({
    message: `${question.header}: ${question.question}`,
    choices: [
      ...question.options.map((option, index) => ({
        name: option.label,
        value: questionChoiceValue(index),
        description: option.description,
      })),
      ...(question.allowOther
        ? [{ name: "Enter another answer", value: other }]
        : []),
    ],
    context,
  })
  if (selected === other) {
    return [
      await prompts.text({
        message: `${question.header}: other answer`,
        secret: question.secret,
        context,
      }),
    ]
  }
  const index = Number.parseInt(selected.slice("option:".length), 10)
  const option = question.options[index]
  if (option === undefined) {
    throw new Error(
      `The human-review prompt returned unknown choice ${selected}.`,
    )
  }
  return [option.label]
}

async function promptForRequest(
  request: HumanReviewRequest,
  prompts: HumanReviewPromptDriver,
  context: PromptContext,
): Promise<HumanReviewResponse> {
  switch (request.category) {
    case "command":
    case "file-change": {
      const decision = await prompts.select({
        message: request.summary,
        choices: approvalChoices(request.allowSession),
        context,
      })
      if (
        decision !== "accepted" &&
        decision !== "accepted-for-session" &&
        decision !== "declined" &&
        decision !== "cancelled"
      ) {
        throw new Error(
          `The human-review prompt returned unknown decision ${decision}.`,
        )
      }
      return { decision }
    }
    case "permission": {
      const selected = await prompts.checkbox({
        message: request.summary,
        choices: request.permissions.map((permission) => ({
          name: permissionName(permission),
          value: permission,
        })),
        context,
      })
      const permissions = request.permissions.filter((permission) =>
        selected.includes(permission),
      )
      if (permissions.length === 0) return { decision: "declined" }
      const scope = await prompts.select({
        message: "How long should these permissions apply?",
        choices: [
          { name: "This turn", value: "turn" },
          { name: "This session", value: "session" },
        ],
        context,
      })
      if (scope !== "turn" && scope !== "session") {
        throw new Error(
          `The human-review prompt returned unknown scope ${scope}.`,
        )
      }
      return { decision: "permissions", permissions, scope }
    }
    case "user-input": {
      const answers: Record<string, readonly string[]> = {}
      for (const question of request.questions) {
        answers[question.id] = await askQuestion(question, prompts, context)
      }
      return { decision: "answered", answers }
    }
  }
}

export function createTerminalHumanReviewPort(
  options: TerminalHumanReviewOptions,
): HumanReviewPort {
  if (options.input.isTTY !== true || options.output.isTTY !== true) {
    throw new HumanReviewAdmissionError(
      "Plan implementation requires interactive terminal input and output for attended review.",
    )
  }

  const prompts = options.prompts ?? inquirerHumanReviewPromptDriver
  const queue: QueueEntry[] = []
  let active: QueueEntry | null = null
  let disposed = false

  const pump = (): void => {
    if (disposed || active !== null) return
    const entry = queue.shift()
    if (entry === undefined) return
    active = entry
    const controller = new AbortController()
    entry.controller = controller
    const context = {
      input: options.input,
      output: options.output,
      signal: controller.signal,
    }
    void options.terminal
      .prompt(() => promptForRequest(entry.request, prompts, context))
      .then((response) => {
        entry.completion.resolve(
          entry.forcedDecision === null
            ? response
            : { decision: entry.forcedDecision },
        )
      })
      .catch((error: unknown) => {
        if (entry.forcedDecision !== null) {
          entry.completion.resolve({ decision: entry.forcedDecision })
        } else if (isPromptCancellation(error)) {
          entry.completion.resolve({ decision: "cancelled" })
        } else {
          entry.completion.reject(error)
        }
      })
      .finally(() => {
        entry.controller = null
        if (active === entry) active = null
        pump()
      })
  }

  const cancel = (entry: QueueEntry, decision: "cancelled" | "cleared") => {
    entry.forcedDecision = decision
    entry.controller?.abort()
  }
  const stop = (): void => {
    if (disposed) return
    disposed = true
    options.signal?.removeEventListener("abort", stop)
    if (active !== null) cancel(active, "cancelled")
    for (const entry of queue.splice(0)) {
      entry.completion.resolve({ decision: "cancelled" })
    }
  }

  options.signal?.addEventListener("abort", stop, { once: true })
  if (options.signal?.aborted) stop()

  return {
    review(request) {
      if (disposed) return Promise.resolve({ decision: "cancelled" })
      const entry: QueueEntry = {
        request,
        completion: Promise.withResolvers<HumanReviewResponse>(),
        forcedDecision: null,
        controller: null,
      }
      queue.push(entry)
      pump()
      return entry.completion.promise
    },
    clear(requestId) {
      if (active?.request.requestId === requestId) {
        cancel(active, "cleared")
        return true
      }
      const index = queue.findIndex(
        (entry) => entry.request.requestId === requestId,
      )
      if (index < 0) return false
      const [entry] = queue.splice(index, 1)
      entry?.completion.resolve({ decision: "cleared" })
      return true
    },
    dispose: stop,
  }
}
