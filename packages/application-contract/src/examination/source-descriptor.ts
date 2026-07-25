import {
  extensionToLanguage,
  LANGUAGE_CATALOG,
} from "@repo-edu/domain/analysis"

function finalExtension(filePath: string): string {
  const basename = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath
  const index = basename.lastIndexOf(".")
  return index < 0 ? "" : basename.slice(index + 1)
}

export function resolveExaminationSourceDescriptor(filePath: string): string {
  const language = extensionToLanguage(finalExtension(filePath))
  return language === undefined
    ? "unknown language"
    : LANGUAGE_CATALOG[language].label
}
