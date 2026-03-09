import Papa from "papaparse"
import { normalizeHeader } from "./normalize.js"

function isEmptyRow(values) {
  return values.every((v) => v.trim() === "")
}
export function parseCsv(text) {
  const parsed = Papa.parse(text, {
    header: false,
    skipEmptyLines: false,
  })
  const allRows = parsed.data
  if (allRows.length === 0) {
    return { headers: [], rows: [], rawHeaderNames: [] }
  }
  const rawHeaderNames = allRows[0]
  const headers = rawHeaderNames.map(normalizeHeader)
  const dataRows = allRows.slice(1)
  const rows = []
  for (const values of dataRows) {
    if (isEmptyRow(values)) continue
    const row = {}
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]
      const value = i < values.length ? values[i].trim() : ""
      if (header !== "" && value !== "") {
        row[header] = value
      }
    }
    rows.push(row)
  }
  return { headers, rows, rawHeaderNames }
}
export function serializeCsv(options) {
  const data = options.rows.map((row) =>
    options.headers.map((h) => row[h] ?? ""),
  )
  return Papa.unparse({
    fields: options.headers,
    data,
  })
}
