import Papa from "papaparse";
import { normalizeHeader } from "./normalize.js";
import type {
  TabularParseResult,
  TabularRow,
  TabularSerializeOptions,
} from "./types.js";

function isEmptyRow(values: string[]): boolean {
  return values.every((v) => v.trim() === "");
}

export function parseCsv(text: string): TabularParseResult {
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });

  const allRows = parsed.data;
  if (allRows.length === 0) {
    return { headers: [], rows: [], rawHeaderNames: [] };
  }

  const rawHeaderNames = allRows[0];
  const headers = rawHeaderNames.map(normalizeHeader);
  const dataRows = allRows.slice(1);

  const rows: TabularRow[] = [];
  for (const values of dataRows) {
    if (isEmptyRow(values)) continue;

    const row: TabularRow = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const value = i < values.length ? values[i].trim() : "";
      if (header !== "" && value !== "") {
        row[header] = value;
      }
    }
    rows.push(row);
  }

  return { headers, rows, rawHeaderNames };
}

export function serializeCsv(options: TabularSerializeOptions): string {
  const data = options.rows.map((row) =>
    options.headers.map((h) => row[h] ?? ""),
  );
  return Papa.unparse({
    fields: options.headers,
    data,
  });
}
