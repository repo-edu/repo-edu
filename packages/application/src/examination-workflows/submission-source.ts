import type {
  ExaminationAttachedRosterIdentityInput,
  ExaminationPreparedSubmissionSource,
  ExaminationPrepareSubmissionSourceInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import {
  buildSubmissionFolderContentScopeId,
  EXAMINATION_REDACTION_POLICY_VERSION,
  SUBMISSION_FILE_MAX_BYTES,
  SUBMISSION_FILE_MAX_LINES,
  SUBMISSION_FOLDER_PERSON_ID,
  SUBMISSION_SELECTION_MAX_BYTES,
  SUBMISSION_SELECTION_MAX_FILES,
} from "@repo-edu/application-contract"
import {
  DEFAULT_EXTENSIONS,
  normalizeExtension,
} from "@repo-edu/domain/analysis"
import { createValidationAppError } from "../core.js"
import { basename, isAbsolutePath } from "../path-utils.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { ExaminationWorkflowPorts } from "./ports.js"

const GENERIC_FOLDER_LABELS = new Set([
  "code",
  "source",
  "src",
  "student",
  "submission",
  "submissions",
])

type PreparedSubmissionFile = {
  relativePath: string
  bytes: Uint8Array
  decodedText: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validatePrepareSubmissionSourceInput(
  input: unknown,
): ExaminationPrepareSubmissionSourceInput {
  if (!isRecord(input)) {
    throw createValidationAppError(
      "Submission examination source input is invalid.",
      [{ path: "input", message: "Input must be an object." }],
    )
  }
  const issues: { path: string; message: string }[] = []
  if (typeof input.folderPath !== "string") {
    issues.push({ path: "folderPath", message: "folderPath is required." })
  }
  if (
    !Array.isArray(input.selectedRelativePaths) ||
    input.selectedRelativePaths.some((path) => typeof path !== "string")
  ) {
    issues.push({
      path: "selectedRelativePaths",
      message: "selectedRelativePaths must be an array of strings.",
    })
  }
  if (
    !Array.isArray(input.configuredExtensions) ||
    input.configuredExtensions.some(
      (extension) => typeof extension !== "string",
    )
  ) {
    issues.push({
      path: "configuredExtensions",
      message: "configuredExtensions must be an array of strings.",
    })
  }
  if (
    input.attachedRosterIdentities !== undefined &&
    (!Array.isArray(input.attachedRosterIdentities) ||
      input.attachedRosterIdentities.some(
        (identity) => !isRosterIdentity(identity),
      ))
  ) {
    issues.push({
      path: "attachedRosterIdentities",
      message:
        "attachedRosterIdentities must contain roster identity objects when present.",
    })
  }
  if (issues.length > 0) {
    throw createValidationAppError(
      "Submission examination source input is invalid.",
      issues,
    )
  }
  return input as ExaminationPrepareSubmissionSourceInput
}

function isRosterIdentity(
  value: unknown,
): value is ExaminationAttachedRosterIdentityInput {
  if (!isRecord(value)) return false
  for (const field of [
    "name",
    "email",
    "id",
    "lmsUserId",
    "studentNumber",
    "gitUsername",
  ]) {
    const fieldValue = value[field]
    if (fieldValue !== null && typeof fieldValue !== "string") {
      return false
    }
  }
  return true
}

function normalizeExtensionFilter(extensions: readonly string[]): string[] {
  const normalized = [
    ...new Set(
      extensions
        .map((extension) => normalizeExtension(extension))
        .filter((extension) => extension.length > 0),
    ),
  ]
  return normalized.length === 0 ? [...DEFAULT_EXTENSIONS] : normalized
}

function validateAbsoluteFolderPath(folderPath: string): string {
  const normalized = folderPath.trim()
  if (normalized.length === 0 || !isAbsolutePath(normalized)) {
    throw createValidationAppError("Submission folder path is invalid.", [
      {
        path: "folderPath",
        message: "Folder path must be an absolute path.",
      },
    ])
  }
  return normalized
}

function normalizeRelativeFilePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/")
  const parts = normalized.split("/")
  const hasInvalidSegment = parts.some(
    (part) => part.length === 0 || part === "." || part === "..",
  )
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.startsWith("//") ||
    hasInvalidSegment
  ) {
    throw createValidationAppError("Submission file path is invalid.", [
      {
        path: "selectedRelativePaths",
        message: "File path must stay inside the submission folder.",
      },
    ])
  }
  return normalized
}

