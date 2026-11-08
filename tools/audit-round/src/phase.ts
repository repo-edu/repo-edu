import { join } from "node:path"
import type { CleanCompletion, CleanInput } from "./clean.js"
import type { PlanRoots } from "./context.js"
import type { WatchEvidence, WatchEvidenceInput } from "./episode.js"
import type { GlanceDecision, GlanceInput, WatchGrade } from "./glance.js"
import type { JudgeEvidence, JudgeEvidenceInput } from "./judge.js"
import type { LifecycleCommit } from "./lifecycle.js"
import type { OpenDeferral } from "./open-deferrals.js"
import type { AuditReport, ReportClass, ReportFindings } from "./report.js"
import type {
  FindingRebuttal,
  FindingReview,
  JudgeAnswer,
  JudgeDecision,
  LandedCommit,
  RoundAccount,
} from "./round-data.js"
import type {
  Auditor,
  Coder,
  PhaseSelection,
  RoundSettings,
} from "./settings.js"
import type { Repository } from "./subject.js"
import type { CommitAuditGroup, RoundContext } from "./target.js"
import type { VetReading } from "./vet.js"

export type Assistant = "claude" | "codex"

/** The letter a commit subject's capability tag opens with, naming the vendor. */
export const assistantLetters: Record<Assistant, "a" | "o"> = {
  claude: "a",
  codex: "o",
}

/**
 * The phases an assistant session can run. `implement` and `close` run alone;
 * the other phases belong to an audit round.
 */
export type Phase =
  | "audit"
  | "vet"
  | "rebut"
  | "fix"
  | "implement"
  | "watch"
  | "judge"
  | "close"

export type RoundPhase = Exclude<Phase, "implement">

/** Each phase's skill name, which names its workflow folder and launchers. */
export const phaseSkills: Record<Phase, string> = {
  audit: "audit",
  vet: "vet",
  rebut: "rebut",
  fix: "fix",
  implement: "implement",
  watch: "watch",
  judge: "judge",
  close: "close",
}

/**
 * Manual and automated phases share one workflow selection. Loop-close is plan
 * doctrine, so its workflow lives in the plan checkout beside its launchers.
 */
export function phaseWorkflow(input: RoundContext & { phase: Phase }): string {
  const root =
    input.phase === "close" || input.phase === "judge"
      ? input.planRoot
      : input.phase === "implement"
        ? input.repoEduRoot
        : recorded(input.phase)
          ? input.cwd
          : input.repoEduRoot
  return join(
    root,
    ".agents/skills",
    phaseSkills[input.phase],
    "references/workflow.md",
  )
}

export function phaseLauncher(
  input: RoundContext & { phase: Phase; assistant: Assistant },
): string | null {
  if (!recorded(input.phase)) return null
  const root = join(input.planRoot, "home")
  const skill = phaseSkills[input.phase]
  return input.assistant === "claude"
    ? join(root, "claude", "commands", `${skill}.md`)
    : join(root, "agents", "skills", skill, "SKILL.md")
}

/** The model tiers a round may ask its auditor for, as the command line names them. */
export const strengths = ["base", "top"] as const
export type Strength = (typeof strengths)[number]

/** The reasoning efforts a round may ask for. Both CLIs answer to these four words. */
export const efforts = ["low", "medium", "high", "xhigh"] as const
export type Effort = (typeof efforts)[number]

/** The command-line option an auditor selection came from. */
export type AuditorOption = "--auditor" | "--first"

/** The command route that supplied a round's auditor. */
export type AuditorSelectionSource = "settings" | AuditorOption

/**
 * What the auditor's phases run on in place of the assistant's default
 * selection. `none` keeps the defaults, as a chained deferral round does. A
 * listed entry names both fields from the `auditors` list. An assistant name
 * on the command line keeps the defaults under its option's name. A tag names
 * its option, so the settings header says which one set a field; a null tag
 * field reads the defaults. The override binds audit and rebuttal because the
 * rebuttal is the auditor's answer.
 */
export type AuditorOverride =
  | "none"
  | {
      readonly listed: { readonly model: string; readonly effort: Effort }
    }
  | { readonly option: AuditorOption; readonly defaults: true }
  | {
      readonly option: AuditorOption
      readonly strength: Strength | null
      readonly effort: Effort | null
    }

