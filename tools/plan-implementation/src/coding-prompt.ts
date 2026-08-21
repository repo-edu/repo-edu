import type { CodingRequest, PlanImplementationStep } from "./contracts.js"

export const activeStepStartMarker = "<repo-edu-active-step>"
export const activeStepEndMarker = "</repo-edu-active-step>"

function resolveActiveStep(request: CodingRequest): PlanImplementationStep {
  const step = request.plan.steps[request.activeStep - 1]
  if (step?.number !== request.activeStep) {
    throw new Error(
      `The coding request does not contain implementation step ${request.activeStep}.`,
    )
  }
  return step
}

export function markActivePlanStep(request: CodingRequest): string {
  const step = resolveActiveStep(request)
  const { start, end } = step.sourceSpan
  const source = request.plan.markdown
  if (
    source.includes(activeStepStartMarker) ||
    source.includes(activeStepEndMarker)
  ) {
    throw new Error("The plan contains reserved active-step markers.")
  }
  if (
    start.offset < 0 ||
    end.offset <= start.offset ||
    end.offset > source.length
  ) {
    throw new Error(
      "The active implementation step has an invalid source span.",
    )
  }

  return [
    source.slice(0, start.offset),
    activeStepStartMarker,
    "\n",
    source.slice(start.offset, end.offset),
    "\n",
    activeStepEndMarker,
    source.slice(end.offset),
  ].join("")
}

export function buildCodingPrompt(request: CodingRequest): string {
  const step = resolveActiveStep(request)
  return [
    `Implement only Repo Edu plan step ${step.number}: ${step.title}.`,
    "",
    "The full committed plan appears below. The parser markers identify the only top-level implementation step you may implement.",
    "",
    "Work rules:",
    `- Work only inside the Repo Edu checkout at ${request.repoEduRoot}.`,
    "- Follow every applicable AGENTS.md instruction in that checkout.",
    "- Do not edit the plan checkout or any planning document.",
    "- Do not work on an earlier or later implementation step.",
    "- Do not create or switch branches.",
    "- Do not run Git commands that write state, including add, commit, reset, checkout, switch, restore, clean, stash, branch, merge, rebase, cherry-pick, tag or push.",
    "- You may use read-only Git commands.",
    "- You may run pnpm install when a dependency manifest change requires it.",
    "- Run only package check scripts and focused test files for feedback.",
    "- Never run root pnpm check or root pnpm test. The runner owns the independent package or final root checks after your result.",
    "- When work depends on an external API, package, or tool, use live web search and open the selected source page. Never use a search-result snippet as evidence.",
    "- Return succeeded only after the active step is implemented. Include one valid severity-prefixed commit subject and short decision-and-reason bullets.",
    "- Return blocked when the active step cannot be completed safely. State the concrete reason.",
    "- Do not return proof choices or proof results.",
    "",
    "Full plan with one active step:",
    "",
    markActivePlanStep(request),
  ].join("\n")
}
