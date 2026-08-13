import { execFile } from "node:child_process"
import { readFile, realpath } from "node:fs/promises"
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path"
import { fromMarkdown } from "mdast-util-from-markdown"
import { z } from "zod"
import type {
  CommittedImplementationPlan,
  PlanImplementationStep,
  PlanProof,
  PlanSourceIdentity,
  PlanSourceSpan,
} from "./contracts.js"

const implementationHeading = "Implementation plan"
const proofBlockLanguage = "repo-edu-proofs"
const gitOutputLimit = 16 * 1024 * 1024

type MarkdownNode = {
  readonly type: string
  readonly children?: readonly MarkdownNode[]
  readonly depth?: number
  readonly lang?: string | null
  readonly ordered?: boolean | null
  readonly start?: number | null
  readonly value?: unknown
  readonly position?: {
    readonly start: {
      readonly line: number
      readonly column: number
      readonly offset?: number
    }
    readonly end: {
      readonly line: number
      readonly column: number
      readonly offset?: number
    }
  }
}

type GitOutput = {
  readonly stdout: Buffer
  readonly stderr: Buffer
}

const nonBlankString = z.string().refine((value) => value.trim().length > 0, {
  message: "Must contain a non-whitespace character.",
})

const machineProofSchema = z.strictObject({
  program: nonBlankString,
  arguments: z.array(z.string()),
})

const userActionProofSchema = z.strictObject({
  "user-action": nonBlankString,
})

const proofListSchema = z.array(
  z.union([machineProofSchema, userActionProofSchema]),
)

export class PlanReaderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "PlanReaderError"
  }
}

function runGit(
  cwd: string,
  arguments_: readonly string[],
): Promise<GitOutput> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "git",
      ["--literal-pathspecs", ...arguments_],
      {
        cwd,
        encoding: null,
        maxBuffer: gitOutputLimit,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolvePromise({ stdout, stderr })
      },
    )
  })
}

async function readGitText(
  cwd: string,
  arguments_: readonly string[],
  failureMessage: string,
): Promise<string> {
  try {
    const { stdout } = await runGit(cwd, arguments_)
    return stdout.toString("utf8").replace(/\r?\n$/, "")
  } catch (error) {
    throw new PlanReaderError(failureMessage, { cause: error })
  }
}

function markdownText(node: MarkdownNode): string {
  if (typeof node.value === "string") {
    return node.value
  }
  return node.children?.map(markdownText).join("") ?? ""
}

function sourceSpan(node: MarkdownNode, description: string): PlanSourceSpan {
  const { position } = node
  if (
    !position ||
    position.start.offset === undefined ||
    position.end.offset === undefined
  ) {
    throw new PlanReaderError(`${description} has no Markdown source span.`)
  }
  return {
    start: {
      line: position.start.line,
      column: position.start.column,
      offset: position.start.offset,
    },
    end: {
      line: position.end.line,
      column: position.end.column,
      offset: position.end.offset,
    },
  }
}

function collectProofBlocks(node: MarkdownNode): readonly MarkdownNode[] {
  const blocks: MarkdownNode[] = []
  function visit(current: MarkdownNode): void {
    if (current.type === "code" && current.lang === proofBlockLanguage) {
      blocks.push(current)
    }
    for (const child of current.children ?? []) {
      visit(child)
    }
  }
  visit(node)
  return blocks
}

function proofIssueMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "proof list" : issue.path.join(".")
      return `${path}: ${issue.message}`
    })
    .join("; ")
}

function parseProofBlock(
  block: MarkdownNode,
  stepNumber: number,
): readonly PlanProof[] {
  let decoded: unknown
  try {
    decoded = JSON.parse(String(block.value)) as unknown
  } catch (error) {
    throw new PlanReaderError(
      `Implementation step ${stepNumber} has invalid JSON in its ${proofBlockLanguage} block.`,
      { cause: error },
    )
  }
  const result = proofListSchema.safeParse(decoded)
  if (!result.success) {
    throw new PlanReaderError(
      `Implementation step ${stepNumber} has invalid ${proofBlockLanguage} data: ${proofIssueMessage(result.error)}`,
    )
  }
  return result.data
}

