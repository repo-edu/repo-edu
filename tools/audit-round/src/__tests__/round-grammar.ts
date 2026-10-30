import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export type RoundGrammarExample = {
  readonly id: string
  readonly outcome: "parsed" | "refused"
  readonly refusal: string | null
  readonly source: string
}

const grammar = fileURLToPath(
  new URL("../../../../.agents/references/round-grammar.md", import.meta.url),
)

const formPrefixes = [
  "report/",
  "vet/",
  "rebuttal/",
  "record/",
  "plan-step/",
  "phase-result/",
  "watch-grade/",
  "judge/",
  "watch/",
] as const

let cached: readonly RoundGrammarExample[] | null = null

/** Read every labelled fenced example from the round grammar. */
export function roundGrammarExamples(
  prefix?: string,
): readonly RoundGrammarExample[] {
  if (cached === null) {
    const source = readFileSync(grammar, "utf8")
    const headings = [
      ...source.matchAll(/^#### `([^`]+)` — (parsed|refused)$/gm),
    ].filter((heading) => heading[1] !== "<case-id>")
    const cases = [
      ...source.matchAll(
        /^#### `([^`]+)` — (parsed|refused)\n\n(?:Refusal: `([^`]+)`\n\n)?```[^\n]*\n([\s\S]*?)\n```$/gm,
      ),
    ].filter((example) => example[1] !== "<case-id>")
    if (cases.length !== headings.length)
      throw new Error(
        `Round grammar has ${headings.length} case headings but ${cases.length} readable examples`,
      )
    const examples: RoundGrammarExample[] = []
    for (const example of cases) {
      const refusal = example[3] ?? null
      if ((example[2] === "refused") !== (refusal !== null))
        throw new Error(
          `Round grammar case ${example[1]} has inconsistent refusal metadata`,
        )
      examples.push({
        id: example[1],
        outcome: example[2] as "parsed" | "refused",
        refusal,
        source: example[4],
      })
    }
    if (examples.length === 0)
      throw new Error("Round grammar has no labelled examples")
    for (const example of examples) {
      if (!formPrefixes.some((prefix) => example.id.startsWith(prefix)))
        throw new Error(
          `Round grammar example ${example.id} does not belong to a tested form`,
        )
    }
    cached = examples
  }
  const selected =
    prefix === undefined
      ? cached
      : cached.filter((example) => example.id.startsWith(prefix))
  if (selected.length === 0)
    throw new Error(`Round grammar has no ${prefix ?? ""} examples`)
  return selected
}

export function roundGrammarExample(id: string): RoundGrammarExample {
  const example = roundGrammarExamples().find(
    (candidate) => candidate.id === id,
  )
  if (example === undefined)
    throw new Error(`Round grammar has no example ${id}`)
  return example
}
