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
  name: string
  assignment: string
  team: TeamMember[]
  commits: PlannedCommit[]
}

export interface PlanMeta {
  rounds: number
  complexity: number
  students: number
  untilDone: boolean
  ceiling?: number
}

export interface PlanFile {
  meta: PlanMeta
  plan: Plan
}

export function planToMarkdown(file: PlanFile): string {
  const { meta, plan } = file
  const lines: string[] = []
  lines.push(`# ${plan.name}`, "")
  lines.push(`Complexity: ${meta.complexity}`)
  lines.push(`Students: ${meta.students}`)
  lines.push(`Rounds: ${meta.rounds}`)
  lines.push(
    meta.untilDone
      ? `Until-done: yes (ceiling ${meta.ceiling ?? plan.commits.length})`
      : "Until-done: no",
  )
  lines.push("", "## Assignment", "", plan.assignment, "", "## Team", "")
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
  if (!slugMatch) throw new Error("expected '# <slug>' as first heading")
  const name = slugMatch[1].trim()
  i++
  skipBlank()

  const meta: Partial<PlanMeta> = {}
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
    const line = lines[i].trim()
    const kv = line.match(/^([A-Za-z-]+):\s*(.+)$/)
    if (!kv) throw new Error(`expected 'Key: value' meta line, got: ${line}`)
    const [, key, value] = kv
    switch (key) {
      case "Complexity":
        meta.complexity = Number(value)
        break
      case "Students":
        meta.students = Number(value)
        break
      case "Rounds":
        meta.rounds = Number(value)
        break
      case "Until-done": {
        meta.untilDone = value.toLowerCase().startsWith("yes")
        const ceiling = value.match(/ceiling\s+(\d+)/)
        if (ceiling) meta.ceiling = Number(ceiling[1])
        break
      }
      default:
        throw new Error(`unknown meta key: ${key}`)
    }
    i++
  }
  if (
    meta.complexity === undefined ||
    meta.students === undefined ||
    meta.rounds === undefined ||
    meta.untilDone === undefined
  ) {
    throw new Error(
      "missing meta fields (need Complexity, Students, Rounds, Until-done)",
    )
  }

  const expectHeading = (expected: string) => {
    skipBlank()
    if (lines[i]?.trim() !== expected) {
      throw new Error(`expected '${expected}', got: ${lines[i] ?? "<eof>"}`)
    }
    i++
  }

  expectHeading("## Assignment")
  const assignmentLines: string[] = []
  while (i < lines.length && !lines[i].startsWith("##")) {
    assignmentLines.push(lines[i])
    i++
  }
  const assignment = assignmentLines.join("\n").trim()

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

  return { meta: meta as PlanMeta, plan: { name, assignment, team, commits } }
}

export function planFilename(meta: PlanMeta, slug: string): string {
  const ts = new Date().toISOString().replace(/[:-]/g, "").replace(/\..+$/, "Z")
  const u = meta.untilDone ? "u" : ""
  return `c${meta.complexity}-s${meta.students}-r${meta.rounds}${u}-${slug}-${ts}.md`
}
