import { basename, join } from "node:path"
import { format } from "date-fns"
import type { PlanRoots } from "./context.js"
import type {
  Feedback,
  ModelReleases,
  PhaseOutput,
  PhaseRecorder,
} from "./feedback.js"
import {
  type ModelReference,
  modelChangeNotice,
  readPreviousRoundModels,
} from "./model-change.js"
import {
  type Context,
  capabilityTag,
  commitStamps,
  contextChange,
  contextText,
  elapsedText,
  modelText,
  phaseSelection,
  phaseText,
  phaseTokenText,
  pinnedSelection,
  type RanPhase,
  type RunEntry,
  slotKey,
  toolText,
} from "./output-format.js"
import {
  type Assistant,
  type AssistantTurnInput,
  closePhase,
  type Effort,
  efforts,
  noOverride,
  type PhaseControlResult,
  type PhaseRun,
  type RoundPhase,
  type RoundPhases,
  roundPhases,
  targetWorkClass,
  transcribed,
} from "./phase.js"
import { withoutPhaseResult } from "./phase-result.js"
import { recoveryCommand, roundRecoveryCommand } from "./requests.js"
import {
  type CloseResult,
  failureResumeSessionId,
  openSeriousFindings,
  type RoundResult,
  type RoundSetup,
} from "./round.js"
import {
  type ModelTokenUsage,
  type RetainedRoundData,
  type RoundAccount,
  type RoundData,
  roundDataFilename,
  roundDataIdentity,
  type SeriesAnswer,
  writeRoundData,
} from "./round-data.js"
import {
  documentTag,
  type FileKind,
  phaseFilename,
  roundIdentity,
  roundSubject,
} from "./round-paths.js"
import { type WaitingRuling, waitingRulingText } from "./ruling-wait.js"
import type { RunClock, RunMark } from "./run-clock.js"
import { openRunFiles, type RunFiles, type RunPaths } from "./run-files.js"
import type { Auditor, RoundSettings } from "./settings.js"
import { isActivePlanPath, planPhase, planStem } from "./target.js"
import type { Terminal } from "./terminal.js"

export type RoundDocuments = {
  readonly report: string
  /** One vet report per vet of the panel, in panel order. */
  readonly vets: readonly string[]
  readonly rebut: string
  readonly ruling: string
}

/** The rule that sets a phase start or a glance off from what came before. */
const separator = "─".repeat(72)
/**
 * The rule that boxes a whole run in. A chain prints rounds back to back, so
 * the run boundary needs a heavier mark than the phase boundaries inside it.
 */
const runRule = "═".repeat(72)

export type OutputOptions = {
  readonly terminal: Terminal
  readonly verbose?: boolean
  /**
   * The invocation's one clock. Every output of a chained run shares it, so
   * the run reading spans them and each user wait leaves every reading alike.
   */
  readonly clock: RunClock
  readonly openFiles?: typeof openRunFiles
}

/** What one command run is called, which phases it runs and where it records. */
export type Run = {
  readonly settings: RoundSettings
  /** The run's kind, as the terminal names it when it ends. */
  readonly name: string
  readonly title: string
  /** The plan stem or commit label the run serves; a ruling wait answers to it. */
  readonly target: string
  readonly phases: readonly RunEntry[]
  readonly releases: Record<Assistant, ModelReleases>
  readonly paths: RunPaths
  /** Earlier applied selections used only to surface a model or effort change. */
  readonly previousModels: readonly ModelReference[]
  /** Earlier phase measurements restored when a stopped fix re-enters the runner. */
  readonly continued?: RoundData["phases"]
  /** The audit report a serious-contest recovery command names. */
  readonly recoveryReport?: string
  /** Present for every active plan-target round, with settled and final writes. */
  readonly data?: {
    readonly path: string
    readonly target: string
    readonly round: number
    readonly tag: string
    readonly settings: RoundData["settings"]
    readonly auditor: RoundData["auditor"]
    readonly pool?: readonly Auditor[]
  } & (
    | { readonly phase: "widening" | "detailing" }
    | { readonly scope: string }
    | {
        readonly originalGroups: RoundDataCommitGroups
        readonly groups: RoundDataCommitGroups
      }
  )
  /** The reading that dates the run files. */
  readonly started: number
}

type RoundDataCommitGroups = readonly {
  readonly repository: "repo-edu" | "plan"
  readonly commits: readonly [string, ...string[]]
  readonly startingHead: string
}[]

function resolvedRun(
  run: PhaseRun,
  releases: Record<Assistant, ModelReleases>,
) {
  return phaseSelection(run.model, releases[run.assistant])
}