function stepTitle(step: MarkdownNode, stepNumber: number): string {
  const firstParagraph = step.children?.find(
    (child) => child.type === "paragraph",
  )
  if (!firstParagraph) {
    return `Step ${stepNumber}`
  }
  const strongTitle = firstParagraph.children?.find(
    (child) => child.type === "strong",
  )
  const title = markdownText(strongTitle ?? firstParagraph)
    .replace(/\s+/g, " ")
    .trim()
  return title.length > 0 ? title.replace(/[.:]\s*$/, "") : `Step ${stepNumber}`
}

function parseImplementationSteps(root: MarkdownNode): {
  readonly implementationListSpan: PlanSourceSpan
  readonly steps: readonly PlanImplementationStep[]
} {
  const rootChildren = root.children ?? []
  const headingIndexes = rootChildren.flatMap((node, index) =>
    node.type === "heading" &&
    node.depth === 2 &&
    markdownText(node).trim() === implementationHeading
      ? [index]
      : [],
  )
  if (headingIndexes.length !== 1) {
    throw new PlanReaderError(
      `The plan must contain exactly one ## ${implementationHeading} section; found ${headingIndexes.length}.`,
    )
  }

  const sectionStart = headingIndexes[0] + 1
  const nextSectionOffset = rootChildren
    .slice(sectionStart)
    .findIndex(
      (node) =>
        node.type === "heading" && node.depth !== undefined && node.depth <= 2,
    )
  const sectionEnd =
    nextSectionOffset === -1
      ? rootChildren.length
      : sectionStart + nextSectionOffset
  const sectionNodes = rootChildren.slice(sectionStart, sectionEnd)
  const implementationLists = sectionNodes.filter(
    (node) => node.type === "list" && node.ordered === true,
  )
  if (implementationLists.length !== 1) {
    throw new PlanReaderError(
      `The ## ${implementationHeading} section must contain exactly one top-level ordered list; found ${implementationLists.length}.`,
    )
  }

  const implementationList = implementationLists[0]
  if ((implementationList.start ?? 1) !== 1) {
    throw new PlanReaderError("The implementation list must start at step 1.")
  }
  const listItems = implementationList.children ?? []
  if (listItems.length === 0) {
    throw new PlanReaderError("The implementation list must contain a step.")
  }

  const sectionProofCount = sectionNodes.reduce(
    (count, node) => count + collectProofBlocks(node).length,
    0,
  )
  let stepProofCount = 0
  const steps = listItems.map((item, index): PlanImplementationStep => {
    const number = index + 1
    const proofBlocks = collectProofBlocks(item)
    stepProofCount += proofBlocks.length
    if (proofBlocks.length > 1) {
      throw new PlanReaderError(
        `Implementation step ${number} contains ${proofBlocks.length} ${proofBlockLanguage} blocks; at most one is allowed.`,
      )
    }
    const proofBlock = proofBlocks[0]
    return {
      number,
      title: stepTitle(item, number),
      sourceSpan: sourceSpan(item, `Implementation step ${number}`),
      proofs: {
        items: proofBlock ? parseProofBlock(proofBlock, number) : [],
        sourceSpan: proofBlock
          ? sourceSpan(proofBlock, `Implementation step ${number} proof block`)
          : null,
      },
    }
  })
  if (stepProofCount !== sectionProofCount) {
    throw new PlanReaderError(
      `Every ${proofBlockLanguage} block in the implementation section must belong to a top-level step.`,
    )
  }

  return {
    implementationListSpan: sourceSpan(
      implementationList,
      "Implementation list",
    ),
    steps,
  }
}

function planName(planPath: string): string {
  if (extname(planPath) !== ".md") {
    throw new PlanReaderError("The plan path must name a Markdown file.")
  }
  const fileStem = basename(planPath, ".md")
  const name = fileStem.startsWith("plan-") ? fileStem.slice(5) : fileStem
  if (name.length === 0) {
    throw new PlanReaderError("The plan path must have a non-empty plan name.")
  }
  return name
}

