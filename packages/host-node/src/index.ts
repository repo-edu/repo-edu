import { existsSync } from "node:fs"
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { homedir, tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type { TokenizerSupportedLanguage } from "@repo-edu/domain/analysis"
import type {
  FileSystemBatchOperation,
  FileSystemBatchRequest,
  FileSystemBatchResult,
  FileSystemDirectoryEntry,
  FileSystemEntryStatus,
  FileSystemInspectRequest,
  FileSystemListDirectoryRequest,
  FileSystemListedFile,
  FileSystemPort,
  FileSystemReadFileInsideRootRequest,
  FileSystemReadFileInsideRootResult,
  FileSystemStatResult,
  HttpPort,
  HttpRequest,
  HttpResponse,
  TokenizerPort,
} from "@repo-edu/host-runtime-contract"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"
import {
  getTokenizerGrammarAsset,
  packageId as grammarAssetsPackageId,
} from "@repo-edu/tree-sitter-grammar-assets"
import {
  LANGUAGE_VERSION,
  Language,
  MIN_COMPATIBLE_VERSION,
  Parser,
} from "web-tree-sitter"

export const packageId = "@repo-edu/host-node"
export const workspaceDependencies = [
  hostRuntimePackageId,
  grammarAssetsPackageId,
] as const

export type { ResolveRepoEduAppDataRootOptions } from "./app-data-root.js"
export { resolveRepoEduAppDataRoot } from "./app-data-root.js"
export {
  cleanupAtomicTempFiles,
  createWriteQueue,
  writeTextFileAtomic,
} from "./atomic-write.js"
export type {
  ChildProcessLifetimeArtifactProbeClaims,
  ChildProcessLifetimeArtifactProbeRun,
  ChildProcessLifetimeArtifactProbeTarget,
} from "./child-process-lifetime-artifact-probe.js"
export {
  childProcessLifetimeArtifactProbeEnvironmentVariable,
  childProcessLifetimeArtifactProbeFixtureEnvironmentVariable,
  childProcessLifetimeArtifactProbeMarker,
  childProcessLifetimeArtifactProbeMarkerEnvironmentVariable,
  childProcessLifetimeArtifactProbeRuntimeEnvironmentVariable,
  finishChildProcessLifetimeArtifactProbe,
  isChildProcessLifetimeArtifactProbe,
  resolveChildProcessLifetimeArtifactProbeTarget,
  startChildProcessLifetimeArtifactProbe,
} from "./child-process-lifetime-artifact-probe.js"
export type {
  CreateNodeLlmTextClientOptions,
  NodeCodexHelperCommand,
} from "./llm.js"
export {
  createNodeLlmPort,
  createNodeLlmTextClient,
  launchNodeCodexHelper,
} from "./llm.js"
export {
  createNodeGitCommandPort,
  createNodeProcessPort,
} from "./process-port.js"
export type { ProgramGateClaim } from "./program-gate.js"
export {
  claimProgramGate,
  isProgramGateArtifactProbe,
  programConflictMessage,
  programGateArtifactProbeEnvironmentVariable,
  programGateArtifactProbeMarker,
  programGateArtifactProbeReleaseEnvironmentVariable,
  waitForProgramGateArtifactProbeRelease,
  writeProgramGateArtifactProbeMarker,
} from "./program-gate.js"
export type {
  NodeSettingsRecoveryEntry,
  NodeSettingsRecoveryReason,
  NodeSettingsRecoveryUnit,
  NodeSettingsSectionStore,
} from "./settings-section-store.js"
export {
  createNodeSettingsSectionStore,
  recoverUnsupportedCompositeSettingsFile,
} from "./settings-section-store.js"

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

// ---------------------------------------------------------------------------
// NodeHttpPort — Node-side fetch implementation (architecture plan §3)
// ---------------------------------------------------------------------------

export function createNodeHttpPort(): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      const response = await globalThis.fetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: request.signal,
      })

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: await response.text(),
      }
    },
  }
}

const tokenizerRequire = createRequire(import.meta.url)
let tokenizerRuntimeInit: Promise<void> | null = null
const tokenizerLanguageCache = new Map<
  TokenizerSupportedLanguage,
  Promise<Awaited<ReturnType<TokenizerPort["loadTokenizerLanguage"]>>>
