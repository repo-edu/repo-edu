/**
 * Normalize a tabular header value to a canonical form.
 *
 * Ported from the legacy Rust `normalize_header`:
 * - lowercase
 * - replace non-alphanumeric characters with `_`
 * - collapse consecutive `_`
 * - trim leading/trailing `_`
 */
export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}