function repositoryPath(repositoryRoot: string, planPath: string): string {
  const relativePath = relative(repositoryRoot, planPath)
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new PlanReaderError("The plan file is outside its Git checkout.")
  }
  return relativePath.split(sep).join("/")
}

function parseBlobOid(lsTreeOutput: Buffer, relativePlanPath: string): string {
  const records = lsTreeOutput.toString("utf8").split("\0").filter(Boolean)
  if (records.length !== 1) {
    throw new PlanReaderError("The plan file is not committed at HEAD.")
  }
  const headerEnd = records[0].indexOf("\t")
  const header = headerEnd === -1 ? "" : records[0].slice(0, headerEnd)
  const returnedPath = headerEnd === -1 ? "" : records[0].slice(headerEnd + 1)
  const [mode, objectType, oid] = header.split(" ")
  if (
    mode !== "100644" ||
    objectType !== "blob" ||
    !oid ||
    !/^[0-9a-f]+$/.test(oid) ||
    returnedPath !== relativePlanPath
  ) {
    throw new PlanReaderError(
      `The committed plan must be a regular file: ${relativePlanPath}.`,
    )
  }
  return oid
}

async function readSourceIdentity(absolutePlanPath: string): Promise<{
  readonly identity: PlanSourceIdentity
  readonly committedBytes: Buffer
}> {
  const repositoryRoot = resolve(
    await readGitText(
      dirname(absolutePlanPath),
      ["rev-parse", "--show-toplevel"],
      "The plan file is not inside a Git checkout.",
    ),
  )
  const relativePlanPath = repositoryPath(repositoryRoot, absolutePlanPath)
  let lsTreeOutput: GitOutput
  try {
    lsTreeOutput = await runGit(repositoryRoot, [
      "ls-tree",
      "-z",
      "--full-name",
      "HEAD",
      "--",
      relativePlanPath,
    ])
  } catch (error) {
    throw new PlanReaderError("The plan file is not committed at HEAD.", {
      cause: error,
    })
  }
  const blobOid = parseBlobOid(lsTreeOutput.stdout, relativePlanPath)
  const commitOid = await readGitText(
    repositoryRoot,
    ["log", "-1", "--format=%H", "--", relativePlanPath],
    "Git could not resolve the plan file's last-touch commit.",
  )
  if (!/^[0-9a-f]+$/.test(commitOid)) {
    throw new PlanReaderError(
      "Git did not return a full lowercase plan source commit ID.",
    )
  }
  let committedBytes: Buffer
  try {
    committedBytes = (
      await runGit(repositoryRoot, ["cat-file", "blob", blobOid])
    ).stdout
  } catch (error) {
    throw new PlanReaderError("Git could not read the committed plan blob.", {
      cause: error,
    })
  }
  return {
    identity: {
      planName: planName(absolutePlanPath),
      planPath: absolutePlanPath,
      commitOid,
      blobOid,
    },
    committedBytes,
  }
}

export async function readCommittedImplementationPlan(
  planPath: string,
): Promise<CommittedImplementationPlan> {
  const absolutePlanPath = await realpath(resolve(planPath))
  const workingBytes = await readFile(absolutePlanPath)
  const { identity, committedBytes } =
    await readSourceIdentity(absolutePlanPath)
  if (!workingBytes.equals(committedBytes)) {
    throw new PlanReaderError(
      "The plan file's working bytes do not match its committed Git blob.",
    )
  }
  const markdown = workingBytes.toString("utf8")
  if (!Buffer.from(markdown, "utf8").equals(workingBytes)) {
    throw new PlanReaderError("The committed plan is not valid UTF-8.")
  }
  const parsed = parseImplementationSteps(fromMarkdown(markdown))
  return {
    source: identity,
    markdown,
    ...parsed,
  }
}