/** Settings recorded for the model read-out, resolved by the execution owner. */
function roundSettingsData(
  releases: Record<Assistant, ModelReleases>,
  phases: Pick<RoundPhases, "vet" | "fix">,
): RoundData["settings"] {
  return {
    vetters: phases.vet.map((vet) => ({
      assistant: vet.assistant,
      ...resolvedRun(vet, releases),
    })),
    fix: {
      assistant: phases.fix.assistant,
      ...resolvedRun(phases.fix, releases),
    },
  }
}

/** The tag every file of a phase carries, known before any file reserves the round. */
function fileTag(
  entry: RunEntry,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): string {
  return capabilityTag(entry, releases[entry.assistant], settings)
}

export async function roundRun(
  setup: RoundSetup,
  started: number,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): Promise<
  Run & {
    readonly nameStart: string
    readonly watch: string
    readonly documents: RoundDocuments
    readonly paths: { readonly claim: string; readonly markdown: string }
  }
> {
  const phases = roundPhases(
    setup.auditor,
    setup.override ?? noOverride,
    settings,
    setup,
    targetWorkClass(setup),
  )
  const entry = (phase: SinglePhase): RunEntry => ({ phase, ...phases[phase] })
  const tag = (phase: SinglePhase): string =>
    fileTag(entry(phase), releases, settings)
  // The close runs alone, so a round needs no close tag.
  for (const phase of singlePhases) {
    if (phase !== "close") tag(phase)
  }
  // Each vet's report and record are named by its own tag.
  const vets = phases.vet.map((run) => {
    const vet = { phase: "vet", ...run } as const
    return { ...vet, tag: fileTag(vet, releases, settings) }
  })
  const { nameStart, title } = await roundIdentity(setup)
  const previousModels = await readPreviousRoundModels(setup)
  const named = (kind: FileKind, tag: string) =>
    join(setup.activeRoot, phaseFilename(nameStart, kind, tag))
  const path = (kind: FileKind, phase: SinglePhase) => named(kind, tag(phase))
  const base = path("round", "audit")
  const audit = entry("audit")
  const identity = roundDataIdentity(nameStart)
  const activePlan =
    "plan" in setup && isActivePlanPath(setup.activeRoot, setup.plan)
  const data =
    "groups" in setup
      ? {
          path: join(
            setup.activeRoot,
            roundDataFilename(identity.target, "commit"),
          ),
          ...identity,
          tag: tag("audit"),
          settings: roundSettingsData(releases, phases),
          auditor: {
            assistant: audit.assistant,
            ...resolvedRun(audit, releases),
            chosenBy: setup.auditorSelectionSource,
            seat: resolvedRun(audit, releases),
          },
          ...(setup.pool === undefined ? {} : { pool: setup.pool }),
          originalGroups: setup.originalGroups.map(
            ({ repository, commits, startingHead }) => ({
              repository,
              commits,
              startingHead,
            }),
          ),
          groups: setup.groups.map(({ repository, commits, startingHead }) => ({
            repository,
            commits,
            startingHead,
          })),
        }
      : activePlan
        ? {
            path: join(
              setup.activeRoot,
              roundDataFilename(planStem(setup.plan), setup.roundKind),
            ),
            ...identity,
            tag: tag("audit"),
            settings: roundSettingsData(releases, phases),
            auditor: {
              assistant: audit.assistant,
              ...resolvedRun(audit, releases),
              chosenBy: setup.auditorSelectionSource,
              seat: resolvedRun(audit, releases),
            },
            ...(setup.pool === undefined ? {} : { pool: setup.pool }),
            ...(setup.roundKind === "planning"
              ? { phase: planPhase(setup.plan) }
              : { scope: setup.scope }),
          }
        : undefined
  return {
    nameStart,
    watch: `${path("watch", "watch")}.md`,
    documents: {
      report: `${path("audit", "audit")}.md`,
      vets: vets.map((vet) => `${named("vet", vet.tag)}.md`),
      rebut: `${path("rebut", "rebut")}.md`,
      ruling: `${path("ruling", "fix")}.md`,
    },
    name: "Audit round",
    target: "plan" in setup ? planStem(setup.plan) : identity.target,
    // The claimed number, so the title names the round the data records.
    title: `${title} (round ${identity.round})`,
    phases: [
      entry("audit"),
      ...vets,
      entry("rebut"),
      entry("fix"),
      ...("plan" in setup ? [entry("watch")] : []),
    ],
    paths: {
      claim: join(setup.activeRoot, `${nameStart}-0-claim.md`),
      log: `${base}.log`,
      markdown: `${base}.md`,
      reopenLog: false,
    },
    previousModels,
    recoveryReport: `${path("audit", "audit")}.md`,
    ...(data === undefined ? {} : { data }),
    releases,
    settings,
    started,
  }
}

