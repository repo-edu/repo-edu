import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

type ProcessEnvironment = Record<string, string | undefined>

export type ProcessRunnerResult = {
  readonly stdout: string
  readonly stderr: string
}

export type ProcessRunner = (
  command: string,
  args: readonly string[],
) => Promise<ProcessRunnerResult>

export type MacosSigningPrepareOptions = {
  readonly manifestPath: string
  readonly env?: ProcessEnvironment
  readonly runner?: ProcessRunner
  readonly idFactory?: () => string
  readonly tmpRoot?: string
}

export type MacosSigningCleanupOptions = {
  readonly manifestPath: string
  readonly runner?: ProcessRunner
}

export type MacosSigningOutputs = {
  readonly CSC_KEYCHAIN: string
  readonly CSC_NAME: string
  readonly MACOS_SIGNING_IDENTITY: string
  readonly APPLE_API_KEY: string
  readonly APPLE_API_KEY_ID: string
  readonly APPLE_API_ISSUER: string
}

export type MacosSigningSessionResource =
  | {
      readonly type: "temporary-directory"
      readonly path: string
    }
  | {
      readonly type: "certificate"
      readonly path: string
    }
  | {
      readonly type: "apple-api-key"
      readonly path: string
    }
  | {
      readonly type: "keychain"
      readonly path: string
    }
  | {
      readonly type: "notarytool-profile"
      readonly keychainPath: string
      readonly name: string
    }

export type MacosSigningSessionManifest = {
  readonly version: 1
  readonly resources: readonly MacosSigningSessionResource[]
  readonly initialUserKeychains?: readonly string[]
  readonly outputs?: MacosSigningOutputs
}

type MacosSigningInputs = {
  readonly cscLink: string
  readonly cscKeyPassword: string
  readonly appleApiKeyBase64: string
  readonly appleApiKeyId: string
  readonly appleApiIssuer: string
}

type DeveloperIdIdentity = {
  readonly hash: string
  readonly name: string
}

const manifestVersion = 1
const githubActionOutputKeys = [
  "CSC_KEYCHAIN",
  "CSC_NAME",
  "MACOS_SIGNING_IDENTITY",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
] as const
const sensitiveArgumentFlags = new Set([
  "-p",
  "-P",
  "-k",
  "--key",
  "--key-id",
  "--issuer",
  "--password",
  "--apple-id",
  "--team-id",
])

export function parseManifestArg(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== "--manifest" || !argv[1]) {
    throw new Error("Usage: --manifest <path>")
  }
  return argv[1]
}

