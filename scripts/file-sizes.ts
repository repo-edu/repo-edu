import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { parseArgs } from "node:util"

const UNBOUNDED_SUBDIR_LEVEL = Number.MAX_SAFE_INTEGER

type Totals = {
  files: number
  lines: number
}

type SortMode = "alphabetical" | "size"

type LineCount = {
  name: string
  files: number
  lines: number
}

type FileLineCount = {
  name: string
  lines: number
}

type ScopedLineCount = LineCount & {
  fileEntries: FileLineCount[]
  subdirs: ScopedLineCount[]
}

type CliOptions = {
  showExtensions: boolean
  includeLock: boolean
  rootLabel: string
  rootDirPath: string
  showFiles: boolean
  sortMode: SortMode
  subdirLevel: number
}

function parseCliOptions(args: string[]): CliOptions {
  const usage =
    "Usage: pnpm file-sizes [<directory>] [--dir-level=<N> | -d=<N>] [--sort-numeric | -n] [--files | -f] [--include-lock | -l] [--extensions | -x] [--help | -h]"
  const helpText = [
    usage,
    "",
    "Options:",
    "  -d, --dir-level <N>  Show subfolders up to depth N (default: 2, 0 = all depths).",
    "  -x, --extensions     Show file extension analysis section.",
    "  -f, --files          Show per-file line counts in addition to per-folder sums.",
    "  -l, --include-lock   Include pnpm-lock.yaml in counts and output.",
    "  -n, --sort-numeric   Sort folders by total number of lines.",
    "  -h, --help           Show this help message.",
  ].join("\n")
  const normalizedArgs = args.filter((arg) => arg !== "--")

  let values: {
    "dir-level": string
    extensions: boolean
    files: boolean
    help: boolean
    "include-lock": boolean
    "sort-numeric": boolean
  }
  let positionals: string[] = []

  try {
    const parsed = parseArgs({
      args: normalizedArgs,
      allowPositionals: true,
      options: {
        "dir-level": {
          type: "string",
          short: "d",
          default: "2",
        },
        "sort-numeric": {
          type: "boolean",
          short: "n",
          default: false,
        },
        extensions: {
          type: "boolean",
          short: "x",
          default: false,
        },
        files: {
          type: "boolean",
          short: "f",
          default: false,
        },
        "include-lock": {
          type: "boolean",
          short: "l",
          default: false,
        },
        help: {
          type: "boolean",
          short: "h",
          default: false,
        },
      },
      strict: true,
    })

    positionals = parsed.positionals
    values = {
      "dir-level": parsed.values["dir-level"],
      extensions: parsed.values.extensions,
      files: parsed.values.files,
      help: parsed.values.help,
      "include-lock": parsed.values["include-lock"],
      "sort-numeric": parsed.values["sort-numeric"],
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${error.message}\n${usage}`)
    }
    throw error
  }

  if (values.help) {
    console.log(helpText)
    process.exit(0)
  }

  if (positionals.length === 0) {
    console.log(helpText)
    process.exit(0)
  }

  if (positionals.length > 1) {
    throw new Error(
      `Expected exactly one root-folder argument, received ${positionals.length}\n${usage}`,
    )
  }

  const rootDirPath = path.resolve(process.cwd(), positionals[0])
  if (!fs.existsSync(rootDirPath) || !fs.statSync(rootDirPath).isDirectory()) {
    throw new Error(
      `Root folder does not exist or is not a directory: ${positionals[0]}`,
    )
  }
  const normalizedLabel = positionals[0].trim()
  const rootLabel = normalizedLabel === "" ? "." : normalizedLabel

  return {
    showExtensions: values.extensions,
    includeLock: values["include-lock"],
    rootLabel,
    rootDirPath,
    showFiles: values.files,
    sortMode: values["sort-numeric"] ? "size" : "alphabetical",
    subdirLevel: parseSubdirLevelValue(values["dir-level"], "--dir-level"),
  }
}

function parseSubdirLevelValue(value: string, flagName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid value for ${flagName}: ${value}`)
  }
  const parsed = Number.parseInt(value, 10)
  return parsed === 0 ? UNBOUNDED_SUBDIR_LEVEL : parsed
}

