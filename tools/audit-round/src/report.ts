import { z } from "zod"
import {
  complexitySchema,
  findingLabelSchema,
  growthPatternSchema,
  harmSchema,
  raritySchema,
  reachSchema,
} from "./finding-tokens.js"
import type { ReportFinding, RoundFindingLocation } from "./round-data.js"
import type { Repository } from "./subject.js"
import type { PlanPhase } from "./target.js"

export type FindingIdentity = Pick<ReportFinding, "number" | "tier">
export type JudgedHead = {
  readonly repository: Repository
  readonly head: string
}

export type AuditScope = {
  readonly target: string
  readonly planPhase: PlanPhase | null
  readonly heads: readonly JudgedHead[]
}

export type AuditReport = {
  readonly settling: string
  readonly findings: readonly ReportFinding[]
  readonly judgedRepos: readonly Repository[]
}

export const oneLine = z.string().regex(/^\S[^\r\n]*$/)
export const findingTier = z.enum(["A", "B", "C", "D"])
export const settlingAdvice = z.strictObject({
  recommendation: z.enum(["settle", "keep open"]),
  reason: oneLine,
})

const section = { section: findingLabelSchema }
const area = { area: findingLabelSchema, covers: z.array(findingLabelSchema) }
const planningLocation = z.strictObject({
  kind: z.literal("planning"),
  field: z.enum(["excess", "missing"]),
  ...section,
})
const planLocation = z.strictObject({ kind: z.literal("plan"), ...section })
const repoEduLocation = z.strictObject({ kind: z.literal("repo-edu"), ...area })
const deferredRepoEdu = z.strictObject({
  kind: z.literal("deferred"),
  repository: z.literal("repo-edu"),
  ...area,
})
const deferredPlan = z.strictObject({
  kind: z.literal("deferred"),
  repository: z.literal("plan"),
  plan: z.string().regex(/^[^\]\r\n]*[^\s\]][^\]\r\n]*$/),
})

function locationSchema(scope: AuditScope) {
  if (scope.planPhase !== null) return planningLocation
  if (scope.heads.length === 2) return z.union([planLocation, repoEduLocation])
  return scope.heads[0]?.repository === "plan"
    ? z.union([planLocation, deferredRepoEdu])
    : z.union([repoEduLocation, deferredPlan])
}

export function auditSchema(scope: AuditScope) {
  const fields = {
    title: oneLine
      .refine(
        (title) => !title.includes(": "),
        "Omit colon followed by a space",
      )
      .describe("A one-line finding title without a colon followed by a space"),
    tier: findingTier,
    location: locationSchema(scope),
    growthPattern: growthPatternSchema,
    reach: reachSchema,
    complexity: complexitySchema,
    evidence: z.string().describe("The finding's evidence in Markdown"),
  }
  const finding = z.union([
    z.strictObject({
      ...fields,
      rarity: z.literal("ordinary"),
      harm: z.null(),
    }),
    z.strictObject({
      ...fields,
      rarity: raritySchema.exclude(["ordinary"]),
      harm: harmSchema,
    }),
  ])
  return z.strictObject({
    opening: z
      .string()
      .describe("Free Markdown after the heading, target and judged repos"),
    findings: z.array(finding),
    settling: scope.planPhase === "widening" ? settlingAdvice : z.null(),
  })
}

function placeTokens(location: RoundFindingLocation): readonly string[] {
  switch (location.kind) {
    case "planning":
      return [`[field:${location.field}]`, `[section:${location.section}]`]
    case "plan":
      return [`[section:${location.section}]`]
    case "deferred":
      if (location.repository === "plan") return [`[plan:${location.plan}]`]
      break
  }
  return [
    `[area:${location.area}]`,
    ...location.covers.map((cover) => `[cover:${cover}]`),
  ]
}

export function auditReport(
  scope: AuditScope,
  answer: z.infer<ReturnType<typeof auditSchema>>,
): { readonly text: string; readonly report: AuditReport } {
  const ordered =
    scope.planPhase === null
      ? answer.findings
      : [
          ...answer.findings.filter(
            ({ location }) =>
              location.kind === "planning" && location.field === "excess",
          ),
          ...answer.findings.filter(
            ({ location }) =>
              location.kind === "planning" && location.field === "missing",
          ),
        ]
  const findings = ordered.map(({ evidence, harm, ...fields }, index) => {
    const finding = {
      ...fields,
      number: index + 1,
      ...(harm === null ? {} : { harm }),
    }
    const tokens = [
      ...placeTokens(finding.location),
      `[growth-pattern:${finding.growthPattern}]`,
      `[reach:${finding.reach}]`,
      `[rarity:${finding.rarity}]`,
      ...(harm === null ? [] : [`[harm:${harm}]`]),
      `[complexity:${finding.complexity}]`,
    ]
    return {
      finding,
      text: [
        `### ${finding.number}. ${finding.tier}: ${finding.title}`,
        tokens.join(" "),
        evidence.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    }
  })
  const field = (
    heading: string,
    empty: string,
    members: typeof findings,
  ): string =>
    [
      `## ${heading}`,
      members.length === 0
        ? empty
        : members.map(({ text }) => text).join("\n\n"),
    ].join("\n\n")
  const planningField = (key: "excess" | "missing") =>
    findings.filter(
      ({ finding: { location } }) =>
        location.kind === "planning" && location.field === key,
    )
  const fields =
    scope.planPhase === null
      ? [field("Findings", "No findings.", findings)]
      : [
          field(
            "Excess functionality",
            "No excess findings.",
            planningField("excess"),
          ),
          field(
            "Missing functionality",
            "No missing findings.",
            planningField("missing"),
          ),
        ]
  const settling =
    answer.settling === null
      ? ""
      : `${answer.settling.recommendation}. ${answer.settling.reason}`
  const text = [
    scope.planPhase === null
      ? "# Implementation audit workflow"
      : "# Planning round workflow",
    `Target: ${scope.target}\nJudged repos: ${scope.heads.map(({ repository, head }) => `${repository}@${head.slice(0, 6)}`).join(", ")}`,
    answer.opening.trim(),
    ...fields,
    settling && `Settling: ${settling}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  return {
    text,
    report: {
      settling,
      findings: findings.map(({ finding }) => finding),
      judgedRepos: scope.heads.map(({ repository }) => repository),
    },
  }
}
