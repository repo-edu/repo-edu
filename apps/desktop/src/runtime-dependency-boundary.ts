import { builtinModules, createRequire } from "node:module"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import runtimeExternalData from "./desktop-runtime-externals.json" with {
  type: "json",
}

export type RollupRuntimeExternal = {
  readonly fullName: string
  readonly proof: "rollup"
}

export type DirectRuntimeExternal = {
  readonly fullName: string
  readonly proof: "direct"
  readonly entry: string
}

export type DesktopRuntimeExternal =
  | RollupRuntimeExternal
  | DirectRuntimeExternal

type RuntimeBundleChunk = {
  readonly type: "chunk"
  readonly fileName: string
  readonly name: string
  readonly isEntry: boolean
  readonly imports: readonly string[]
  readonly dynamicImports: readonly string[]
}

type RuntimeBundleOutput = RuntimeBundleChunk | { readonly type: "asset" }

export type DesktopRuntimeBundle = Readonly<Record<string, RuntimeBundleOutput>>

export type RuntimeDependencyResolvers = {
  resolveImport(fullName: string, parentUrl: string): string
  resolveRequire(fullName: string, parentUrl: string): string
}

export type ValidateDesktopRuntimeBundleOptions = {
  readonly bundle: DesktopRuntimeBundle
  readonly outputDirectory: string
  readonly declarations?: readonly DesktopRuntimeExternal[]
  readonly resolvers?: RuntimeDependencyResolvers
}

const nodeRuntimeNames = new Set(builtinModules)

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function readRuntimeExternal(
  value: unknown,
  index: number,
): DesktopRuntimeExternal {
  const record = recordValue(value)
  const label = `Desktop runtime external at index ${index}`
  if (!record || typeof record.fullName !== "string") {
    throw new Error(`${label} must name one package load.`)
  }
  packageRootForLoadName(record.fullName)

  if (record.proof === "rollup") {
    return Object.freeze({ fullName: record.fullName, proof: "rollup" })
  }
  if (record.proof === "direct" && typeof record.entry === "string") {
    return Object.freeze({
      entry: record.entry,
      fullName: record.fullName,
      proof: "direct",
    })
  }
  throw new Error(`${label} must select a valid proof path.`)
}

function readRuntimeExternals(
  value: unknown,
): readonly DesktopRuntimeExternal[] {
  if (!Array.isArray(value)) {
    throw new Error("Desktop runtime externals must be an array.")
  }
  const declarations = value.map(readRuntimeExternal)
  const names = new Set<string>()
  for (const declaration of declarations) {
    if (names.has(declaration.fullName)) {
      throw new Error(
        `Desktop runtime external "${declaration.fullName}" is declared more than once.`,
      )
    }
    names.add(declaration.fullName)
  }
  return Object.freeze(declarations)
}

export function packageRootForLoadName(fullName: string): string {
  const parts = fullName.split("/")
  const root = fullName.startsWith("@")
    ? parts.length >= 2
      ? `${parts[0]}/${parts[1]}`
      : null
    : parts[0]

  if (
    !root ||
    root === "." ||
    root === ".." ||
    root.includes(":") ||
    root.startsWith("/")
  ) {
    throw new Error(`"${fullName}" is not a bare package load name.`)
  }
  return root
}

export const desktopRuntimeExternals = readRuntimeExternals(runtimeExternalData)

export const desktopRuntimeExternalPackageRoots = Object.freeze(
  Array.from(
    new Set(
      desktopRuntimeExternals.map(({ fullName }) =>
        packageRootForLoadName(fullName),
      ),
    ),
  ),
)

export function isDesktopRuntimeExternalId(source: string): boolean {
  return desktopRuntimeExternalPackageRoots.some(
    (root) => source === root || source.startsWith(`${root}/`),
  )
}

export function isRuntimeSuppliedLoadName(fullName: string): boolean {
  return (
    fullName.startsWith("node:") ||
    fullName.startsWith("bun:") ||
    fullName === "electron" ||
    fullName.startsWith("electron/") ||
    nodeRuntimeNames.has(fullName)
  )
}

function requiredChunk(
  bundle: DesktopRuntimeBundle,
  fileName: string,
): RuntimeBundleChunk | null {
  const output = bundle[fileName]
  return output?.type === "chunk" ? output : null
}

type EntryClosure = {
  readonly entry: RuntimeBundleChunk
  readonly chunks: ReadonlySet<string>
}

function collectEntryClosure(
  bundle: DesktopRuntimeBundle,
  entry: RuntimeBundleChunk,
): EntryClosure {
  const chunks = new Set<string>()
  const queue = [entry.fileName]
  while (queue.length > 0) {
    const fileName = queue.shift()
    if (!fileName || chunks.has(fileName)) {
      continue
    }
    chunks.add(fileName)
    const chunk = requiredChunk(bundle, fileName)
    if (!chunk) {
      continue
    }
    for (const reference of [...chunk.imports, ...chunk.dynamicImports]) {
      if (requiredChunk(bundle, reference)) {
        queue.push(reference)
      }
    }
  }
  return { chunks, entry }
}

