import { join } from "node:path"
import type { CleanCompletion, CleanInput } from "./clean.js"
import type { WatchEvidenceInput } from "./episode.js"
import type { GlanceDecision, GlanceInput, WatchGrade } from "./glance.js"
import type { JudgeEvidence, JudgeEvidenceInput } from "./judge.js"
import type { AuditReport, ReportClass, ReportFindings } from "./report.js"
import type {
  FindingRebuttal,
  FindingReview,
  JudgeAnswer,
  JudgeDecision,
  LandedCommit,
  RoundAccount,
} from "./round-data.js"
import type { PhaseSelection, RoundSettings } from "./settings.js"
import type { RoundContext } from "./target.js"
import type { VetReading } from "./vet.js"

export type Assistant = "claude" | "codex"

/** The letter a commit subject's capability tag opens with, naming the vendor. */
export const assistantLetters: Record<Assistant, "a" | "o"> = {
  claude: "a",
  codex: "o",
}

/**
 * The phases an assistant session can run. All but `close` belong to a round;
 * `close` runs on its own and closes a plan's loop.
 */
export type Phase =
  | "audit"
  | "vet"
  | "rebut"
  | "fix"
  | "brief"
  | "watch"
  | "judge"
  | "close"

/**
 * Each phase's skill name, which names its workflow folder and launchers. The
 * brief's name keeps the round brief apart from the home plan brief.
 */