function listFilesWithFd(dirPath: string, includeLock: boolean): string[] {
  const output = execFileSync(
    "fd",
    ["--type", "f", ".", dirPath, "--hidden", "--absolute-path", "--print0"],
    {
      encoding: "buffer",
    },
  )

  return output
    .toString("utf8")
    .split("\u0000")
    .filter((candidate) => candidate.length > 0)
    .filter((filePath) => {
      const basename = path.basename(filePath)
      if (basename === ".gitignore") return false
      if (basename === "pnpm-lock.yaml" && !includeLock) return false
      return true
    })
}

function getExtension(filePath: string): string {
  const extension = path.extname(filePath)
  return extension === "" ? "(no-ext)" : extension
}

function getSubdirBuckets(
  rootDirPath: string,
  filePath: string,
  subdirLevel: number,
): string[] {
  const relativePath = path.relative(rootDirPath, filePath)
  const segments = relativePath
    .split(path.sep)
    .filter((segment) => segment !== "")
  if (segments.length <= 1) return []

  const dirSegments = segments.slice(0, -1)
  const maxDepth = Math.min(subdirLevel, dirSegments.length)
  const buckets: string[] = []
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    buckets.push(dirSegments.slice(0, depth).join("/"))
  }
  return buckets
}

function compareBySortMode(
  left: LineCount,
  right: LineCount,
  sortMode: SortMode,
): number {
  if (sortMode === "size") {
    const lineDiff = right.lines - left.lines
    if (lineDiff !== 0) return lineDiff
    const fileDiff = right.files - left.files
    if (fileDiff !== 0) return fileDiff
  }

  return left.name.localeCompare(right.name)
}

function countLinesForDir(
  dirPath: string,
  label: string,
  includeLock: boolean,
  extensionTotals: Map<string, Totals>,
  subdirLevel: number,
  sortMode: SortMode,
): ScopedLineCount {
  const files = listFilesWithFd(dirPath, includeLock)
  const subdirTotals = new Map<string, Totals>()
  const fileEntries: FileLineCount[] = []
  let lines = 0

  for (const filePath of files) {
    const lineCount = countLines(filePath)
    lines += lineCount
    const relativePath = path
      .relative(dirPath, filePath)
      .split(path.sep)
      .join("/")
    fileEntries.push({ name: relativePath, lines: lineCount })

    const extension = getExtension(filePath)
    const totals = extensionTotals.get(extension) ?? { files: 0, lines: 0 }
    extensionTotals.set(extension, {
      files: totals.files + 1,
      lines: totals.lines + lineCount,
    })

    if (subdirLevel > 0) {
      const subdirBuckets = getSubdirBuckets(dirPath, filePath, subdirLevel)
      for (const subdirBucket of subdirBuckets) {
        const bucketTotals = subdirTotals.get(subdirBucket) ?? {
          files: 0,
          lines: 0,
        }
        subdirTotals.set(subdirBucket, {
          files: bucketTotals.files + 1,
          lines: bucketTotals.lines + lineCount,
        })
      }
    }
  }

  fileEntries.sort((left, right) => {
    if (sortMode === "size") {
      const lineDiff = right.lines - left.lines
      if (lineDiff !== 0) return lineDiff
    }
    return left.name.localeCompare(right.name)
  })

  const subdirsList =
    subdirLevel === 0
      ? []
      : [...subdirTotals.entries()]
          .map(([name, totals]) => ({
            name,
            files: totals.files,
            lines: totals.lines,
            fileEntries: [] as FileLineCount[],
            subdirs: [] as ScopedLineCount[],
          }))
          .sort((left, right) => compareBySortMode(left, right, sortMode))

  return {
    name: label,
    files: files.length,
    lines,
    fileEntries,
    subdirs: subdirsList,
  }
}