/** An auditor nothing names beyond its assistant, which every other phase is. */
export const noOverride: AuditorOverride = "none"

/**
 * The letter a capability tag gives a strength: `b` for the base tier and `t`
 * for the top one. A model the ladder does not name reads `u`, unlisted.
 */
export const strengthLetters: Record<Strength, "b" | "t"> = {
  base: "b",
  top: "t",
}

/** The letter a capability tag closes with, naming the reasoning effort. */
export const effortLetters: Record<Effort, "l" | "m" | "h" | "x"> = {
  low: "l",
  medium: "m",
  high: "h",
  xhigh: "x",
}

/** Who audits a round, and whatever the list or command line named of the model. */
export type AuditorSeat = {
  readonly assistant: Assistant
  readonly override: AuditorOverride
}

/** The seat that runs one `auditors` entry. */
export function listedSeat(auditor: Auditor): AuditorSeat {
  return {
    assistant: auditor.assistant,
    override: { listed: { model: auditor.model, effort: auditor.effort } },
  }
}

function named<K extends string>(
  letters: Record<K, string>,
  letter: string | undefined,
): K | null {
  if (letter === undefined) return null
  const keys = Object.keys(letters) as K[]
  return keys.find((key) => letters[key] === letter) ?? null
}

/**
 * Assistant names select the assistant's default selection. Capability tags
 * may name a tier and effort; unnamed fields read the defaults. The three
 * alphabets share no letter, so a partial tag says
 * which fields it named. The `u` a subject may carry says the model is on
 * neither tier, which is a reading and not a request, so it is not accepted.
 */
export function parseAuditor(
  value: string,
  option: AuditorOption,
): AuditorSeat | null {
  if (value === "claude" || value === "codex")
    return { assistant: value, override: { option, defaults: true } }
  const match = /^([ao])([bt])?([lmhx])?$/.exec(value)
  if (match === null) return null
  const assistant = named(assistantLetters, match[1])
  if (assistant === null) return null
  return {
    assistant,
    override: {
      option,
      strength: named(strengthLetters, match[2]),
      effort: named(effortLetters, match[3]),
    },
  }
}

/** The tag letter a reported effort takes, or null when it is not one of the four. */
export function effortLetter(effort: string): string | null {
  // A CLI may report an effort outside the four the tag can spell.
  return effortLetters[effort as Effort] ?? null
}

/**
 * Which strength a reported model belongs to, or null when it belongs to
 * neither. The table names a family and a CLI reports one release of it, so a
 * reported `claude-opus-5` answers to the `opus` entry.
 */
export function modelStrength(
  assistant: Assistant,
  model: string,
  config: RoundSettings,
): Strength | null {
  return (
    strengths.find((strength) =>
      model.includes(config.strengthModels[assistant][strength]),
    ) ?? null
  )
}

/** One field of a phase's selection, with what named it. */
export type PinnedField<Value extends string = string> = {
  readonly value: Value
  /** What named the field, as the run's settings header prints it. */
  readonly source: string
}

/**
 * What a phase runs on. Every field is named: by the command line, by the
 * phase's own pin or by the assistant's default selection. The CLI's own
 * configuration never enters.
 */
export type PinnedModel = {
  readonly model: PinnedField
  readonly effort: PinnedField<Effort>
}

/** Who fills one phase of a round, and what that phase runs on. */
export type PhaseRun = {
  readonly assistant: Assistant
  readonly model: PinnedModel
}

/** An assistant's default selection, as the settings header names it. */
export function defaultModel(
  assistant: Assistant,
  config: RoundSettings,
  source = "audit-round defaults",
): PinnedModel {
  const { model, effort } = config.defaults[assistant]
  return { model: { value: model, source }, effort: { value: effort, source } }
}

/**
 * What the audit and the rebuttal it shares run on. A listed entry names both
 * fields; a command-line name or tag names what it spells; every field nothing
 * names reads the assistant's default selection.
 */
