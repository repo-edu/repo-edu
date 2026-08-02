export type SelectedFileAdmission =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false }

export function admitSelectedRelativeFilePath(
  value: string,
): SelectedFileAdmission {
  const normalized = value.replaceAll("\\", "/")
  const segments = normalized.split("/")
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return { ok: false }
  }

  return { ok: true, path: segments.join("/") }
}