function isProbablyBinary(content: Buffer): boolean {
  const sampleSize = Math.min(content.length, 1024)
  for (let i = 0; i < sampleSize; i += 1) {
    if (content[i] === 0) return true
  }
  return false
}

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath)
  if (content.length === 0 || isProbablyBinary(content)) return 0

  let lines = 0
  for (const byte of content) {
    if (byte === 10) lines += 1
  }

  if (content[content.length - 1] !== 10) lines += 1
  return lines
}

type ColumnWidths = {
  name: number
  lines: number
  files: number
}

function printRow(entry: LineCount, widths: ColumnWidths): void {
  const name = entry.name.padEnd(widths.name, " ")
  const totalLn = String(entry.lines).padStart(widths.lines, " ")
  const totalFl = String(entry.files).padStart(widths.files, " ")
  console.log(`${name}  ${totalLn}  ${totalFl}`)
}

function printHeader(widths: ColumnWidths): void {
  const nameHeader = "Folder".padEnd(widths.name, " ")
  const totalGroupWidth = widths.lines + 2 + widths.files
  const totalGroup = "── Total ──".padStart(Math.max(11, totalGroupWidth))
  console.log(`${nameHeader}  ${totalGroup}`)
  const subHeader = "".padEnd(widths.name, " ")
  const totalLnH = "Lines".padStart(widths.lines, " ")
  const totalFlH = "Files".padStart(widths.files, " ")
  console.log(`${subHeader}  ${totalLnH}  ${totalFlH}`)
}

function subdirDepth(name: string): number {
  return name.split("/").length
}

function parentOf(name: string): string {
  const index = name.lastIndexOf("/")
  return index === -1 ? "" : name.slice(0, index)
}

function withTrailingSlash(name: string): string {
  return name.endsWith("/") ? name : `${name}/`
}

function sortIntoTreeOrder(subdirs: ScopedLineCount[]): ScopedLineCount[] {
  const result: ScopedLineCount[] = []
  const byParent = new Map<string, ScopedLineCount[]>()

  for (const subdir of subdirs) {
    const parent = parentOf(subdir.name)
    const siblings = byParent.get(parent) ?? []
    siblings.push(subdir)
    byParent.set(parent, siblings)
  }

  function visit(parentName: string): void {
    const children = byParent.get(parentName)
    if (!children) return
    for (const child of children) {
      result.push(child)
      visit(child.name)
    }
  }

  visit("")
  return result
}

function buildTreePrefix(
  subdir: ScopedLineCount,
  index: number,
  ordered: ScopedLineCount[],
): string {
  const depth = subdirDepth(subdir.name)
  const parent = parentOf(subdir.name)

  const isLast = ordered
    .slice(index + 1)
    .every((s) => parentOf(s.name) !== parent)

  let prefix = isLast ? "└── " : "├── "

  const segments = subdir.name.split("/")
  for (let d = depth - 2; d >= 0; d -= 1) {
    const ancestorName = segments.slice(0, d + 1).join("/")
    const ancestorParent = parentOf(ancestorName)

    const ancestorIsLast = ordered.slice(index + 1).every((s) => {
      const sAncestor = s.name
        .split("/")
        .slice(0, d + 1)
        .join("/")
      return (
        sAncestor === ancestorName || parentOf(sAncestor) !== ancestorParent
      )
    })
    prefix = (ancestorIsLast ? "    " : "│   ") + prefix
  }

  return prefix
}

function printCounts(
  counts: ScopedLineCount[],
  widths: ColumnWidths,
  subdirLevel: number,
): void {
  for (const entry of counts) {
    if (subdirLevel > 0) {
      console.log("")
    }
    printRow({ ...entry, name: withTrailingSlash(entry.name) }, widths)

    if (subdirLevel > 0) {
      const ordered = sortIntoTreeOrder(entry.subdirs)
      for (let i = 0; i < ordered.length; i += 1) {
        const subdir = ordered[i]
        const prefix = buildTreePrefix(subdir, i, ordered)
        const leaf = subdir.name.split("/").at(-1) ?? subdir.name
        printRow(
          { ...subdir, name: `${prefix}${withTrailingSlash(leaf)}` },
          widths,
        )
      }
    }
  }
}