function auditModel(seat: AuditorSeat, config: RoundSettings): PinnedModel {
  const { assistant, override } = seat
  if (override === "none") return defaultModel(assistant, config)
  if ("listed" in override) {
    const source = "audit-round auditors"
    return {
      model: { value: override.listed.model, source },
      effort: { value: override.listed.effort, source },
    }
  }
  if ("defaults" in override)
    return defaultModel(assistant, config, override.option)
  const defaults = defaultModel(assistant, config)
  return {
    model:
      override.strength !== null
        ? {
            value: config.strengthModels[assistant][override.strength],
            source: override.option,
          }
        : defaults.model,
    effort:
      override.effort !== null
        ? { value: override.effort, source: override.option }
        : defaults.effort,
  }
}

/**
 * The phases outside the auditor's use their configured selection, whose
 * `default` reads the assistant's default selection.
 */
function phaseModel(
  phase: Exclude<Phase, "audit" | "rebut" | "fix" | "implement">,
  assistant: Assistant,
  config: RoundSettings,
): PinnedModel {
  const pin: PhaseSelection =
    phase === "vet" ? config.phases.vet[assistant] : config.phases[phase]
  const defaults = defaultModel(assistant, config)
  const own = <Value extends string>(value: Value): PinnedField<Value> => ({
    value,
    source: "audit-round settings",
  })
  return {
    model: pin.model === "default" ? defaults.model : own(pin.model),
    effort: pin.effort === "default" ? defaults.effort : own(pin.effort),
  }
}

/**
 * The single owner of who runs each round phase and on what. The runner invokes
 * from this value and the run's settings header prints it, so what a run says
 * it ran on is what it ran with.
 */
export function roundPhases(
  auditor: Assistant,
  override: AuditorOverride,
  config: RoundSettings,
  fixer: Coder = config.coders[0],
  fixerSource = "audit-round coders",
): Record<RoundPhase, PhaseRun> {
  const run = (
    phase: Exclude<Phase, "audit" | "rebut" | "fix" | "implement">,
    assistant: Assistant,
  ): PhaseRun => ({
    assistant,
    model: phaseModel(phase, assistant, config),
  })
  const audit: PhaseRun = {
    assistant: auditor,
    model: auditModel({ assistant: auditor, override }, config),
  }
  const fix = implementationPhase(fixer, fixerSource)
  return {
    audit,
    // The vetter is the other assistant, so no assistant vets its own report.
    vet: run("vet", auditor === "codex" ? "claude" : "codex"),
    // The rebuttal is the auditor's answer, using the same model and effort.
    rebut: audit,
    // The plan's ready assignment chooses the fixer. Work without one uses the first coder.
    fix,
    // The watch reads joined trajectory evidence, so the auditor does not select it.
    watch: run("watch", config.phases.watch.assistant),
    // The judge reads retained evidence and uses its own cheap setting.
    judge: run("judge", config.phases.judge.assistant),
    close: closePhase(config),
  }
}

/** A plan's ready-assigned coder owns both implementation and audit fixes. */
export function implementationPhase(
  coder: Coder,
  source = "ready assignment",
): PhaseRun {
  return {
    assistant: coder.assistant,
    model: {
      model: { value: coder.model, source },
      effort: { value: coder.effort, source },
    },
  }
}

/** Loop-close is no part of a round; it runs alone on its own settings, whoever audits. */
export function closePhase(config: RoundSettings): PhaseRun {
  const assistant = config.phases.close.assistant
  return { assistant, model: phaseModel("close", assistant, config) }
}

/**
 * Every model a round's phases may name for one assistant, whoever audits:
 * the default selection, each listed auditor and coder, each phase's own pin
 * and each tier a tag can ask for.
 */
export function namedModels(
  assistant: Assistant,
  config: RoundSettings,
): ReadonlySet<string> {
  const names = new Set<string>([
    config.defaults[assistant].model,
    ...[...config.auditors, ...config.coders]
      .filter((entry) => entry.assistant === assistant)
      .map((entry) => entry.model),
  ])
  for (const auditor of ["claude", "codex"] as const)
    for (const strength of [null, ...strengths])
      for (const run of Object.values(
        roundPhases(
          auditor,
          { option: "--auditor", strength, effort: null },
          config,
        ),
      ))
        if (run.assistant === assistant) names.add(run.model.model.value)
  return names
}

/**
 * The phases that carry out the round's work: each runs from the working
 * checkout under a launcher and the round's commit model record names it. The
 * ruling and the watch are separate documents.
 */