/** Every phase of a round except the vet, whose panel holds one run per vet. */
type SinglePhase = Exclude<RoundPhase, "vet">
const singlePhases: readonly SinglePhase[] = [
  "audit",
  "rebut",
  "fix",
  "watch",
  "close",
]

/** What one retained phase entry ran on, as the run's settings header names it. */
function retainedPhaseRun(retained: RoundData["phases"][number]): PhaseRun {
  const launched = retained.launched ?? {
    model: retained.model,
    effort: retained.effort,
  }
  if (launched.effort === null || !efforts.includes(launched.effort as Effort))
    throw new Error(`Retained ${retained.phase} phase has no supported effort`)
  const source = "retained round"
  return {
    assistant: retained.assistant,
    model: {
      model: { value: launched.model, source },
      effort: { value: launched.effort as Effort, source },
    },
  }
}

/**
 * Reopen one retained round and restore the phase records its fix must
 * finish: every vet's record by the tag its report carries.
 */
export async function resumedRoundRun(
  setup: RoundSetup,
  retained: RetainedRoundData,
  paths: {
    readonly nameStart: string
    readonly report: string
    readonly vets: readonly string[]
    readonly rebut: string
    readonly ruling: string | null
  },
  started: number,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): Promise<
  Run & {
    readonly nameStart: string
    readonly watch: string
    readonly documents: RoundDocuments
    readonly recoveredPhases: Pick<
      RoundPhases,
      "audit" | "vet" | "rebut" | "fix"
    >
    readonly paths: { readonly claim: null; readonly markdown: string }
  }
> {
  const fresh = roundPhases(
    setup.auditor,
    setup.override ?? noOverride,
    settings,
    setup,
    targetWorkClass(setup),
  )
  const single = (phase: "audit" | "rebut" | "fix"): PhaseRun => {
    const entry = retained.entry.phases.find(
      (candidate) => candidate.phase === phase,
    )
    return entry === undefined ? fresh[phase] : retainedPhaseRun(entry)
  }
  const vets: readonly RunEntry[] = paths.vets.map((file) => {
    const tag = documentTag(file)
    const entry = retained.entry.phases.find(
      (candidate) => candidate.phase === "vet" && candidate.tag === tag,
    )
    if (entry === undefined)
      throw new Error(
        `The retained round ${paths.nameStart} has no vet phase entry for ${tag}`,
      )
    return { phase: "vet", ...retainedPhaseRun(entry), tag }
  })
  const phaseRuns = {
    ...fresh,
    audit: single("audit"),
    vet: vets.map(({ assistant, model }) => ({ assistant, model })),
    rebut: single("rebut"),
    fix: single("fix"),
  }
  const runEntry = (phase: SinglePhase): RunEntry => ({
    phase,
    ...phaseRuns[phase],
  })
  const tag = (phase: SinglePhase): string =>
    fileTag(runEntry(phase), releases, settings)
  const base = join(
    setup.activeRoot,
    `${phaseFilename(paths.nameStart, "round", retained.entry.tag)}`,
  )
  const ruling =
    paths.ruling ??
    join(
      setup.activeRoot,
      `${phaseFilename(paths.nameStart, "ruling", tag("fix"))}.md`,
    )
  const documents = {
    report: paths.report,
    vets: paths.vets,
    rebut: paths.rebut,
    ruling,
  }
  const data = {
    path: retained.file,
    target: retained.entry.target,
    round: retained.entry.round,
    tag: retained.entry.tag,
    settings: retained.entry.settings,
    auditor: retained.entry.auditor,
    ...(retained.entry.pool === undefined ? {} : { pool: retained.entry.pool }),
    ...(retained.entry && "phase" in retained.entry
      ? { phase: retained.entry.phase }
      : "scope" in retained.entry
        ? { scope: retained.entry.scope }
        : {
            originalGroups: retained.entry.originalGroups,
            groups: retained.entry.groups,
          }),
  } as Run["data"]
  return {
    nameStart: paths.nameStart,
    watch: join(
      setup.activeRoot,
      `${phaseFilename(paths.nameStart, "watch", tag("watch"))}.md`,
    ),
    documents,
    recoveredPhases: phaseRuns,
    name: "Audit round recovery",
    target:
      "plan" in setup
        ? planStem(setup.plan)
        : roundDataIdentity(paths.nameStart).target,
    title:
      "plan" in setup
        ? `Recovery of ${roundSubject(setup, setup.plan)}`
        : `Recovery of commit audit ${paths.nameStart}`,
    phases: [
      runEntry("audit"),
      ...vets,
      runEntry("rebut"),
      runEntry("fix"),
      ...("plan" in setup ? [runEntry("watch")] : []),
    ],
    paths: {
      claim: null,
      log: `${base}.log`,
      markdown: `${base}.md`,
      reopenLog: true,
    },
    previousModels: await readPreviousRoundModels(setup),
    continued: retained.entry.phases,
    recoveryReport: paths.report,
    data,
    releases,
    settings,
    started,
  }
}

