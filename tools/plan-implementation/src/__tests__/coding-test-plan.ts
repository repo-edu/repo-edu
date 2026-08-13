import type {
  CodingRequest,
  CommittedImplementationPlan,
  PlanSourceSpan,
} from "../contracts.js"

const markdown = [
  "# Test plan",
  "",
  "## Implementation plan",
  "",
  "1. **First step.** Change the first owner.",
  "",
  "2. **Second step.** Change the second owner.",
  "",
].join("\n")

function sourcePoint(offset: number) {
  const prefix = markdown.slice(0, offset)
  const lines = prefix.split("\n")
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
    offset,
  }
}

function sourceSpan(start: number, end: number): PlanSourceSpan {
  return { start: sourcePoint(start), end: sourcePoint(end) }
}

const firstStart = markdown.indexOf("1. **First step.**")
const secondStart = markdown.indexOf("2. **Second step.**")
const firstEnd = secondStart - 2
const secondEnd = markdown.length - 1

export function testCodingRequest(activeStep = 2): CodingRequest {
  const plan: CommittedImplementationPlan = {
    source: {
      planName: "test-plan",
      planPath: "/plans/plan-test-plan.md",
      commitOid: "a".repeat(40),
      blobOid: "b".repeat(40),
    },
    markdown,
    implementationListSpan: sourceSpan(firstStart, secondEnd),
    steps: [
      {
        number: 1,
        title: "First step",
        sourceSpan: sourceSpan(firstStart, firstEnd),
        proofs: { items: [], sourceSpan: null },
      },
      {
        number: 2,
        title: "Second step",
        sourceSpan: sourceSpan(secondStart, secondEnd),
        proofs: { items: [], sourceSpan: null },
      },
    ],
  }

  return { repoEduRoot: "/repo-edu", plan, activeStep }
}