export function recorded(phase: Phase): boolean {
  return (
    phase === "audit" || phase === "vet" || phase === "rebut" || phase === "fix"
  )
}

/**
 * The phases whose texts enter the round transcript. The judge's one-line
 * answer joins the recorded phases because it is the round's recommendation on
 * how to continue, which the user reads from the transcript after the terminal
 * has scrolled; it has no launcher and no place in the model record.
 */
export function transcribed(phase: Phase): boolean {
  return recorded(phase) || phase === "judge"
}

/** The open-deferral object a phase receives. */
export type DeferralScope = {
  readonly deferrals: readonly OpenDeferral[]
}

type PhaseArguments = {
  audit: {
    readonly arguments: readonly [
      report: string,
      target: string | CommitAuditGroup,
      ...scopeGroupsOrDeferrals: (string | CommitAuditGroup | DeferralScope)[],
    ]
    readonly sessionId: null
  }
  vet: {
    readonly arguments: readonly [report: string, vet: string]
    readonly sessionId: null
  }
  rebut: {
    readonly arguments: readonly [report: string, vet: string, rebut: string]
    readonly sessionId: null
  }
  fix: {
    readonly arguments: readonly [
      report: string,
      ...twinsOrDeferrals: (string | DeferralScope)[],
    ]
    readonly rulingFile: string
  } & (
    | { readonly sessionId: null; readonly rulingReply?: never }
    | {
        readonly sessionId: string
        readonly rulingReply: string
      }
  )
  implement: {
    readonly arguments: readonly [
      plan: string,
      step: number,
      shares: readonly Repository[],
      release: string,
      effort: Effort,
    ]
    readonly rulingFile: string
  } & (
    | { readonly sessionId: null; readonly rulingReply?: never }
    | {
        readonly sessionId: string
        /** Absent when a failed worker resumes on the generic continuation. */
        readonly rulingReply?: string
      }
  )
  watch: {
    readonly evidence: string
    readonly arguments: readonly []
    readonly sessionId: null
  }
  judge: {
    readonly evidence: JudgeEvidence
    readonly options: readonly JudgeDecision[]
    readonly arguments: readonly []
    readonly sessionId: null
  }
  close: {
    /** An abort reason closes an episode that never shipped. */
    readonly arguments:
      | readonly [
          plan: string,
          tag: string,
          record: string,
          deferrals: DeferralScope,
        ]
      | readonly [
          plan: string,
          tag: string,
          record: string,
          deferrals: DeferralScope,
          reason: string,
        ]
    readonly sessionId: null
  }
}

type PhaseInputs = {
  [K in Phase]: PhaseArguments[K] &
    PhaseRun &
    RoundContext & {
      readonly phase: K
    }
}

export type PhaseInput<P extends Phase = Phase> = PhaseInputs[P]

export type AssistantTurnInput = PhaseInput

/** One commit record a finished fix landed, with its hosting repository. */
export type LandedRecord = LandedCommit & {
  readonly subject: string
  readonly message: string
}

export type PhaseFailure = {
  readonly status: "failed"
  readonly reason: string
  readonly sessionId: string | null
}

/** One measurement of how full an assistant's session is. */
export type SessionContext = {
  readonly tokens: number
  /** Null when the assistant does not report the size of its window. */
  readonly window: number | null
}

type ReportResult = {
  readonly status: "finished"
  readonly sessionId: string
}

export type WatchResult = ReportResult & {
  readonly document: string
  readonly grade: WatchGrade
  readonly compactions: number
}

/**
 * A finished fix carries the settling line it returned, or null when it
 * returned none. Only a widening round requires one; the round enforces that.
 */
type FixResult =
  | {
      readonly status: "finished"
      readonly sessionId: string
      readonly settling: string | null
    }
  | {
      readonly status: "needs-ruling"
      readonly sessionId: string
    }

type ImplementResult =
  | ReportResult
  | {
      readonly status: "needs-ruling"
      readonly sessionId: string
    }

type PhaseControlResults = {
  audit: ReportResult
  vet: ReportResult
  rebut: ReportResult
  fix: FixResult
  implement: ImplementResult
  watch: ReportResult
  judge: ReportResult
  close: ReportResult
}

/** The final control line before a phase admits any returned document. */
export type PhaseControlResult<P extends Phase = Phase> =
  | PhaseFailure
  | PhaseControlResults[P]