function printExtensionCounts(
  extensionTotalsMap: Map<string, Totals>,
  sortMode: SortMode,
): void {
  const extensionCounts = [...extensionTotalsMap.entries()]
    .map(([extension, totals]) => ({
      extension,
      files: totals.files,
      lines: totals.lines,
    }))
    .sort((left, right) => {
      if (sortMode === "size") {
        const lineDiff = right.lines - left.lines
        if (lineDiff !== 0) return lineDiff
        const fileDiff = right.files - left.files
        if (fileDiff !== 0) return fileDiff
      }
      return left.extension.localeCompare(right.extension)
    })
  if (extensionCounts.length === 0) {
    console.log("No extensions found.")
    return
  }

  const extensionWidth = Math.max(
    ...extensionCounts.map((entry) => entry.extension.length),
  )
  const lineWidth = Math.max(
    ...extensionCounts.map((entry) => String(entry.lines).length),
  )
  const fileWidth = Math.max(
    ...extensionCounts.map((entry) => String(entry.files).length),
  )

  const headerExtension = "Folder".padEnd(extensionWidth, " ")
  const headerLines = "Lines".padStart(lineWidth, " ")
  const headerFiles = "Files".padStart(fileWidth, " ")
  console.log(`${headerExtension}  ${headerLines}  ${headerFiles}`)

  for (const entry of extensionCounts) {
    const extension = entry.extension.padEnd(extensionWidth, " ")
    const lines = String(entry.lines).padStart(lineWidth, " ")
    const files = String(entry.files).padStart(fileWidth, " ")
    console.log(`${extension}  ${lines}  ${files}`)
  }
}

function buildDisplayRows(
  counts: ScopedLineCount[],
  subdirLevel: number,
): LineCount[] {
  const rows: LineCount[] = counts.map((entry) => ({
    name: withTrailingSlash(entry.name),
    lines: entry.lines,
    files: entry.files,
  }))

  if (subdirLevel > 0) {
    for (const entry of counts) {
      const ordered = sortIntoTreeOrder(entry.subdirs)
      for (let i = 0; i < ordered.length; i += 1) {
        const subdir = ordered[i]
        const prefix = buildTreePrefix(subdir, i, ordered)
        const leaf = subdir.name.split("/").at(-1) ?? subdir.name
        rows.push({
          name: `${prefix}${withTrailingSlash(leaf)}`,
          lines: subdir.lines,
          files: subdir.files,
        })
      }
    }
  }

  return rows
}

function compareFileEntries(
  left: FileLineCount,
  right: FileLineCount,
  sortMode: SortMode,
): number {
  if (sortMode === "size") {
    const lineDiff = right.lines - left.lines
    if (lineDiff !== 0) return lineDiff
  }

  return left.name.localeCompare(right.name)
}

function buildDirectFilesByDir(
  entry: ScopedLineCount,
  subdirLevel: number,
  sortMode: SortMode,
): Map<string, FileLineCount[]> {
  const visibleDirs = new Set<string>([
    "",
    ...entry.subdirs.map((subdir) => subdir.name),
  ])
  const filesByDir = new Map<string, FileLineCount[]>()

  for (const fileEntry of entry.fileEntries) {
    const fileDepth = fileEntry.name.split("/").length
    if (fileDepth > subdirLevel) continue

    const parentDir = parentOf(fileEntry.name)
    if (!visibleDirs.has(parentDir)) continue
    const files = filesByDir.get(parentDir) ?? []
    files.push(fileEntry)
    filesByDir.set(parentDir, files)
  }

  for (const files of filesByDir.values()) {
    files.sort((left, right) => compareFileEntries(left, right, sortMode))
  }

  return filesByDir
}