export const phaseSkills: Record<Phase, string> = {
  audit: "audit",
  vet: "vet",
  rebut: "rebut",
  fix: "fix",
  brief: "brief-round",
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
      : transcribed(input.phase)
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
  if (!transcribed(input.phase)) return null
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
 * What the command line asked of the auditor's phases. `none` asks nothing. An
 * assistant name asks for the assistant's default selection in place of its
 * audit pins. A tag names its option, so the settings header says which one
 * set a field; a null tag field follows the audit pin. The override binds
 * audit and rebuttal because the rebuttal is the auditor's answer.
 */
export type AuditorOverride =
  | "none"
  | { readonly option: AuditorOption; readonly defaults: true }
  | {
      readonly option: AuditorOption
      readonly strength: Strength | null
      readonly effort: Effort | null
    }

/** An auditor the command line said nothing about, which every other phase is. */
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

/** What `--auditor` or `--first` names: who audits, and whatever it pinned of the model. */
export type AuditorSeat = {
  readonly assistant: Assistant
  readonly override: AuditorOverride
}

/** Which member of a configured audit pair this round runs. */
export type AuditSlot = 0 | 1

/** Whether an assistant's audit setting is a pair. */
export function auditPair(
  assistant: Assistant,
  config: RoundSettings,
): readonly [PhaseSelection, PhaseSelection] | null {
  const configured = config.phases.audit[assistant]
  return Array.isArray(configured) ? configured : null
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
 * may name a tier and effort; unnamed fields follow the audit pin. The three
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
 * Command-line fields override the audit settings, which rebuttal shares.
 * Other fields use the configured phase selection, whose `default` reads the
 * assistant's default selection.
 */
function phaseModel(
  phase: Phase,
  assistant: Assistant,
  override: AuditorOverride,
  config: RoundSettings,
  auditSlot: AuditSlot,
): PinnedModel {
  const configuredPhase = phase === "rebut" ? "audit" : phase
  let pin: PhaseSelection
  if (configuredPhase === "audit") {
    const configured = config.phases.audit[assistant]
    pin = Array.isArray(configured) ? configured[auditSlot] : configured
  } else if (configuredPhase === "vet") {
    pin = config.phases.vet[assistant]
  } else {
    pin = config.phases[configuredPhase]
  }
  const defaults = defaultModel(assistant, config)
  const own = <Value extends string>(value: Value): PinnedField<Value> => ({
    value,
    source: "audit-round settings",
  })
  const model = pin.model === "default" ? defaults.model : own(pin.model)
  const effort = pin.effort === "default" ? defaults.effort : own(pin.effort)
  if (configuredPhase !== "audit" || override === "none")
    return { model, effort }
  if ("defaults" in override)
    return defaultModel(assistant, config, override.option)
  return {
    model:
      override.strength !== null
        ? {
            value: config.strengthModels[assistant][override.strength],
            source: override.option,
          }
        : model,
    effort:
      override.effort !== null
        ? { value: override.effort, source: override.option }
        : effort,
  }
}

/**
 * The single owner of who runs each phase and on what, a round's phases and
 * the close that runs alone. The runner invokes from this value and the run's
 * settings header prints it, so what a run says it ran on is what it ran with.
 */
export function roundPhases(
  auditor: Assistant,
  override: AuditorOverride,
  config: RoundSettings,
  auditSlot: AuditSlot = 0,
): Record<Phase, PhaseRun> {
  const run = (phase: Phase, assistant: Assistant): PhaseRun => ({
    assistant,
    model: phaseModel(phase, assistant, override, config, auditSlot),
  })
  return {
    audit: run("audit", auditor),
    // The vetter is the other assistant, so no assistant vets its own report.
    vet: run("vet", auditor === "codex" ? "claude" : "codex"),
    // The rebuttal is the auditor's answer, using the same model and effort.
    rebut: run("rebut", auditor),
    // Settings choose the fixer whoever audited; unlike the vetter, it may be the auditor.
    fix: run("fix", config.phases.fix.assistant),
    brief: run("brief", config.phases.brief.assistant),
    // The watch reads joined trajectory evidence, so the auditor does not select it.
    watch: run("watch", config.phases.watch.assistant),
    // The judge reads retained evidence and uses its own cheap setting.
    judge: run("judge", config.phases.judge.assistant),
    close: closePhase(config),
  }
}

/** Loop-close is no part of a round; it runs alone on its own settings, whoever audits. */
export function closePhase(config: RoundSettings): PhaseRun {
  const assistant = config.phases.close.assistant
  return {
    assistant,
    model: phaseModel("close", assistant, noOverride, config, 0),
  }
}

/**
 * Every model a round's phases may name for one assistant, whoever audits:
 * the default selection, each phase's own pin and each tier a tag can ask for.
 */
export function namedModels(
  assistant: Assistant,
  config: RoundSettings,
): ReadonlySet<string> {
  const names = new Set<string>([config.defaults[assistant].model])
  for (const auditor of ["claude", "codex"] as const)
    for (const auditSlot of [0, 1] as const)
      for (const strength of [null, ...strengths])
        for (const run of Object.values(
          roundPhases(
            auditor,
            { option: "--auditor", strength, effort: null },
            config,
            auditSlot,
          ),
        ))
          if (run.assistant === assistant) names.add(run.model.model.value)
  return names
}

/**
 * Whether a phase's texts belong in the round transcript. Only the four phases
 * that carry out the round write into it. The brief, the ruling and the watch
 * are separate documents. The fix writes the ruling; the brief and watch
 * run afterwards without adding their text to the transcript.
 */
export function transcribed(phase: Phase): boolean {
  return (
    phase === "audit" || phase === "vet" || phase === "rebut" || phase === "fix"
  )
}

type PhaseArguments = {
  audit: {
    readonly arguments: readonly [
      report: string,
      target: string,
      ...scopeOrCommits: string[],
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
    readonly arguments: readonly [report: string, ...twins: string[]]
    readonly rulingFile: string
  } & (
    | { readonly sessionId: null; readonly rulingReply?: never }
    | {
        readonly sessionId: string
        readonly rulingReply: string
      }
  )
  brief: {
    readonly arguments: readonly [transcript: string, brief: string]
    readonly sessionId: null
  }
  watch: {
    readonly evidence: string
    readonly arguments: readonly [watch: string, cacheRoot: string]
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
      | readonly [plan: string, tag: string, record: string]
      | readonly [plan: string, tag: string, record: string, reason: string]
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

type FixResult = {
  readonly status: "finished" | "needs-ruling"
  readonly sessionId: string
}

type PhaseResults = {
  audit: ReportResult
  vet: ReportResult
  rebut: ReportResult
  fix: FixResult
  brief: ReportResult
  watch: ReportResult
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
  /** Prints the saved brief after its phase and output validation have completed. */
  readonly showBrief: (document: string) => Promise<void>
  readonly completeClean: (input: CleanInput) => Promise<CleanCompletion>
  readonly readReport: (
    file: string,
    reportClass: ReportClass,
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
  readonly resolvePlan: (planRoot: string, stem: string) => Promise<string>
  /** Whether a file exists, which tells a finished close that left its plan in place. */
  readonly fileExists: (file: string) => Promise<boolean>
  readonly readRecords: (
    root: string,
    before: string,
    repository: LandedRecord["repository"],
  ) => Promise<readonly LandedRecord[]>
  readonly runJudge: (input: PhaseInput<"judge">) => Promise<JudgeResult>
  readonly runPhase: {
    readonly [P in Exclude<Phase, "judge">]: (
      input: PhaseInput<P>,
    ) => Promise<PhaseResult<P>>
  }
  /**
   * The glance that decides whether the watch runs. It reads the commit record
   * and the watch's own history, never the round, and rejects when the record
   * cannot be read at all.
   */
  readonly glance: (input: GlanceInput) => Promise<GlanceDecision>
  readonly watchEvidence: (input: WatchEvidenceInput) => Promise<string>
  readonly judgeEvidence: (input: JudgeEvidenceInput) => Promise<JudgeEvidence>
  /** Publish settled findings before the watch and judge read the current entry. */
  readonly writeSettledRound: (
    commits: readonly LandedCommit[],
    account: RoundAccount,
  ) => void
  /** The grade a finished watch recorded; rejects when it left no readable record. */
  readonly watchGrade: (cacheRoot: string, stem: string) => Promise<WatchGrade>
  /** Displays the ruling and records a reply; null stops without submitting a draft. */
  readonly requestRuling: (document: string) => Promise<string | null>
}
