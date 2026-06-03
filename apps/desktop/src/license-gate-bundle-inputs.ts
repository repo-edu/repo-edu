type OutputChunkModule = {
  readonly renderedLength?: number
}

type OutputChunk = {
  readonly type: "chunk"
  readonly dynamicImports?: readonly string[]
  readonly imports?: readonly string[]
  readonly modules?: Record<string, OutputChunkModule>
  readonly moduleIds?: readonly string[]
}

type OutputAsset = {
  readonly type: "asset"
  readonly originalFileNames?: readonly string[]
}

export type BundleInputTarget = {
  readonly externalImports: readonly string[]
  readonly inputs: readonly string[]
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOutputChunk(value: unknown): value is OutputChunk {
  return isObjectRecord(value) && value.type === "chunk"
}

function isOutputAsset(value: unknown): value is OutputAsset {
  return isObjectRecord(value) && value.type === "asset"
}

function normalizeBundleInputPath(id: string): string | null {
  const queryStart = id.search(/[?#]/)
  const path = queryStart === -1 ? id : id.slice(0, queryStart)
  if (
    path.length === 0 ||
    path.includes("\0") ||
    (!path.startsWith(".") &&
      !path.startsWith("/") &&
      !path.includes("/") &&
      !/^[A-Za-z]:[\\/]/.test(path))
  ) {
    return null
  }
  return path
}

function normalizeExternalImportSpecifier(id: string): string | null {
  const queryStart = id.search(/[?#]/)
  const specifier = queryStart === -1 ? id : id.slice(0, queryStart)
  const packageName = packageNameFromSpecifier(specifier)
  if (
    specifier.length === 0 ||
    packageName === null ||
    /\.(?:c?js|mjs|css|json|map|wasm|svg|png|jpe?g|gif|webp)$/i.test(
      packageName,
    ) ||
    specifier.includes("\0") ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(specifier) ||
    specifier.startsWith("node:") ||
    specifier.startsWith("virtual:")
  ) {
    return null
  }
  return specifier
}

function packageNameFromSpecifier(specifier: string): string | null {
  const parts = specifier.split("/")
  if (specifier.startsWith("@")) {
    const [scope, name] = parts
    if (!scope || !name) {
      return null
    }
    return `${scope}/${name}`
  }
  return parts[0] ?? null
}

function recordInput(inputs: Set<string>, id: string): void {
  const path = normalizeBundleInputPath(id)
  if (path !== null) {
    inputs.add(path)
  }
}

function recordExternalImport(
  externalImports: Set<string>,
  outputNames: ReadonlySet<string>,
  id: string,
): void {
  if (outputNames.has(id)) {
    return
  }
  const specifier = normalizeExternalImportSpecifier(id)
  if (specifier !== null) {
    externalImports.add(specifier)
  }
}

function chunkModuleEmitsCode(module: OutputChunkModule): boolean {
  return typeof module.renderedLength !== "number" || module.renderedLength > 0
}

function collectChunkInputs(
  inputs: Set<string>,
  externalImports: Set<string>,
  outputNames: ReadonlySet<string>,
  chunk: OutputChunk,
): void {
  const moduleEntries = Object.entries(chunk.modules ?? {})
  if (moduleEntries.length === 0) {
    for (const id of chunk.moduleIds ?? []) {
      recordInput(inputs, id)
    }
  } else {
    for (const [id, module] of moduleEntries) {
      if (chunkModuleEmitsCode(module)) {
        recordInput(inputs, id)
      }
    }
  }

  for (const id of [
    ...(chunk.imports ?? []),
    ...(chunk.dynamicImports ?? []),
  ]) {
    recordExternalImport(externalImports, outputNames, id)
  }
}

function collectAssetInputs(inputs: Set<string>, asset: OutputAsset): void {
  for (const id of asset.originalFileNames ?? []) {
    recordInput(inputs, id)
  }
}

export function collectBundleInputTarget(bundle: unknown): BundleInputTarget {
  const inputs = new Set<string>()
  const externalImports = new Set<string>()
  if (!isObjectRecord(bundle)) {
    return { externalImports: [], inputs: [] }
  }

  const outputNames = new Set(Object.keys(bundle))
  for (const output of Object.values(bundle)) {
    if (isOutputChunk(output)) {
      collectChunkInputs(inputs, externalImports, outputNames, output)
    } else if (isOutputAsset(output)) {
      collectAssetInputs(inputs, output)
    }
  }

  return {
    externalImports: [...externalImports].sort(),
    inputs: [...inputs].sort(),
  }
}
