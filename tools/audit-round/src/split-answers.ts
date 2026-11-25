import { readdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { execa } from "execa"
import { z } from "zod"
import type { ExecutionContext } from "./context.js"
import { type MoveList, readMoveList } from "./move-list.js"
import { efforts } from "./phase.js"
import {
  designFilename,
  designsFilename,
  readDesignFilename,
  seriesArchiveFolder,
  splitLabel,
} from "./round-paths.js"
import { densitySchema } from "./settings.js"
import { numberedListPath, splitSource } from "./target.js"

const designRecord = z.strictObject({
  number: z.int().positive(),
  tag: z.string().regex(/^[ao][btu][lmhx]$/),
  model: z.string().min(1),
  effort: z.enum(efforts),
  designer: z.int().positive().nullable(),
  density: densitySchema.nullable(),
})
export type DesignRecord = z.infer<typeof designRecord>
export type Writer = Pick<DesignRecord, "tag" | "model" | "effort">
export type Answer = ReturnType<typeof answer>

export function answer(text: string, record: DesignRecord, source: string) {
  const list = readMoveList(text)
  if (list.source !== source)
    throw new Error(
      `Answer ${record.number} names ${list.source}, expected ${source}`,
    )
  return { text, list, record }
}

export async function nextDesignNumber(folder: string, label: string) {
  let last = 0
  for (const name of await readdir(folder)) {
    const saved = readDesignFilename(name)
    if (saved?.label === label) last = Math.max(last, saved.number)
  }
  return last + 1
}

async function designRecords(folder: string, label: string) {
  let text: string
  try {
    text = await readFile(join(folder, designsFilename(label)), "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  return z.array(designRecord).parse(JSON.parse(text))
}

export async function saveAnswers(
  folder: string,
  label: string,
  answers: readonly Answer[],
) {
  if (answers.length === 0) return
  const records = await designRecords(folder, label)
  for (const { text, record } of answers) {
    await writeFile(
      join(folder, designFilename(label, record.number, record.tag)),
      text,
    )
    records.push(record)
  }
  await writeFile(
    join(folder, designsFilename(label)),
    JSON.stringify(records, null, 2) + "\n",
  )
}

export type NamedAnswer = {
  list: MoveList
  text: string
  number: number
  tag?: string
}

/** Read the exact file the user named before its evidence folder is restored. */
export async function namedAnswer(
  context: ExecutionContext,
  cwd: string,
  value: string,
): Promise<NamedAnswer> {
  const path = resolve(cwd, value)
  const saved = readDesignFilename(basename(path))
  if (saved !== null) {
    const folder = dirname(path)
    if (
      folder !== context.roundRoot &&
      folder !== seriesArchiveFolder(context.evidenceRoot, "split", saved.label)
    )
      throw new Error("Name a designer's answer in the evidence checkout")
    const text = await readFile(path, "utf8")
    const list = readMoveList(text)
    const source = await splitSource(context.repoEduRoot, list.source)
    if (splitLabel(source) !== saved.label)
      throw new Error("The answer's file name and source disagree")
    return { list, text, number: saved.number, tag: saved.tag }
  }
  const file = value.startsWith("splits/")
    ? value
    : relative(context.planRoot, path)
  const number = /\.(\d{2,})\.mv\.md$/.exec(file)?.[1]
  if (!file.startsWith("splits/") || number === undefined)
    throw new Error("Name a numbered committed list or a designer's answer")
  const text = (
    await execa("git", ["show", `HEAD:${file}`], {
      cwd: context.planRoot,
      stripFinalNewline: false,
    })
  ).stdout
  const list = readMoveList(text)
  const source = await splitSource(context.repoEduRoot, list.source)
  if (file !== numberedListPath(source, Number(number)))
    throw new Error("The list's file name and source disagree")
  return { list, text, number: Number(number) }
}

export async function savedAnswer(
  folder: string,
  label: string,
  named: NamedAnswer,
) {
  const records = await designRecords(folder, label)
  const record = records.find((entry) => entry.number === named.number)
  if (
    !record ||
    (named.tag !== undefined &&
      (record.designer === null || record.tag !== named.tag))
  )
    throw new Error(`No matching writer record for answer ${named.number}`)
  return { text: named.text, list: named.list, record }
}