/**
 * The capability tag and model record the close's commits carry, resolved
 * from the close selection alone so a close that starts no session can still
 * stamp the commit it writes.
 */
export function closeStamps(
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): { readonly tag: string; readonly record: string } {
  const phase = { phase: "close", ...closePhase(settings) } as const
  const { model, effort } = phaseSelection(
    phase.model,
    releases[phase.assistant],
  )
  return {
    tag: fileTag(phase, releases, settings),
    record: `${model} ${effort}`,
  }
}

/**
 * A close logs in the active folder under the plan's stem and keeps no transcript.
 * Its session cannot tell its own capability, so the run hands it the tag and
 * model record its commits carry.
 */
export async function closeRun(
  plan: string,
  roots: PlanRoots,
  started: number,
  releases: Record<Assistant, ModelReleases>,
  settings: RoundSettings,
): Promise<Run & { readonly tag: string; readonly record: string }> {
  const phase = { phase: "close", ...closePhase(settings) } as const
  const { tag, record } = closeStamps(releases, settings)
  return {
    tag,
    record,
    name: "Close",
    title: `Close of plan ${basename(plan)}`,
    target: planStem(plan),
    phases: [phase],
    settings,
    releases,
    paths: {
      claim: null,
      log: join(roots.activeRoot, `${planStem(plan)}-close.${tag}.log`),
      markdown: null,
      reopenLog: false,
    },
    previousModels: await readPreviousRoundModels(roots),
    started,
  }
}

/**
 * One running invocation. The vets of a panel run at the same time, so each
 * has its own slot under its tag and their stamps never share a baseline.
 */
type ActiveSlot = {
  readonly input: AssistantTurnInput
  /** The slot's key, which opens every line the output writes for it. */
  readonly key: string
  readonly started: RunMark
  context: Context | null
  /** Where the next tool line's step time counts from: the previous tool line, else the phase start. */
  previousToolMark: RunMark
  previousToolTokens: number | null
  statusTokens: number | null
  /**
   * A vet's texts, held until the vet ends and then written whole, because
   * vets that run at the same time would otherwise mix paragraph by
   * paragraph. Null for a phase that runs alone, whose text streams.
   */
  readonly held: string[] | null
  /**
   * The closing stamp of an invocation released without finishing, fixed
   * when it ended. Releasing writes nothing, so a failed record write cannot
   * hide the phase's outcome; the round's finish writes it with the slot's
   * held texts. Null while the invocation runs.
   */
  ended: string | null
}

export class RoundOutput<R extends Run = Run> {
  readonly paths: R["paths"]
  readonly phase: PhaseOutput
  private readonly files: RunFiles
  private readonly clock: RunClock
  /** Where this round's reading counts from: the output's construction. */
  private readonly round: RunMark
  /** Running invocations by slot key. */
  private readonly active = new Map<string, ActiveSlot>()
  private timer: ReturnType<typeof setInterval> | undefined
  /**
   * Started phases in order by slot key, with each CLI's applied selection and
   * the assistant time the phase took. Before a phase reports, its launch
   * selection lets that child identify itself. Feedback replaces that
   * selection without changing another phase's record. A resumed phase adds
   * each finished invocation's time and replaces tokens with the latest
   * session total.
   */
  private readonly ran = new Map<string, RanPhase>()