function buildDisplayRowsWithFiles(
  counts: ScopedLineCount[],
  subdirLevel: number,
  sortMode: SortMode,
): LineCount[][] {
  const sections: LineCount[][] = []

  for (const entry of counts) {
    const rows: LineCount[] = []
    const directFilesByDir = buildDirectFilesByDir(entry, subdirLevel, sortMode)
    const subdirsByParent = new Map<string, ScopedLineCount[]>()

    for (const subdir of entry.subdirs) {
      const parent = parentOf(subdir.name)
      const siblings = subdirsByParent.get(parent) ?? []
      siblings.push(subdir)
      subdirsByParent.set(parent, siblings)
    }

    rows.push({
      name: withTrailingSlash(entry.name),
      lines: entry.lines,
      files: entry.files,
    })

    function visit(parentDir: string, indentPrefix: string): void {
      const files = directFilesByDir.get(parentDir) ?? []
      const subdirs = subdirsByParent.get(parentDir) ?? []
      const totalChildren = files.length + subdirs.length
      let childIndex = 0

      for (const subdir of subdirs) {
        const isLast = childIndex === totalChildren - 1
        const leaf = subdir.name.split("/").at(-1) ?? subdir.name
        rows.push({
          name: `${indentPrefix}${isLast ? "└── " : "├── "}${withTrailingSlash(leaf)}`,
          lines: subdir.lines,
          files: subdir.files,
        })
        visit(subdir.name, `${indentPrefix}${isLast ? "    " : "│   "}`)
        childIndex += 1
      }

      for (const file of files) {
        const isLast = childIndex === totalChildren - 1
        const leaf = file.name.split("/").at(-1) ?? file.name
        rows.push({
          name: `${indentPrefix}${isLast ? "└── " : "├── "}${leaf}`,
          lines: file.lines,
          files: 1,
        })
        childIndex += 1
      }
    }

    visit("", "")
    sections.push(rows)
  }

  return sections
}

function main(): void {
  const {
    showExtensions,
    includeLock,
    rootDirPath,
    rootLabel,
    showFiles,
    subdirLevel,
    sortMode,
  } = parseCliOptions(process.argv.slice(2))
  const extensionTotals = new Map<string, Totals>()
  const rootCount = countLinesForDir(
    rootDirPath,
    rootLabel,
    includeLock,
    extensionTotals,
    subdirLevel,
    sortMode,
  )
  const allCounts = [rootCount]
  if (showFiles) {
    const sections = buildDisplayRowsWithFiles(allCounts, subdirLevel, sortMode)
    const displayRows = sections.flat()
    const widths: ColumnWidths = {
      name: Math.max(...displayRows.map((entry) => entry.name.length)),
      lines: Math.max(
        5,
        ...displayRows.map((entry) => String(entry.lines).length),
      ),
      files: Math.max(
        5,
        ...displayRows.map((entry) => String(entry.files).length),
      ),
    }
    printHeader(widths)
    for (let i = 0; i < sections.length; i += 1) {
      if (i > 0 && subdirLevel > 0) {
        console.log("")
      }
      for (const row of sections[i]) {
        printRow(row, widths)
      }
    }
  } else {
    const allDisplayRows = buildDisplayRows(allCounts, subdirLevel)
    const widths: ColumnWidths = {
      name: Math.max(...allDisplayRows.map((entry) => entry.name.length)),
      lines: Math.max(
        5,
        ...allDisplayRows.map((entry) => String(entry.lines).length),
      ),
      files: Math.max(
        5,
        ...allDisplayRows.map((entry) => String(entry.files).length),
      ),
    }

    printHeader(widths)
    printCounts(allCounts, widths, subdirLevel)
  }

  if (showExtensions) {
    console.log("")
    console.log(`Extensions (${rootLabel}):`)
    printExtensionCounts(extensionTotals, sortMode)
  }
}

try {
  main()
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