>()

function resolveTokenizerEngineWasmPath(): string {
  const bundledPath = fileURLToPath(
    new URL("./web-tree-sitter.wasm", import.meta.url),
  )
  if (existsSync(bundledPath)) return bundledPath
  return tokenizerRequire.resolve("web-tree-sitter/web-tree-sitter.wasm")
}

function ensureTokenizerRuntime(): Promise<void> {
  if (tokenizerRuntimeInit === null) {
    const init = Parser.init({
      locateFile: resolveTokenizerEngineWasmPath,
    })
    init.catch(() => {
      if (tokenizerRuntimeInit === init) tokenizerRuntimeInit = null
    })
    tokenizerRuntimeInit = init
  }
  return tokenizerRuntimeInit
}

function assertCompatibleGrammar(
  language: Language,
  id: TokenizerSupportedLanguage,
) {
  if (
    language.abiVersion < MIN_COMPATIBLE_VERSION ||
    language.abiVersion > LANGUAGE_VERSION
  ) {
    throw new Error(
      `Tokenizer grammar ${id} ABI ${language.abiVersion} is outside supported range ${MIN_COMPATIBLE_VERSION}-${LANGUAGE_VERSION}.`,
    )
  }
}

async function loadNodeTokenizerLanguage(id: TokenizerSupportedLanguage) {
  await ensureTokenizerRuntime()

  const asset = getTokenizerGrammarAsset(id)
  const grammarPath = fileURLToPath(asset.assetUrl)
  const language = await Language.load(grammarPath)
  assertCompatibleGrammar(language, id)

  const parser = new Parser()
  parser.setLanguage(language)
  return { language: id, parser }
}

export function createNodeTokenizerPort(): TokenizerPort {
  return {
    async loadTokenizerLanguage(id) {
      let promise = tokenizerLanguageCache.get(id)
      if (!promise) {
        promise = loadNodeTokenizerLanguage(id)
        tokenizerLanguageCache.set(id, promise)
        promise.catch(() => {
          if (tokenizerLanguageCache.get(id) === promise) {
            tokenizerLanguageCache.delete(id)
          }
        })
      }
      return await promise
    },
  }
}

async function inspectPath(path: string): Promise<FileSystemEntryStatus> {
  try {
    const entry = await stat(path)

    if (entry.isDirectory()) {
      return { path, kind: "directory" }
    }

    return { path, kind: "file" }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, kind: "missing" }
    }

    throw error
  }
}

async function statPath(path: string): Promise<FileSystemStatResult> {
  try {
    const entry = await stat(path)
    if (entry.isDirectory()) {
      return { kind: "directory", size: null }
    }
    if (entry.isFile()) {
      return { kind: "file", size: entry.size }
    }
    return { kind: "missing", size: null }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing", size: null }
    }
    throw error
  }
}

async function applyFileSystemOperation(operation: FileSystemBatchOperation) {
  if (operation.kind === "ensure-directory") {
    await mkdir(operation.path, { recursive: true })
    return
  }

  if (operation.kind === "copy-directory") {
    await cp(operation.sourcePath, operation.destinationPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
    })
    return
  }

  await rm(operation.path, { force: true, recursive: true })
}

// ---------------------------------------------------------------------------
// NodeFileSystemPort — explicit filesystem primitives for repo workflows (§3)
// ---------------------------------------------------------------------------

function resolveUserHomeSystemDirectories(): readonly string[] {
  const home = homedir()
  switch (process.platform) {
    case "darwin":
      return [join(home, "Library"), join(home, "Applications")]
    case "win32":
      return [join(home, "AppData")]
    default:
      return []
  }
}

function normalizedExtensionSet(extensions: readonly string[]): Set<string> {
  return new Set(
    extensions
      .map((extension) => extension.trim().toLowerCase().replace(/^\./, ""))
      .filter((extension) => extension.length > 0),
  )
}