  constructor(
    private readonly run: R,
    private readonly options: OutputOptions,
  ) {
    this.clock = options.clock
    this.round = options.clock.mark()
    for (const phase of run.continued ?? []) {
      if (phase.phase === "judge") continue
      const tag = phase.phase === "vet" ? phase.tag : undefined
      this.ran.set(slotKey(phase.phase, tag), {
        phase: phase.phase,
        ...(tag === undefined ? {} : { tag }),
        launched: phase.launched ?? {
          model: phase.model,
          effort: phase.effort,
        },
        selection: { model: phase.model, effort: phase.effort },
        spent: phase.milliseconds,
        tokens: phase.tokens,
        peakContext: phase.peakContext,
        compactions: phase.compactions,
      })
    }
    this.paths = run.paths
    this.files = (options.openFiles ?? openRunFiles)(this.paths)
    this.phase = {
      start: async (input, prompt) => this.start(input, prompt),
    }
    try {
      const started = `Started ${format(new Date(run.started), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")}`
      const texts =
        this.paths.markdown === null ? "" : `\nTexts: ${this.paths.markdown}`
      this.transcribe(`# ${run.title}\n\n${started}\n`)
      // The heavy rule sits directly above the title so the run opening is
      // the first thing a reader sees after the previous run's closing rule.
      this.say(
        `\n${runRule}\n${run.title}\n${started}\nLog: ${this.paths.log}${texts}`,
      )
      this.models(run.releases)
    } catch (error) {
      this.files.close()
      throw error
    }
  }

  message = async (text: string): Promise<void> => {
    this.say(text)
  }

  /** Runner bookkeeping belongs in both records, without inventing an AI phase. */
  cleanCompletion(text: string): void {
    this.say(`[complete] ${text}`)
    this.transcribe(`## Clean completion\n\n${text}\n`)
  }
  /** A message that opens a new section of the run, set off the way a phase start is. */
  section = async (text: string): Promise<void> => {
    this.say(`\n${separator}\n${text}`)
  }
  warning = async (text: string): Promise<void> => {
    this.say(`Warning: ${text}`)
  }

  models(releases: Record<Assistant, ModelReleases>): void {
    const { phases } = this.run
    const lead = phases[0]?.assistant
    // Phases are grouped by assistant so one assistant's model reads as one block.
    const rows = phases
      .toSorted(
        (first, second) =>
          Number(first.assistant !== lead) - Number(second.assistant !== lead),
      )
      // Each field reports what named it: an option, the phase's pin or the defaults.
      .map(({ phase, tag, assistant, model }) => ({
        phase: slotKey(phase, tag),
        assistant,
        ...phaseText(model, releases[assistant]),
      }))
    const width = (column: (row: (typeof rows)[number]) => string) =>
      Math.max(...rows.map((row) => column(row).length))
    const phaseWidth = width(({ phase }) => phase)
    const assistantWidth = width(({ assistant }) => assistant)
    const modelWidth = width(({ model }) => model)
    const effortWidth = width(({ effort }) => effort)
    const text = rows
      .map(
        ({ phase, assistant, model, effort, source }) =>
          `${phase.padEnd(phaseWidth)}  ${assistant.padEnd(assistantWidth)}  ${model.padEnd(modelWidth)} ${effort.padEnd(effortWidth)}  ${source}`,
      )
      .join("\n")
    this.say(text)
    // Fenced, so the column alignment survives markdown rendering.
    this.transcribe(`\`\`\`text\n${text}\n\`\`\`\n`)
  }

  /**
   * What the commit-msg hook stamps into a commit this run's work lands, read
   * when a child starts so it names only the phases that ran by then and times
   * only those that finished. A clean round that skipped the vet and the
   * rebuttal stamps neither.
   */
  commitStamps = (): ReturnType<typeof commitStamps> =>
    commitStamps(this.run.phases, this.ran, this.run.settings)

  private say(text: string): void {
    this.files.log(text)
    this.options.terminal.write(text)
  }

  private transcribe(text: string): void {
    this.files.markdown?.(text)
  }

  private stamp(slot: ActiveSlot): string {
    const { key, started, context, statusTokens } = slot
    const measurement = contextText(context, changeSince(context, statusTokens))
    return `\n[${key}] ${elapsedText(this.clock.elapsed(started))}  round ${elapsedText(this.clock.elapsed(this.round))}  run ${elapsedText(this.clock.elapsed(this.clock.invocation))}${measurement ? `  ${measurement}` : ""}`
  }

  /** The invocations still running, which the live status line follows. */
  private running(): ActiveSlot[] {
    return [...this.active.values()].filter((slot) => slot.ended === null)
  }

  /** The live status line: one stamp per running invocation. */
  private status(): void {
    this.options.terminal.status(
      this.running()
        .map((slot) => this.stamp(slot))
        .join(""),
    )
  }

  /** Written stamps chain: each reports the context added since the previous one. */
  private report(slot: ActiveSlot): string {
    const stamp = this.stamp(slot)
    if (slot.context !== null) slot.statusTokens = slot.context.tokens
    return stamp
  }