export async function prepareMacosSigning(
  options: MacosSigningPrepareOptions,
): Promise<MacosSigningOutputs> {
  const env = options.env ?? process.env
  const runner = options.runner ?? defaultProcessRunner
  const idFactory = options.idFactory ?? randomUUID
  const inputs = readMacosSigningInputs(env)
  const certificate = decodeCertificateInput(inputs.cscLink)
  const appleApiKey = decodeRawBase64Secret(
    "APPLE_API_KEY_BASE64",
    inputs.appleApiKeyBase64,
  )

  await writeSessionManifest(options.manifestPath, emptySessionManifest())

  const initialUserKeychains = parseSecurityListKeychains(
    (
      await runCommand(runner, "Read user keychain search list", "security", [
        "list-keychains",
        "-d",
        "user",
      ])
    ).stdout,
  )
  await updateSessionManifest(options.manifestPath, (manifest) => ({
    ...manifest,
    initialUserKeychains,
  }))

  const tempDir = await mkdtemp(
    join(options.tmpRoot ?? tmpdir(), "repo-edu-macos-signing-"),
  )
  await appendSessionResource(options.manifestPath, {
    type: "temporary-directory",
    path: tempDir,
  })

  const certificatePath = join(tempDir, "certificate.p12")
  await writeFile(certificatePath, certificate, { mode: 0o600 })
  await appendSessionResource(options.manifestPath, {
    type: "certificate",
    path: certificatePath,
  })

  const appleApiKeyPath = join(tempDir, "AuthKey.p8")
  await writeFile(appleApiKeyPath, appleApiKey, { mode: 0o600 })
  await appendSessionResource(options.manifestPath, {
    type: "apple-api-key",
    path: appleApiKeyPath,
  })

  const keychainPath = join(tempDir, "repo-edu-signing.keychain-db")
  const keychainPassword = idFactory()
  await runCommand(runner, "Create temporary signing keychain", "security", [
    "create-keychain",
    "-p",
    keychainPassword,
    keychainPath,
  ])
  await appendSessionResource(options.manifestPath, {
    type: "keychain",
    path: keychainPath,
  })

  await runCommand(runner, "Unlock temporary signing keychain", "security", [
    "unlock-keychain",
    "-p",
    keychainPassword,
    keychainPath,
  ])
  await runCommand(runner, "Disable signing keychain auto-lock", "security", [
    "set-keychain-settings",
    keychainPath,
  ])
  await runCommand(
    runner,
    "Expose signing keychain to user tools",
    "security",
    [
      "list-keychains",
      "-d",
      "user",
      "-s",
      keychainPath,
      ...initialUserKeychains,
    ],
  )
  await runCommand(runner, "Import Developer ID certificate", "security", [
    "import",
    certificatePath,
    "-k",
    keychainPath,
    "-P",
    inputs.cscKeyPassword,
    "-T",
    "/usr/bin/codesign",
    "-T",
    "/usr/bin/productbuild",
  ])
  await runCommand(runner, "Grant signing tool key access", "security", [
    "set-key-partition-list",
    "-S",
    "apple-tool:,apple:,codesign:",
    "-s",
    "-k",
    keychainPassword,
    keychainPath,
  ])

  const identity = await discoverDeveloperIdIdentity(runner, keychainPath)
  const notarytoolProfile = `repo-edu-${idFactory()}`
  await runCommand(runner, "Validate App Store Connect credentials", "xcrun", [
    "notarytool",
    "store-credentials",
    notarytoolProfile,
    "--key",
    appleApiKeyPath,
    "--key-id",
    inputs.appleApiKeyId,
    "--issuer",
    inputs.appleApiIssuer,
    "--keychain",
    keychainPath,
    "--validate",
  ])
  await appendSessionResource(options.manifestPath, {
    type: "notarytool-profile",
    keychainPath,
    name: notarytoolProfile,
  })

  const outputs: MacosSigningOutputs = {
    CSC_KEYCHAIN: keychainPath,
    CSC_NAME: identity.hash,
    MACOS_SIGNING_IDENTITY: identity.hash,
    APPLE_API_KEY: appleApiKeyPath,
    APPLE_API_KEY_ID: inputs.appleApiKeyId,
    APPLE_API_ISSUER: inputs.appleApiIssuer,
  }

  await writeGithubActionsValues(env, outputs)
  await updateSessionManifest(options.manifestPath, (manifest) => ({
    ...manifest,
    outputs,
  }))

  return outputs
}