type PhaseResults = {
  audit: ReportResult
  vet: ReportResult
  rebut: ReportResult
  fix: FixResult
  implement: ImplementResult
  watch: WatchResult
  judge: ReportResult
  close: ReportResult
}

/** Internal results, admitted only after the complete invocation has settled. */
export type PhaseResult<P extends Phase = Phase> =
  | PhaseFailure
  | PhaseResults[P]

export type JudgeResult =
  | PhaseFailure
  | {
      readonly status: "finished"
      readonly sessionId: string
      readonly answer: JudgeAnswer
    }

/**
 * A session the user is handed or told how to resume. It carries its phase's run, so
 * a resumed session continues on the model the round ran it on.
 */
export type InteractiveSession = PhaseRun &
  RoundContext & {
    readonly sessionId: string
  }

export type RoundDependencies = {
  readonly deleteRoundReports: (
    cwd: string,
    nameStart: string,
  ) => Promise<readonly string[]>
  readonly checkFile: (file: string) => Promise<void>
  readonly completeClean: (input: CleanInput) => Promise<CleanCompletion>
  readonly readReport: (
    file: string,
    reportClass: ReportClass,
    target: string,
  ) => Promise<AuditReport>
  readonly readVet: (
    file: string,
    findings: ReportFindings,
  ) => Promise<VetReading>
  readonly readRebuttal: (
    file: string,
    findings: ReportFindings,
    reviews: readonly FindingReview[],
  ) => Promise<readonly FindingRebuttal[]>
  readonly readHead: (root: string) => Promise<string>
  /** Resolve the plan's current file after a fix may have changed its phase. */
  readonly resolvePlan: (roots: PlanRoots, stem: string) => Promise<string>
  /** Whether a file exists, which tells a finished close that left its plan in place. */
  readonly fileExists: (file: string) => Promise<boolean>
  /** Move a closed plan's round data beside its archived plan and commit it; null without data. */
  readonly archiveRoundData: (
    stem: string,
    tag: string,
    record: string,
  ) => Promise<LifecycleCommit | null>
  readonly readRecords: (
    root: string,
    before: string,
    repository: LandedRecord["repository"],
  ) => Promise<readonly LandedRecord[]>
  /** The exact leading phase records supplied to this round's fix sessions. */
  readonly commitPhaseStamps: () => readonly string[]
  readonly runJudge: (input: PhaseInput<"judge">) => Promise<JudgeResult>
  readonly runPhase: {
    readonly [P in Exclude<Phase, "judge" | "implement">]: (
      input: PhaseInput<P>,
    ) => Promise<PhaseResult<P>>
  }
  /**
   * The glance that decides whether the watch runs. It reads the commit record
   * and the watch's own history, never the round, and rejects when the record
   * cannot be read at all.
   */
  readonly glance: (input: GlanceInput) => Promise<GlanceDecision>
  readonly watchEvidence: (input: WatchEvidenceInput) => Promise<WatchEvidence>
  readonly judgeEvidence: (input: JudgeEvidenceInput) => Promise<JudgeEvidence>
  /** Apply open plan-bound deferrals before the implementation series judge runs. */
  readonly chainDeferrals: (input: {
    readonly plan: string
    readonly auditor: Assistant
  }) => Promise<DeferralChainOutcome>
  /** Publish settled findings before the watch and judge read the current entry. */
  readonly writeSettledRound: (
    commits: readonly LandedCommit[],
    account: RoundAccount,
  ) => void
  /** Save an admitted watch document before its cadence record. */
  readonly writeWatchDocument: (file: string, document: string) => Promise<void>
  /** Replace only this episode's cadence entry after its document is durable. */
  readonly writeWatchRecord: (input: {
    readonly cacheRoot: string
    readonly stem: string
    readonly heads: Readonly<Record<"repo-edu" | "plan", string>>
    readonly grade: WatchGrade
  }) => Promise<void>
  /** Displays the ruling and records a reply; null stops without submitting a draft. */
  readonly requestRuling: (document: string) => Promise<string | null>
}

export type DeferralChainOutcome =
  | "none"
  | "finished"
  | "failed"
  | "awaiting-ruling"
  | "phase-change"
  | "red-watch"