  private start(input: AssistantTurnInput, prompt: string): PhaseRecorder {
    this.clock.active()
    const started = this.clock.mark()
    // A vet is named by the tag its report carries, so each vet of a panel
    // keeps its own slot and record.
    const tag =
      input.phase === "vet" ? documentTag(input.arguments[1]) : undefined
    const key = slotKey(input.phase, tag)
    const slot: ActiveSlot = {
      input,
      key,
      started,
      context: null,
      previousToolMark: started,
      previousToolTokens: null,
      // A fresh session starts empty, so its first stamp reports the startup context.
      statusTokens: input.sessionId === null ? 0 : null,
      held: input.phase === "vet" ? [] : null,
      ended: null,
    }
    this.active.set(key, slot)
    const earlier = this.ran.get(key)
    this.ran.set(key, {
      phase: input.phase,
      ...(tag === undefined ? {} : { tag }),
      launched: pinnedSelection(input.model),
      selection: phaseSelection(
        input.model,
        this.run.releases[input.assistant],
      ),
      spent: earlier?.spent ?? null,
      tokens: earlier?.tokens ?? [],
      peakContext: earlier?.peakContext ?? null,
      compactions: earlier?.compactions ?? 0,
    })
    this.say(
      `\n${separator}\n[${key}] starting ${input.assistant} (${this.mode(slot)})`,
    )
    this.files.log(`[${key}] prompt:\n${prompt}\n`)
    if (slot.held === null) this.heading(slot)
    this.status()
    if (this.timer === undefined) {
      this.timer = setInterval(() => this.status(), 1000)
      this.timer.unref()
    }
    return {
      observe: async (feedback) => this.observe(slot, feedback),
      finish: async (result) => this.finishPhase(slot, result),
      release: () => this.releasePhase(slot),
    }
  }

  private mode(slot: ActiveSlot): string {
    return slot.input.sessionId === null ? "fresh" : "resumed"
  }

  /** The transcript heading that opens a phase's texts. */
  private heading(slot: ActiveSlot): void {
    if (transcribed(slot.input.phase))
      this.transcribe(
        `## ${slot.key} (${slot.input.assistant}, ${this.mode(slot)})\n`,
      )
  }

  /** Write one phase text to the transcript and, without its control line, the terminal. */
  private text(slot: ActiveSlot, text: string): void {
    if (transcribed(slot.input.phase)) this.transcribe(`${text}\n`)
    const visible = withoutPhaseResult(text)
    if (visible.length > 0) this.options.terminal.write(visible, "markdown")
  }

  /** Write a vet's held texts whole, under its heading, once the vet ends. */
  private flush(slot: ActiveSlot): void {
    if (slot.held === null) return
    this.heading(slot)
    if (slot.held.length === 0) return
    this.say(this.report(slot))
    for (const text of slot.held.splice(0)) this.text(slot, text)
  }

  private observe(slot: ActiveSlot, feedback: Feedback): void {
    const terminal = this.options.terminal
    const active = slot
    if (this.active.get(slot.key) !== slot || slot.ended !== null)
      throw new Error(
        `Phase feedback arrived after the ${slot.key} phase ended`,
      )
    this.clock.active()
    const prefix = `[${slot.key}]`
    switch (feedback.type) {
      case "session":
        this.say(
          `${prefix} ${active.input.assistant} session ${feedback.sessionId}`,
        )
        break
      case "model": {
        const run = this.phaseRun(slot.key)
        this.ran.set(slot.key, {
          ...run,
          selection: feedback.selection,
        })
        this.say(
          `${prefix} ${active.input.assistant} ${modelText(feedback.selection)}`,
        )
        const notice = modelChangeNotice(
          this.run.previousModels,
          active.input.phase,
          active.input.assistant,
          run.launched,
          feedback.selection,
        )
        if (notice !== null) this.say(`Warning: ${notice}`)
        break
      }
      case "context": {
        const run = this.phaseRun(slot.key)
        active.context = feedback
        this.ran.set(slot.key, {
          ...run,
          peakContext: fullerContext(run.peakContext, feedback),
        })
        break
      }
      case "compaction": {
        const run = this.phaseRun(slot.key)
        this.ran.set(slot.key, {
          ...run,
          compactions: run.compactions + 1,
        })
        if (
          run.compactions === 0 &&
          ["audit", "vet", "rebut", "fix"].includes(active.input.phase)
        )
          this.say(
            `Warning: The ${slot.key} phase compacted. Use a narrower scope instead of a larger context window.`,
          )
        break
      }
      case "tokens": {
        const run = this.phaseRun(slot.key)
        const totals: readonly ModelTokenUsage[] =
          feedback.update.kind === "selected-model"
            ? [{ model: run.selection.model, ...feedback.update.tokens }]
            : feedback.update.models
        this.ran.set(slot.key, { ...run, tokens: totals })
        break
      }
      case "text":
        if (feedback.text.length === 0) break
        if (slot.held !== null) {
          slot.held.push(feedback.text)
          break
        }
        this.say(this.report(slot))
        this.text(slot, feedback.text)
        break
      case "diagnostic":
        this.say(`${prefix} ${feedback.text}`)
        break
      case "tool": {
        if (feedback.invocation !== null) {
          const line = `${slot.held === null ? "" : `${prefix} `}${toolText(
            feedback.invocation,
            elapsedText(this.clock.elapsed(active.previousToolMark)),
            elapsedText(this.clock.elapsed(this.round)),
            elapsedText(this.clock.elapsed(this.clock.invocation)),
            active.context,
            changeSince(active.context, active.previousToolTokens),
          )}`
          this.files.log(line)
          if (this.options.verbose) terminal?.write(line.slice(0, 160))
          active.previousToolMark = this.clock.mark()
          active.previousToolTokens = active.context?.tokens ?? null
        }
        break
      }
    }
    this.status()
  }