function defaultResolvers(): RuntimeDependencyResolvers {
  return {
    resolveImport: (fullName, parentUrl) =>
      import.meta.resolve(fullName, parentUrl),
    resolveRequire: (fullName, parentUrl) =>
      createRequire(parentUrl).resolve(fullName),
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function runtimeOutputFileUrl(
  outputDirectory: string,
  ...pathSegments: string[]
): string {
  return pathToFileURL(resolve(outputDirectory, ...pathSegments)).href
}

function resolveRollupExternal(
  fullName: string,
  chunk: RuntimeBundleChunk,
  entryNames: readonly string[],
  outputDirectory: string,
  resolvers: RuntimeDependencyResolvers,
): void {
  const packageRoot = packageRootForLoadName(fullName)
  const chunkUrl = runtimeOutputFileUrl(outputDirectory, chunk.fileName)
  try {
    resolvers.resolveImport(fullName, chunkUrl)
  } catch (error) {
    throw new Error(
      `Desktop output entries ${entryNames.join(", ")} leave "${fullName}" ` +
        `(package root "${packageRoot}") in chunk "${chunk.fileName}", but ` +
        `Node cannot resolve it from that chunk: ${errorText(error)}`,
    )
  }
}

function resolveDirectExternal(
  declaration: DirectRuntimeExternal,
  entry: RuntimeBundleChunk,
  outputDirectory: string,
  resolvers: RuntimeDependencyResolvers,
): void {
  const packageRoot = packageRootForLoadName(declaration.fullName)
  const entryUrl = runtimeOutputFileUrl(outputDirectory, entry.fileName)
  try {
    resolvers.resolveRequire(declaration.fullName, entryUrl)
  } catch (error) {
    throw new Error(
      `Desktop output entry "${declaration.entry}" directly loads ` +
        `"${declaration.fullName}" (package root "${packageRoot}"), but Node ` +
        `cannot resolve it from "${entry.fileName}": ${errorText(error)}`,
    )
  }
}

export function proveImportMetaResolveParent(outputDirectory: string): void {
  const parentUrl = runtimeOutputFileUrl(
    outputDirectory,
    "import-meta-parent-proof",
    "proof-entry.js",
  )
  const relativeName = "./proof-target.js"
  const expected = new URL(relativeName, parentUrl).href
  const actual = import.meta.resolve(relativeName, parentUrl)
  if (actual !== expected) {
    throw new Error(
      "Node did not honor the parent URL passed to import.meta.resolve. " +
        "Run the desktop build with --experimental-import-meta-resolve.",
    )
  }
}

export function validateDesktopRuntimeBundle({
  bundle,
  declarations = desktopRuntimeExternals,
  outputDirectory,
  resolvers = defaultResolvers(),
}: ValidateDesktopRuntimeBundleOptions): void {
  const entries = Object.values(bundle).filter(
    (output): output is RuntimeBundleChunk =>
      output.type === "chunk" && output.isEntry,
  )
  const closures = entries.map((entry) => collectEntryClosure(bundle, entry))
  const rollupDeclarations = new Map(
    declarations
      .filter(
        (declaration): declaration is RollupRuntimeExternal =>
          declaration.proof === "rollup",
      )
      .map((declaration) => [declaration.fullName, declaration]),
  )
  const seenRollupDeclarations = new Set<string>()
  const observedRuntimeExternals = new Set<string>()

  for (const output of Object.values(bundle)) {
    if (output.type !== "chunk") {
      continue
    }
    const entryNames = closures
      .filter(({ chunks }) => chunks.has(output.fileName))
      .map(({ entry }) => entry.name)
      .sort()
    if (entryNames.length === 0) {
      continue
    }
    for (const fullName of [...output.imports, ...output.dynamicImports]) {
      if (
        requiredChunk(bundle, fullName) ||
        isRuntimeSuppliedLoadName(fullName)
      ) {
        continue
      }
      const declaration = rollupDeclarations.get(fullName)
      if (!declaration) {
        const packageRoot = packageRootForLoadName(fullName)
        throw new Error(
          `Desktop output entries ${entryNames.join(", ")} leave undeclared ` +
            `runtime external "${fullName}" (package root "${packageRoot}") ` +
            `in chunk "${output.fileName}".`,
        )
      }
      observedRuntimeExternals.add(fullName)
      seenRollupDeclarations.add(declaration.fullName)
      resolveRollupExternal(
        declaration.fullName,
        output,
        entryNames,
        outputDirectory,
        resolvers,
      )
    }
  }

  for (const fullName of rollupDeclarations.keys()) {
    if (!seenRollupDeclarations.has(fullName)) {
      const observed = Array.from(observedRuntimeExternals).sort().join(", ")
      throw new Error(
        `Declared desktop runtime external "${fullName}" was bundled or is ` +
          `no longer loaded. Observed application-owned externals: ${observed || "none"}.`,
      )
    }
  }

  for (const declaration of declarations) {
    if (declaration.proof !== "direct") {
      continue
    }
    const entry = entries.find(({ name }) => name === declaration.entry)
    if (!entry) {
      throw new Error(
        `Desktop runtime external "${declaration.fullName}" names missing output entry "${declaration.entry}".`,
      )
    }
    resolveDirectExternal(declaration, entry, outputDirectory, resolvers)
  }
}

export function desktopRuntimeDependencyBoundaryPlugin(
  outputDirectory: string,
) {
  return {
    name: "desktop-runtime-dependency-boundary",
    apply: "build" as const,
    generateBundle(_options: unknown, bundle: DesktopRuntimeBundle): void {
      proveImportMetaResolveParent(outputDirectory)
      validateDesktopRuntimeBundle({ bundle, outputDirectory })
    },
  }
}
