import { STYLES, type Style } from "./constants"

export type CommitKind = "build" | "review"

export interface TeamMember {
  name: string
  email: string
  area: string
  module: string
}

export interface PlannedCommit {
  date: string
  author_index: number
  kind: CommitKind
  note: string
  message: string
}

export interface Plan {
  team: TeamMember[]
  commits: PlannedCommit[]
}

export interface PlanMeta {
  project: string
  projectFile: string
  planner: string
  aiCoders: boolean
  rounds: number
  students: number
  reviews: number
  coderInteraction: number
  style: Style
}

export interface PlanFile {
  meta: PlanMeta
  plan: Plan
}

export function planToMarkdown(file: PlanFile): string {
  const { meta, plan } = file
  const lines: string[] = []
  lines.push(`# ${meta.project}`, "")
  lines.push(`Project-file: ${meta.projectFile}`)
  lines.push(`Planner: ${meta.planner}`)
  lines.push(`Ai-coders: ${meta.aiCoders}`)
  lines.push(`Rounds: ${meta.rounds}`)
  lines.push(`Students: ${meta.students}`)
  lines.push(`Reviews: ${meta.reviews}`)
  lines.push(`Coder-interaction: ${meta.coderInteraction}`)
  lines.push(`Style: ${meta.style}`)
  lines.push("", "## Team", "")
  plan.team.forEach((m, i) => {
    lines.push(
      `${i + 1}. **${m.name}** \`<${m.email}>\` — ${m.area} · primary module \`${m.module}\``,
    )
  })
  lines.push("", "## Commits")
  plan.commits.forEach((c, i) => {
    lines.push(
      "",
      `### ${i + 1}. ${c.kind} · ${c.date} · author ${c.author_index}`,
      "",
      `Note: ${c.note}`,
      `Fallback: ${c.message}`,
    )
  })
  lines.push("")
  return lines.join("\n")
}

export function markdownToPlan(md: string): PlanFile {
  const lines = md.split("\n")
  let i = 0
  const skipBlank = () => {
    while (i < lines.length && !lines[i].trim()) i++
  }

  skipBlank()
  const slugMatch = lines[i]?.match(/^#\s+(.+)$/)
  if (!slugMatch) throw new Error("expected '# <project>' as first heading")
  const project = slugMatch[1].trim()
  i++
  skipBlank()

  const meta: Partial<PlanMeta> = { project }
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
    const line = lines[i].trim()
    const kv = line.match(/^([A-Za-z-]+):\s*(.+)$/)
    if (!kv) throw new Error(`expected 'Key: value' meta line, got: ${line}`)
    const [, key, value] = kv
    switch (key) {
      case "Project-file":
        meta.projectFile = value
        break
      case "Planner":
        meta.planner = value
        break
      case "Ai-coders":
        if (value !== "true" && value !== "false") {
          throw new Error(`Ai-coders must be true|false, got: ${value}`)
        }
        meta.aiCoders = value === "true"
        break
      case "Students":
        meta.students = Number(value)
        break
      case "Rounds":
        meta.rounds = Number(value)
        break
      case "Reviews":
        meta.reviews = Number(value)
        break
      case "Coder-interaction":
        meta.coderInteraction = Number(value)
        break
      case "Style":
        if (!STYLES.includes(value as Style)) {
          throw new Error(
            `Style must be one of ${STYLES.join(", ")}, got: ${value}`,
          )
        }
        meta.style = value as Style
        break
      default:
        throw new Error(`unknown plan meta key: ${key}`)
    }
    i++
  }
  if (
    meta.projectFile === undefined ||
    meta.planner === undefined ||
    meta.aiCoders === undefined ||
    meta.students === undefined ||
    meta.rounds === undefined ||
    meta.reviews === undefined ||
    meta.coderInteraction === undefined ||
    meta.style === undefined
  ) {
    throw new Error(
      "missing plan meta fields (need Project-file, Planner, Ai-coders, Students, Rounds, Reviews, Coder-interaction, Style)",
    )
  }

  const expectHeading = (expected: string) => {
    skipBlank()
    if (lines[i]?.trim() !== expected) {
      throw new Error(`expected '${expected}', got: ${lines[i] ?? "<eof>"}`)
    }
    i++
  }

  expectHeading("## Team")
  const team: TeamMember[] = []
  const teamLine =
    /^\d+\. \*\*(.+?)\*\* `<(.+?)>` — (.+?) · primary module `(.+?)`$/
  while (i < lines.length && !lines[i].startsWith("##")) {
    const line = lines[i].trim()
    if (line) {
      const m = line.match(teamLine)
      if (!m) throw new Error(`malformed team line: ${line}`)
      team.push({ name: m[1], email: m[2], area: m[3], module: m[4] })
    }
    i++
  }

  expectHeading("## Commits")
  const commits: PlannedCommit[] = []
  const commitHeader = /^### \d+\. (build|review) · (.+?) · author (\d+)$/
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }
    const header = line.match(commitHeader)
    if (!header) {
      throw new Error(`expected '### N. kind · date · author N', got: ${line}`)
    }
    const [, kind, date, authorStr] = header
    i++
    skipBlank()

    let note = ""
    let message = ""
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("###")) {
      const bodyLine = lines[i]
      if (bodyLine.startsWith("Note: ")) note = bodyLine.slice("Note: ".length)
      else if (bodyLine.startsWith("Fallback: "))
        message = bodyLine.slice("Fallback: ".length)
      else throw new Error(`unexpected commit body line: ${bodyLine}`)
      i++
    }
    if (!note) throw new Error(`commit ${commits.length + 1} missing Note line`)
    if (!message)
      throw new Error(`commit ${commits.length + 1} missing Fallback line`)

    commits.push({
      date,
      author_index: Number(authorStr),
      kind: kind as CommitKind,
      note,
      message,
    })
  }

  return { meta: meta as PlanMeta, plan: { team, commits } }
}
