export interface Project {
  name: string
  assignment: string
  complexity: number
}

export function projectToMarkdown(project: Project): string {
  return [
    `# ${project.name}`,
    "",
    `Complexity: ${project.complexity}`,
    "",
    "## Assignment",
    "",
    project.assignment,
    "",
  ].join("\n")
}

export function markdownToProject(md: string): Project {
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

  let complexity: number | undefined
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
    const kv = lines[i].trim().match(/^([A-Za-z-]+):\s*(.+)$/)
    if (!kv)
      throw new Error(`expected 'Key: value' meta line, got: ${lines[i]}`)
    const [, key, value] = kv
    switch (key) {
      case "Complexity":
        complexity = Number(value)
        break
      default:
        throw new Error(`unknown project meta key: ${key}`)
    }
    i++
  }
  if (complexity === undefined) {
    throw new Error("project missing Complexity meta")
  }

  skipBlank()
  if (lines[i]?.trim() !== "## Assignment") {
    throw new Error(`expected '## Assignment', got: ${lines[i] ?? "<eof>"}`)
  }
  i++
  skipBlank()

  const assignmentLines: string[] = []
  while (i < lines.length && !lines[i].startsWith("##")) {
    assignmentLines.push(lines[i])
    i++
  }
  const assignment = assignmentLines.join("\n").trim()
  if (!assignment) throw new Error("project has empty assignment")

  return { name, assignment, complexity }
}