  private finishPhase(
    slot: ActiveSlot,
    result: PhaseControlResult,
  ): {
    readonly compactions: number
  } {
    const run = this.ran.get(slot.key)
    if (
      this.active.get(slot.key) !== slot ||
      slot.ended !== null ||
      run === undefined
    )
      throw new Error("A phase finished without starting")
    this.flush(slot)
    this.say(this.end(slot))
    this.active.delete(slot.key)
    // The run's finish line owns the failure reason, session and resume command.
    this.say(`[${slot.key}] ${result.status}`)
    this.follow()
    return { compactions: run.compactions }
  }

  /**
   * Stop timing one invocation: add its time to its phase record and return
   * its closing stamp with its tokens. Only memory changes, so an invocation
   * released without finishing keeps the time and tokens it spent.
   */
  private end(slot: ActiveSlot): string {
    const run = this.phaseRun(slot.key)
    this.ran.set(slot.key, {
      ...run,
      spent: (run.spent ?? 0) + this.clock.elapsed(slot.started),
    })
    return `${this.report(slot)}${tokenSuffix(run.tokens)}`
  }

  /** Stop following one invocation; one that never finished waits for the round's finish. */
  private releasePhase(slot: ActiveSlot): void {
    if (this.active.get(slot.key) === slot && slot.ended === null)
      slot.ended = this.end(slot)
    this.follow()
  }

  /** The live status keeps any invocation still running. */
  private follow(): void {
    if (this.running().length === 0) this.release()
    else this.status()
  }

  get title(): string {
    return this.run.title
  }

  get target(): string {
    return this.run.target
  }

  /** Print the notice in place of the ruling's text; the chat explains the ruling. */
  beginRuling(ruling: WaitingRuling): void {
    this.release()
    this.say(
      `\n${separator}\n${waitingRulingText(ruling)}\nAnswer it in the Claude desktop app with: /ruling ${ruling.target}\nThe run waits for that answer; Ctrl-C stops without one.`,
    )
    this.clock.active()
  }

  /** Say that the desktop app did not open; the notice already holds what the user needs. */
  desktopFailed(reason: string): void {
    this.say(`The Claude desktop app did not open: ${reason}`)
  }

  endRuling(reply: string | null): void {
    this.clock.awaited()
    if (reply === null) return
    this.files.log(`[ruling] User reply:\n${reply}`)
    this.transcribe(`## User ruling\n\n${reply}\n`)
  }

  /** Publish the settled account before the watch and series rules read this round. */
  writeSettledRound(
    commits: readonly RoundData["commits"][number][],
    account: RoundAccount,
  ): void {
    this.writeRoundData("in-progress", commits, account, null)
  }