export async function cleanupMacosSigning(
  options: MacosSigningCleanupOptions,
): Promise<void> {
  const runner = options.runner ?? defaultProcessRunner
  const manifest = await readMacosSigningSessionManifest(options.manifestPath)
  if (!manifest) {
    return
  }

  const cleanupErrors: unknown[] = []
  const initialUserKeychains = manifest.initialUserKeychains
  if (initialUserKeychains && initialUserKeychains.length > 0) {
    await attemptCleanup(cleanupErrors, () =>
      runCommand(runner, "Restore user keychain search list", "security", [
        "list-keychains",
        "-d",
        "user",
        "-s",
        ...initialUserKeychains,
      ]),
    )
  }

  for (const resource of manifest.resources.toReversed()) {
    if (resource.type === "keychain") {
      await attemptCleanup(cleanupErrors, async () => {
        if (await pathExists(resource.path)) {
          await runCommand(
            runner,
            "Delete temporary signing keychain",
            "security",
            ["delete-keychain", resource.path],
          )
        }
      })
    }
  }

  for (const resource of manifest.resources.toReversed()) {
    if (resource.type === "certificate" || resource.type === "apple-api-key") {
      await attemptCleanup(cleanupErrors, () =>
        rm(resource.path, { force: true }),
      )
    }
  }

  for (const resource of manifest.resources.toReversed()) {
    if (resource.type === "temporary-directory") {
      await attemptCleanup(cleanupErrors, () =>
        rm(resource.path, { force: true, recursive: true }),
      )
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      `macOS signing cleanup failed with ${cleanupErrors.length} failure(s)`,
    )
  }
}

export function decodeCertificateInput(value: string): Buffer {
  const trimmed = value.trim()
  if (/^(file:\/\/|https?:\/\/|~\/|\.{1,2}\/)/i.test(trimmed)) {
    throw new Error(
      "CSC_LINK must be raw base64 .p12 bytes or a data:*;base64, payload; paths and URLs are not supported",
    )
  }
  if (/^\/.*\.(p12|pfx|cer|crt)$/i.test(trimmed)) {
    throw new Error(
      "CSC_LINK must be raw base64 .p12 bytes or a data:*;base64, payload; paths and URLs are not supported",
    )
  }

  if (trimmed.startsWith("data:")) {
    const match = /^data:[^,]*;base64,([\s\S]*)$/i.exec(trimmed)
    if (!match) {
      throw new Error("CSC_LINK data URL must use a data:*;base64, payload")
    }
    return decodeBase64Payload("CSC_LINK", match[1])
  }

  return decodeBase64Payload("CSC_LINK", trimmed)
}

export function decodeRawBase64Secret(name: string, value: string): Buffer {
  const trimmed = value.trim()
  if (/^(data:|file:\/\/|https?:\/\/|~\/|\/|\.{1,2}\/)/i.test(trimmed)) {
    throw new Error(
      `${name} must be raw base64 file contents; paths, URLs and data URLs are not supported`,
    )
  }
  return decodeBase64Payload(name, trimmed)
}

export function parseSecurityListKeychains(stdout: string): readonly string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith('"') && line.endsWith('"')
        ? line.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : line,
    )
}

export async function readMacosSigningSessionManifest(
  manifestPath: string,
): Promise<MacosSigningSessionManifest | null> {
  let contents: string
  try {
    contents = await readFile(manifestPath, "utf8")
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return null
    }
    throw error
  }

  if (contents.trim().length === 0) {
    return null
  }

  try {
    return normalizeSessionManifest(JSON.parse(contents))
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

async function discoverDeveloperIdIdentity(
  runner: ProcessRunner,
  keychainPath: string,
): Promise<DeveloperIdIdentity> {
  const result = await runCommand(
    runner,
    "Discover Developer ID Application identity",
    "security",
    ["find-identity", "-v", "-p", "codesigning", keychainPath],
  )
  const identities = parseDeveloperIdIdentities(result.stdout)

  if (identities.length === 0) {
    throw new Error(
      "Imported certificate did not expose a valid Developer ID Application identity",
    )
  }
  if (identities.length > 1) {
    throw new Error(
      `Imported certificate exposed multiple Developer ID Application identities: ${identities.map((identity) => identity.name).join(", ")}`,
    )
  }

  return identities[0]
}

function parseDeveloperIdIdentities(
  stdout: string,
): readonly DeveloperIdIdentity[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => /^\s*\d+\)\s+([0-9a-fA-F]{40})\s+"([^"]+)"/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      hash: match[1],
      name: match[2],
    }))
    .filter((identity) => identity.name.startsWith("Developer ID Application:"))
}

