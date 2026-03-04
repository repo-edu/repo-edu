import * as XLSX from "xlsx";
import { normalizeHeader } from "./normalize.js";
import type {
  TabularParseResult,
  TabularRow,
  TabularSerializeOptions,
} from "./types.js";

export function parseXlsx(buffer: ArrayBuffer): TabularParseResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (firstSheetName === undefined) {
    return { headers: [], rows: [], rawHeaderNames: [] };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    rawNumbers: false,
  });

  if (allRows.length === 0) {
    return { headers: [], rows: [], rawHeaderNames: [] };
  }

  const rawHeaderNames = allRows[0].map(String);
  const headers = rawHeaderNames.map(normalizeHeader);
  const dataRows = allRows.slice(1);

  const rows: TabularRow[] = [];
  for (const values of dataRows) {
    const row: TabularRow = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const value = i < values.length ? String(values[i]).trim() : "";
      if (header !== "" && value !== "") {
        row[header] = value;
      }
    }
    rows.push(row);
  }

  return { headers, rows, rawHeaderNames };
}

export function serializeXlsx(options: TabularSerializeOptions): ArrayBuffer {
  const aoa: string[][] = [options.headers];
  for (const row of options.rows) {
    aoa.push(options.headers.map((h) => row[h] ?? ""));
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, sheet, options.sheetName ?? "Sheet1");

  const output = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;

  return output;
}