function assertSelectedFileSet(paths: readonly string[]): string[] {
  const normalized = paths.map(normalizeRelativeFilePath)
  if (normalized.length === 0) {
    throw createValidationAppError("Submission file selection is invalid.", [
      {
        path: "selectedRelativePaths",
        message: "Select at least one file.",
      },
    ])
  }
  if (normalized.length > SUBMISSION_SELECTION_MAX_FILES) {
    throw createValidationAppError("Submission file selection is too large.", [
      {
        path: "selectedRelativePaths",
        message: `Select ${SUBMISSION_SELECTION_MAX_FILES} files or fewer.`,
      },
    ])
  }
  if (new Set(normalized).size !== normalized.length) {
    throw createValidationAppError("Submission file selection is invalid.", [
      {
        path: "selectedRelativePaths",
        message: "Selected file paths must be unique.",
      },
    ])
  }
  return normalized.toSorted()
}

async function assertExistingDirectory(
  ports: ExaminationWorkflowPorts,
  folderPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const status = await ports.fileSystem.stat({ path: folderPath, signal })
  if (status.kind !== "directory") {
    throw createValidationAppError("Submission folder path is invalid.", [
      {
        path: "folderPath",
        message: "Folder path must point to an existing directory.",
      },
    ])
  }
}

function decodeSubmissionFileBytes(bytes: Uint8Array): string {
  if (bytes.byteLength > SUBMISSION_FILE_MAX_BYTES) {
    throw createValidationAppError("Submission file is too large.", [
      {
        path: "selectedRelativePaths",
        message: `Each file must be ${Math.round(
          SUBMISSION_FILE_MAX_BYTES / 1024,
        )} KiB or less.`,
      },
    ])
  }
  let decodedText: string
  try {
    decodedText = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch (_error) {
    throw createValidationAppError("Submission file is not valid UTF-8.", [
      {
        path: "selectedRelativePaths",
        message: "Selected source files must be valid UTF-8 text.",
      },
    ])
  }
  if (decodedText.split("\n").length > SUBMISSION_FILE_MAX_LINES) {
    throw createValidationAppError("Submission file has too many lines.", [
      {
        path: "selectedRelativePaths",
        message: `Each file must contain ${SUBMISSION_FILE_MAX_LINES} lines or fewer.`,
      },
    ])
  }
  return decodedText
}

function normalizeIdentityText(value: string): string {
  return value.trim().split(/\s+/).join(" ")
}

function containsAsciiLetter(value: string): boolean {
  return /[A-Za-z]/.test(value)
}

function pushNormalized(values: string[], value: string | null): void {
  if (value === null) return
  const normalized = normalizeIdentityText(value)
  if (normalized.length > 0) {
    values.push(normalized)
  }
}

function dedupe(values: readonly string[], caseSensitive: boolean): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const key = caseSensitive ? value : value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function addRosterIdentity(
  context: ExaminationPreparedSubmissionSource["localIdentityContext"],
  identity: ExaminationAttachedRosterIdentityInput,
): void {
  pushNormalized(context.names, identity.name)
  pushNormalized(context.emails, identity.email)

  for (const value of [
    identity.id,
    identity.lmsUserId,
    identity.studentNumber,
  ]) {
    const normalized = value === null ? "" : normalizeIdentityText(value)
    if (containsAsciiLetter(normalized)) {
      context.opaqueIdentifiers.push(normalized)
    }
  }
  pushNormalized(context.gitUsernames, identity.gitUsername)
}

function addFolderLabelIdentity(
  context: ExaminationPreparedSubmissionSource["localIdentityContext"],
  folderPath: string,
): void {
  const label = basename(folderPath)
  const decoded = (() => {
    try {
      return decodeURIComponent(label)
    } catch (_error) {
      return label
    }
  })()
  const normalizedLabel = normalizeIdentityText(decoded)
  const spacedLabel = normalizeIdentityText(
    normalizedLabel.replace(/[-_.]+/g, " "),
  )
  const labelKey = spacedLabel.toLowerCase()
  if (
    !containsAsciiLetter(spacedLabel) ||
    GENERIC_FOLDER_LABELS.has(labelKey)
  ) {
    return
  }

  context.opaqueIdentifiers.push(normalizedLabel)
  context.gitUsernames.push(normalizedLabel)
  if (spacedLabel !== normalizedLabel || /\s/.test(spacedLabel)) {
    context.names.push(spacedLabel)
  }
}

function buildSubmissionLocalIdentityContext(params: {
  folderPath: string
  attachedRosterIdentities: readonly ExaminationAttachedRosterIdentityInput[]
}): ExaminationPreparedSubmissionSource["localIdentityContext"] {
  const context: ExaminationPreparedSubmissionSource["localIdentityContext"] = {
    names: [],
    emails: [],
    opaqueIdentifiers: [],
    gitUsernames: [],
  }
  for (const identity of params.attachedRosterIdentities) {
    addRosterIdentity(context, identity)
  }
  addFolderLabelIdentity(context, params.folderPath)
  return {
    names: dedupe(context.names, false),
    emails: dedupe(context.emails, false),
    opaqueIdentifiers: dedupe(context.opaqueIdentifiers, true),
    gitUsernames: dedupe(context.gitUsernames, false),
  }
}

function formatBytes(byteCount: number): string {
  if (byteCount < 1024) return `${byteCount} B`
  if (byteCount < 1024 * 1024) return `${Math.round(byteCount / 1024)} KiB`
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MiB`
}

function formatTokenEstimate(charCount: number): string {
  const tokens = Math.ceil(charCount / 4)
  if (tokens < 1_000) return `${tokens}`
  if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}K`
  return `${Math.round(tokens / 1_000)}K`
}

function displaySubtitle(files: readonly PreparedSubmissionFile[]): string {
  const totalChars = files.reduce(
    (total, file) => total + file.decodedText.length,
    0,
  )
  const totalBytes = files.reduce(
    (total, file) => total + file.bytes.byteLength,
    0,
  )
  return `${files.length} file${
    files.length === 1 ? "" : "s"
  } · ${formatBytes(totalBytes)} · ~${formatTokenEstimate(totalChars)} tokens`
}

export function createPrepareSubmissionSourceHandler(
  ports: ExaminationWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"examination.prepareSubmissionSource">,
  "examination.prepareSubmissionSource"
> {
  return {
    "examination.prepareSubmissionSource": async (input, options) => {
      const typedOptions = options as
        | WorkflowCallOptions<never, never>
        | undefined
      const signal = typedOptions?.signal
      const validated = validatePrepareSubmissionSourceInput(input)
      const folderPath = validateAbsoluteFolderPath(validated.folderPath)
      const selectedRelativePaths = assertSelectedFileSet(
        validated.selectedRelativePaths,
      )
      const configuredExtensions = normalizeExtensionFilter(
        validated.configuredExtensions,
      )

      throwIfAborted(signal)
      await assertExistingDirectory(ports, folderPath, signal)
      const matchingFiles = await ports.fileSystem.listFiles({
        rootPath: folderPath,
        extensions: configuredExtensions,
        signal,
      })
      throwIfAborted(signal)

      const matchingFileByPath = new Map(
        matchingFiles.map((file) => [file.relativePath, file]),
      )
      const selectedMatchingFiles = selectedRelativePaths.map(
        (relativePath) => {
          const file = matchingFileByPath.get(relativePath)
          if (file === undefined) {
            throw createValidationAppError(
              "Submission file selection is invalid.",
              [
                {
                  path: "selectedRelativePaths",
                  message:
                    "Selected files must match the current configured extension filter.",
                },
              ],
            )
          }
          return file
        },
      )
      const listedBytes = selectedMatchingFiles.reduce(
        (total, file) => total + file.size,
        0,
      )
      if (listedBytes > SUBMISSION_SELECTION_MAX_BYTES) {
        throw createValidationAppError(
          "Submission file selection is too large.",
          [
            {
              path: "selectedRelativePaths",
              message: `Selected files must total ${formatBytes(
                SUBMISSION_SELECTION_MAX_BYTES,
              )} or less.`,
            },
          ],
        )
      }

      const files: PreparedSubmissionFile[] = []
      for (const relativePath of selectedRelativePaths) {
        throwIfAborted(signal)
        const result = await ports.fileSystem.readFileInsideRoot({
          rootPath: folderPath,
          relativePath,
          maxBytes: SUBMISSION_FILE_MAX_BYTES,
          signal,
        })
        throwIfAborted(signal)
        const decodedText = decodeSubmissionFileBytes(result.bytes)
        files.push({
          relativePath: result.relativePath,
          bytes: result.bytes,
          decodedText,
        })
      }
      const actualBytes = files.reduce(
        (total, file) => total + file.bytes.byteLength,
        0,
      )
      if (actualBytes > SUBMISSION_SELECTION_MAX_BYTES) {
        throw createValidationAppError(
          "Submission file selection is too large.",
          [
            {
              path: "selectedRelativePaths",
              message: `Selected files must total ${formatBytes(
                SUBMISSION_SELECTION_MAX_BYTES,
              )} or less.`,
            },
          ],
        )
      }

      const excerptFileSources: Record<string, string> = {}
      for (const file of files) {
        excerptFileSources[file.relativePath] = file.decodedText
      }

      return {
        folderPath,
        personId: SUBMISSION_FOLDER_PERSON_ID,
        displayTitle: basename(folderPath),
        displaySubtitle: displaySubtitle(files),
        contentScopeId: buildSubmissionFolderContentScopeId(files),
        localIdentityContext: buildSubmissionLocalIdentityContext({
          folderPath,
          attachedRosterIdentities: validated.attachedRosterIdentities ?? [],
        }),
        redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
        excerpts: files.map((file) => ({
          filePath: file.relativePath,
          startLine: 1,
          lines: file.decodedText.split("\n"),
        })),
        excerptFileSources,
      }
    },
  }
}
