import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { type MoveCandidate, moveStatements } from "../move.js"
import {
  attemptMoveList,
  type MoveList,
  type MoveListReply,
} from "../move-list.js"

const PACKAGE_JSON = JSON.stringify({
  name: "fixture",
  private: true,
  type: "module",
  scripts: { typecheck: "tsc -p tsconfig.typecheck.json --noEmit" },
})

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2024",
    module: "ESNext",
    moduleResolution: "Bundler",
    resolveJsonModule: true,
    strict: true,
    verbatimModuleSyntax: true,
    noEmit: true,
    types: [],
    lib: ["ES2024"],
  },
  include: ["src/**/*.ts"],
})

/**
 * A temporary workspace with one package, `pkg`, whose typecheck script
 * names its configuration as Repo Edu's packages do. Paths are relative to
 * that package.
 */
export class FixtureProject {
  readonly root: string
  readonly packageDir: string

  constructor(files: Record<string, string>) {
    this.root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "statement-move-")),
    )
    this.packageDir = path.join(this.root, "pkg")
    this.write("package.json", PACKAGE_JSON)
    this.write("tsconfig.typecheck.json", TSCONFIG)
    for (const [file, text] of Object.entries(files)) {
      this.write(file, text)
    }
  }

  write(file: string, text: string): void {
    const fullPath = path.join(this.packageDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, text)
  }

  read(file: string): string {
    return fs.readFileSync(path.join(this.packageDir, file), "utf8")
  }

  exists(file: string): boolean {
    return fs.existsSync(path.join(this.packageDir, file))
  }

  /** Every file of the package with its text, for proving nothing changed. */
  snapshot(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const entry of fs.readdirSync(this.packageDir, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (entry.isFile()) {
        const fullPath = path.join(entry.parentPath, entry.name)
        result[path.relative(this.packageDir, fullPath)] = fs.readFileSync(
          fullPath,
          "utf8",
        )
      }
    }
    return result
  }

  move(
    source: string,
    startLine: number,
    endLine: number,
    target: string,
  ): MoveCandidate {
    return moveStatements({
      root: this.root,
      source: path.join("pkg", source),
      startLine,
      endLine,
      target: path.join("pkg", target),
    })
  }

  /**
   * Tries a move list whose source and targets are package-relative. The
   * hash defaults to the source's current Git blob hash.
   */
  attemptList(
    source: string,
    entries: readonly {
      readonly target: string
      readonly ranges: readonly {
        readonly start: number
        readonly end: number
      }[]
    }[],
    hash = blobHash(this.read(source)),
  ): MoveListReply {
    const list: MoveList = {
      source: path.join("pkg", source),
      hash,
      entries: entries.map((entry) => ({
        target: path.join("pkg", entry.target),
        ranges: [...entry.ranges],
      })),
    }
    return attemptMoveList(this.root, list)
  }

  dispose(): void {
    fs.rmSync(this.root, { recursive: true, force: true })
  }
}

/**
 * Git's blob hash of LF text, computed without Git: the SHA-1 of a `blob`
 * header with the byte length, a NUL byte and the content.
 */
function blobHash(text: string): string {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex")
}

/** Runs the body against a fresh fixture project and always removes it. */
export function withProject(
  files: Record<string, string>,
  body: (project: FixtureProject) => void,
): void {
  const project = new FixtureProject(files)
  try {
    body(project)
  } finally {
    project.dispose()
  }
}
