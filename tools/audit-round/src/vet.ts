import type { ReportFindings } from "./report.js"

/** Verdicts have a fixed line grammar. Any following prose is a condition. */
export function readVet(source: string, findings: ReportFindings): boolean {
  const numbers: number[] = []
  let accepted = true
  for (const line of source.split(/\r?\n/)) {
    if (line.trim().length === 0) continue
    const verdict =
      /^([1-9]\d*)\. \[([A-D])\] (Accept|Revise|Drop|Needs user's ruling)$/.exec(
        line,
      )
    if (verdict !== null) {
      numbers.push(Number(verdict[1]))
      if (verdict[3] !== "Accept") accepted = false
    } else if (
      numbers.length > 0 &&
      line !== "corroborated" &&
      line !== "unique"
    ) {
      accepted = false
    }
  }
  if (
    numbers.length !== findings.length ||
    numbers.some((number, index) => number !== findings[index])
  )
    throw new Error(
      "Vet verdict numbers must match the report's finding numbers exactly",
    )
  return accepted
}
