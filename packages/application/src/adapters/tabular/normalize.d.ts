/**
 * Normalize a tabular header value to a canonical form.
 *
 * Ported from the legacy Rust `normalize_header`:
 * - lowercase
 * - replace non-alphanumeric characters with `_`
 * - collapse consecutive `_`
 * - trim leading/trailing `_`
 */
export declare function normalizeHeader(value: string): string
//# sourceMappingURL=normalize.d.ts.map