function matchesExtension(
  relativePath: string,
  extensions: Set<string>,
): boolean {
  if (extensions.has("*")) return true
  const basename = relativePath.split("/").pop() ?? relativePath
  const index = basename.lastIndexOf(".")
  if (index < 0) return false
  return extensions.has(basename.slice(index + 1).toLowerCase())
}

function toPosixRelativePath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).replaceAll("\\", "/")
}

async function listFilesInsideRoot(request: {
  rootPath: string
  extensions: readonly string[]
  signal?: AbortSignal
}): Promise<FileSystemListedFile[]> {
  throwIfAborted(request.signal)
  const extensions = normalizedExtensionSet(request.extensions)
  const entries = await readdir(request.rootPath, {
    recursive: true,
    withFileTypes: true,
  })
  throwIfAborted(request.signal)

  const files: FileSystemListedFile[] = []
  for (const entry of entries) {
    throwIfAborted(request.signal)
    if (!entry.isFile()) continue
    const parentPath =
      "parentPath" in entry ? entry.parentPath : request.rootPath
    const absolutePath = join(parentPath, entry.name)
    const relativePath = toPosixRelativePath(request.rootPath, absolutePath)
    if (!matchesExtension(relativePath, extensions)) continue
    const fileStat = await stat(absolutePath)
    if (!fileStat.isFile()) continue
    files.push({ relativePath, size: fileStat.size })
  }

  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )
  return files
}

async function readFileInsideRootPath(
  request: FileSystemReadFileInsideRootRequest,
): Promise<FileSystemReadFileInsideRootResult> {
  throwIfAborted(request.signal)
  const rootReal = await realpath(request.rootPath)
  const candidate = resolve(request.rootPath, request.relativePath)
  const candidateReal = await realpath(candidate)
  const containment = relative(rootReal, candidateReal)
  if (
    containment.length === 0 ||
    containment === ".." ||
    containment.startsWith(`..${sep}`) ||
    isAbsolute(containment)
  ) {
    throw new Error("Selected file is outside the submission folder.")
  }
  throwIfAborted(request.signal)
  const candidateStat = await stat(candidateReal)
  if (!candidateStat.isFile()) {
    throw new Error("Selected path is not a regular file.")
  }
  if (candidateStat.size > request.maxBytes) {
    throw new Error("Selected file is too large.")
  }
  throwIfAborted(request.signal)
  const bytes = await readFile(candidateReal)
  throwIfAborted(request.signal)
  return {
    relativePath: request.relativePath.replaceAll("\\", "/"),
    bytes,
  }
}

export function createNodeFileSystemPort(): FileSystemPort {
  return {
    userHomeSystemDirectories: resolveUserHomeSystemDirectories(),

    async inspect(
      request: FileSystemInspectRequest,
    ): Promise<FileSystemEntryStatus[]> {
      throwIfAborted(request.signal)

      const statuses: FileSystemEntryStatus[] = []

      for (const path of request.paths) {
        throwIfAborted(request.signal)
        statuses.push(await inspectPath(path))
      }

      return statuses
    },

    async stat(request): Promise<FileSystemStatResult> {
      throwIfAborted(request.signal)
      return statPath(request.path)
    },

    async applyBatch(
      request: FileSystemBatchRequest,
    ): Promise<FileSystemBatchResult> {
      throwIfAborted(request.signal)

      const completed: FileSystemBatchOperation[] = []

      for (const operation of request.operations) {
        throwIfAborted(request.signal)
        await applyFileSystemOperation(operation)
        completed.push(operation)
      }

      return { completed }
    },

    async createTempDirectory(prefix: string): Promise<string> {
      return mkdtemp(join(tmpdir(), prefix))
    },

    async listDirectory(
      request: FileSystemListDirectoryRequest,
    ): Promise<FileSystemDirectoryEntry[]> {
      throwIfAborted(request.signal)
      const entries = await readdir(request.path, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory()
            ? ("directory" as const)
            : ("file" as const),
        }))
    },

    async listFiles(request): Promise<FileSystemListedFile[]> {
      return listFilesInsideRoot(request)
    },

    async readFileInsideRoot(
      request,
    ): Promise<FileSystemReadFileInsideRootResult> {
      return readFileInsideRootPath(request)
    },
  }
}