  finish(result: RoundResult | CloseResult, signal?: AbortSignal): void {
    // An invocation that never finished keeps the time it spent; its texts
    // and closing stamp precede the run's final line.
    const unfinished = [...this.active.values()].map((slot) => ({
      slot,
      stamp: slot.ended ?? this.end(slot),
    }))
    this.active.clear()
    if (this.run.data !== undefined) {
      if (!("commits" in result))
        throw new Error("A round ended without its landed commit account")
      this.writeRoundData(
        result.status === "finished"
          ? "finished"
          : result.status === "awaiting-ruling"
            ? "awaiting-ruling"
            : signal?.aborted === true &&
                signal.reason instanceof Error &&
                signal.reason.message === "Interrupted"
              ? "interrupted"
              : "failed",
        result.commits,
        result.account,
        result.status === "finished" ? result.decision : null,
      )
    }
    this.release()
    for (const { slot, stamp } of unfinished) {
      this.flush(slot)
      this.say(stamp)
    }
    if (result.status === "failed") {
      const resumeSessionId = failureResumeSessionId(result)
      const resume =
        resumeSessionId === null
          ? ""
          : `\nResume: ${this.resumeCommand(result, resumeSessionId)}`
      this.say(
        `\n[${result.phase}] failed: ${result.reason}\nSession: ${result.sessionId ?? "unavailable"}${resume}`,
      )
    } else {
      this.say(
        result.status === "finished"
          ? `${this.run.name} finished.`
          : `Stopped without a ruling. The round files are retained.\nResume: ${this.resumeCommand(result, result.session.sessionId)}`,
      )
    }
    // The closing rule pairs with the opening one, so the chain's messages
    // between rounds sit outside both boxes.
    this.say(runRule)
  }

  /** Use the runner while an unresolved serious contest or split still owns commit admission. */
  resumeCommand(
    result:
      | Extract<RoundResult, { readonly status: "awaiting-ruling" | "failed" }>
      | Extract<CloseResult, { readonly status: "failed" }>,
    sessionId: string,
  ): string {
    const session =
      result.status === "awaiting-ruling"
        ? { ...result.session, sessionId }
        : { ...result, sessionId }
    return "account" in result &&
      openSeriousFindings(result.account).length > 0 &&
      this.run.recoveryReport !== undefined
      ? roundRecoveryCommand(session, this.run.recoveryReport)
      : recoveryCommand(session)
  }

  release(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.options.terminal.clear()
  }

  close(): void {
    try {
      this.release()
    } finally {
      this.files.close()
    }
  }

  private phaseRun(key: string): RanPhase {
    const run = this.ran.get(key)
    if (run === undefined)
      throw new Error("Phase feedback arrived before its phase started")
    return run
  }

  private writeRoundData(
    status: RoundData["status"],
    commits: readonly RoundData["commits"][number][],
    account: RoundAccount,
    decision: SeriesAnswer | null,
  ): void {
    const data = this.run.data
    if (data === undefined) return
    const auditor = this.ran.get("audit")?.selection ?? data.auditor
    writeRoundData(data.path, {
      target: data.target,
      round: data.round,
      tag: data.tag,
      started: new Date(this.run.started).toISOString(),
      status,
      settings: data.settings,
      auditor: {
        ...data.auditor,
        model: auditor.model,
        effort: auditor.effort,
      },
      phases: [...this.ran].flatMap(([key, ran]) => {
        const { phase, tag } = ran
        if (phase === "close" || phase === "implement" || ran.spent === null)
          return []
        const entry = this.run.phases.find(
          (candidate) => slotKey(candidate.phase, candidate.tag) === key,
        )
        if (entry === undefined)
          throw new Error(`Run data has no ${key} phase owner`)
        return [
          {
            ...(phase === "vet" ? { phase, tag: tag as string } : { phase }),
            assistant: entry.assistant,
            model: ran.selection.model,
            effort: ran.selection.effort,
            launched: ran.launched,
            milliseconds: Math.round(ran.spent),
            tokens: [...ran.tokens],
            peakContext: ran.peakContext,
            compactions: ran.compactions,
          },
        ]
      }),
      commits: [...commits],
      findings: [...account.findings],
      ...(data.pool === undefined ? {} : { pool: [...data.pool] }),
      judge: decision,
      ...("phase" in data
        ? { phase: data.phase, settling: account.settling }
        : "scope" in data
          ? {
              scope: data.scope,
              judgedRepos: [...account.judgedRepos],
            }
          : {
              originalGroups: data.originalGroups.map((group) => ({
                ...group,
                commits: [...group.commits],
              })),
              groups: data.groups.map((group) => ({
                ...group,
                commits: [...group.commits],
              })),
              judgedRepos: [...account.judgedRepos],
            }),
    })
  }
}

function fullerContext(current: Context | null, next: Context): Context {
  const measurement = { tokens: next.tokens, window: next.window }
  if (current === null || next.tokens > current.tokens) return measurement
  if (
    next.tokens === current.tokens &&
    current.window === null &&
    next.window !== null
  )
    return measurement
  return current
}

function changeSince(context: Context | null, baseline: number | null): string {
  return context === null ? "--" : contextChange(context, baseline)
}

function tokenSuffix(tokens: readonly ModelTokenUsage[]): string {
  const text = phaseTokenText(tokens)
  return text.length === 0 ? "" : `  tokens  ${text}`
}