function readMacosSigningInputs(env: ProcessEnvironment): MacosSigningInputs {
  return {
    cscLink: readRequiredEnv(env, "CSC_LINK"),
    cscKeyPassword: readRequiredEnv(env, "CSC_KEY_PASSWORD"),
    appleApiKeyBase64: readRequiredEnv(env, "APPLE_API_KEY_BASE64"),
    appleApiKeyId: readRequiredEnv(env, "APPLE_API_KEY_ID"),
    appleApiIssuer: readRequiredEnv(env, "APPLE_API_ISSUER"),
  }
}

function readRequiredEnv(env: ProcessEnvironment, name: string): string {
  const value = env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment input: ${name}`)
  }
  return value
}

function decodeBase64Payload(name: string, value: string): Buffer {
  const normalized = value.replace(/\s+/g, "")
  if (normalized.length === 0) {
    throw new Error(`${name} is empty`)
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`${name} is not valid base64`)
  }
  if (normalized.length % 4 === 1) {
    throw new Error(`${name} is not valid base64`)
  }

  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  )
  const decoded = Buffer.from(padded, "base64")
  if (decoded.length === 0) {
    throw new Error(`${name} did not decode to any bytes`)
  }

  const canonical = decoded.toString("base64").replace(/=+$/u, "")
  const provided = normalized.replace(/=+$/u, "")
  if (canonical !== provided) {
    throw new Error(`${name} is not valid base64`)
  }

  return decoded
}

async function defaultProcessRunner(
  command: string,
  args: readonly string[],
): Promise<ProcessRunnerResult> {
  return await new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }))
          return
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })
}

async function runCommand(
  runner: ProcessRunner,
  label: string,
  command: string,
  args: readonly string[],
): Promise<ProcessRunnerResult> {
  try {
    return await runner(command, args)
  } catch (error) {
    throw new Error(`${label} failed: ${formatProcessFailure(error, args)}`)
  }
}

function formatProcessFailure(error: unknown, args: readonly string[]): string {
  if (error instanceof Error) {
    const processError = error as Error & {
      readonly code?: unknown
      readonly signal?: unknown
      readonly stderr?: unknown
      readonly stdout?: unknown
    }
    const summary = formatProcessFailureSummary(processError, args)
    const stderr =
      typeof processError.stderr === "string"
        ? redactSensitiveArguments(processError.stderr.trim(), args)
        : ""
    const stdout =
      typeof processError.stdout === "string"
        ? redactSensitiveArguments(processError.stdout.trim(), args)
        : ""
    return [summary, stderr, stdout].filter(Boolean).join("\n")
  }
  return redactSensitiveArguments(String(error), args)
}

function formatProcessFailureSummary(
  error: Error & { readonly code?: unknown; readonly signal?: unknown },
  args: readonly string[],
): string {
  const details = [
    error.code === undefined ? "" : `exit code ${String(error.code)}`,
    error.signal === undefined ? "" : `signal ${String(error.signal)}`,
  ].filter(Boolean)

  if ("cmd" in error || details.length > 0) {
    return details.length > 0
      ? `process failed (${details.join(", ")})`
      : "process failed"
  }

  return redactSensitiveArguments(error.message, args)
}

function redactSensitiveArguments(
  value: string,
  args: readonly string[],
): string {
  let redacted = value
  for (const secret of collectSensitiveArgumentValues(args)) {
    redacted = redacted.replaceAll(secret, "[redacted]")
  }
  return redacted
}

function collectSensitiveArgumentValues(
  args: readonly string[],
): readonly string[] {
  const secrets = new Set<string>()
  for (let index = 0; index < args.length - 1; index += 1) {
    const flag = args[index]
    const secret = args[index + 1]
    if (flag && secret && sensitiveArgumentFlags.has(flag)) {
      secrets.add(secret)
    }
  }
  return [...secrets].sort((left, right) => right.length - left.length)
}

function emptySessionManifest(): MacosSigningSessionManifest {
  return {
    version: manifestVersion,
    resources: [],
  }
}

async function appendSessionResource(
  manifestPath: string,
  resource: MacosSigningSessionResource,
): Promise<void> {
  await updateSessionManifest(manifestPath, (manifest) => ({
    ...manifest,
    resources: [...manifest.resources, resource],
  }))
}

async function updateSessionManifest(
  manifestPath: string,
  update: (
    manifest: MacosSigningSessionManifest,
  ) => MacosSigningSessionManifest,
): Promise<void> {
  const current =
    (await readMacosSigningSessionManifest(manifestPath)) ??
    emptySessionManifest()
  await writeSessionManifest(manifestPath, update(current))
}

async function writeSessionManifest(
  manifestPath: string,
  manifest: MacosSigningSessionManifest,
): Promise<void> {
  await mkdir(dirname(manifestPath), { recursive: true })
  const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    )
    await rename(temporaryPath, manifestPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function attemptCleanup(
  cleanupErrors: unknown[],
  cleanup: () => Promise<unknown>,
): Promise<void> {
  try {
    await cleanup()
  } catch (error) {
    cleanupErrors.push(error)
  }
}

function normalizeSessionManifest(value: unknown): MacosSigningSessionManifest {
  if (!isRecord(value)) {
    return emptySessionManifest()
  }

  const resources = Array.isArray(value.resources)
    ? value.resources.flatMap((resource) => {
        const normalized = normalizeSessionResource(resource)
        return normalized ? [normalized] : []
      })
    : []
  const initialUserKeychains = Array.isArray(value.initialUserKeychains)
    ? value.initialUserKeychains.filter(
        (keychain): keychain is string => typeof keychain === "string",
      )
    : undefined
  const outputs = normalizeOutputs(value.outputs)

  return {
    version: manifestVersion,
    resources,
    ...(initialUserKeychains ? { initialUserKeychains } : {}),
    ...(outputs ? { outputs } : {}),
  }
}

function normalizeSessionResource(
  value: unknown,
): MacosSigningSessionResource | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null
  }

  if (
    (value.type === "temporary-directory" ||
      value.type === "certificate" ||
      value.type === "apple-api-key" ||
      value.type === "keychain") &&
    typeof value.path === "string"
  ) {
    return {
      type: value.type,
      path: value.path,
    }
  }

  if (
    value.type === "notarytool-profile" &&
    typeof value.keychainPath === "string" &&
    typeof value.name === "string"
  ) {
    return {
      type: "notarytool-profile",
      keychainPath: value.keychainPath,
      name: value.name,
    }
  }

  return null
}

function normalizeOutputs(value: unknown): MacosSigningOutputs | undefined {
  if (!isRecord(value) || !isMacosSigningOutputs(value)) {
    return undefined
  }

  return value
}

function isMacosSigningOutputs(
  value: Record<string, unknown>,
): value is MacosSigningOutputs {
  for (const key of githubActionOutputKeys) {
    if (typeof value[key] !== "string") {
      return false
    }
  }
  return true
}

async function writeGithubActionsValues(
  env: ProcessEnvironment,
  outputs: MacosSigningOutputs,
): Promise<void> {
  const serialized = githubActionOutputKeys
    .map((key) => formatGithubActionScalar(key, outputs[key]))
    .join("")

  if (env.GITHUB_ENV) {
    await appendFile(env.GITHUB_ENV, serialized, "utf8")
  }
  if (env.GITHUB_OUTPUT) {
    await appendFile(env.GITHUB_OUTPUT, serialized, "utf8")
  }
}

function formatGithubActionScalar(key: string, value: string): string {
  if (/[\r\n]/u.test(value)) {
    throw new Error(`${key} cannot be written to GitHub Actions files`)
  }
  return `${key}=${value}\n`
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return false
    }
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}
