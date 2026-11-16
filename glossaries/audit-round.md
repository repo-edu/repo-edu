# Audit round

This file defines the words of the planning and implementation-audit rounds
and of the runner that drives them. Words the home Planning vocabulary
defines, such as round, watch, glance, episode, handoff, settle and stem, keep
their entries there. A report on its own means any kind of report; each kind
is always named in full.

## Phases and roles

- **Phase**: two senses. A round phase is one part of a round, or one runner
  command, that runs in its own assistant session, such as the audit, the vet,
  the rebuttal, the fix, the watch, a step's implementation or the close. A
  plan's phase is widening or detailing, which the plan's filename shows.
- **Auditor**: the selection that runs or ran an audit, whether it is on the
  auditor list or not, and that audit's session. An entry of the auditor list
  is an auditor even before it has run. The auditor does not defend the audit
  report against the vetters; the rebuttal does.
- **Vet**: the phase in which the panel checks an audit report. Each vetter
  reads the audit report and its sources from a fresh context and returns one
  verdict per finding. The word names the phase only, never one member of the
  panel.
- **Vetter**: one entry of a work class's vetter list, and its vet session. A
  vetter checks every audit report of its work class, whoever audited, and
  never reads another vetter's vet report.
- **Panel**: every vetter of the target's work class. The vetters of a panel
  check one audit report side by side.
- **Rebuttal**: the phase that answers each vetter's revisions, drops and
  referrals, its session and its answers. The runner always starts it as a new
  session on the auditor's model and effort, so the session that answers never
  wrote the audit report. A hand-run round may answer from the audit session
  while that session still holds the round. No rebuttal runs when every vetter
  accepted every finding.
- **Coder**: one entry of the coder list in the runner settings. Declaring a
  plan ready assigns it the next coder in turn. That coder implements every
  step of the plan and fixes its implementation audits.
- **Fixer**: the selection that runs a round's fix. Planning rounds and commit
  audits of plan commits only use the planning fixer. Implementation audits use
  the plan's coder, and commit audits with a Repo Edu commit use the first
  coder.
- **Implementer**: the session that implements one plan step.

## Findings, verdicts and rulings

- **Contest**: a rebuttal answer that disputes one vetter's verdict on evidence
  that vetter can read. A contest is serious when the audit report or a vetter
  graded the finding A or B, and a serious contest goes to the user.
- **Split**: two senses. A panel split is two vetters whose verdicts on one
  finding differ, or who both revise it while the rebuttal does not agree with
  both. It is serious when the finding's grade lies within its work class's
  range, A or B for planning and A to C for implementation, and a serious
  split goes to the user. A plan split divides one topic's work into peer
  plans, a shape decision recorded with its reason.
- **Referral**: a vetter's verdict that sends a finding to the user's ruling
  instead of settling it. Like any verdict it is a claim about the evidence,
  and a later phase may overturn it.
- **Ruling**: a decision a round or a plan step leaves to the user, and the
  document that asks for it. The fix or the implementation worker writes the
  document, the user answers it with a reply in the ruling chat and the same
  session then resumes. A reply always means the user's answer to a ruling.
- **Open item**: one numbered decision in a ruling that still needs the user's
  answer.
- **Deferral**: an accepted correction whose destination repo is outside the
  judged repo set, so the round could not land it. The round records it in its
  commit body. It stays open until a later round in the destination repo
  applies or drops it and cites it.
- **Judged repo set**: the repos a round judges and may change: the plan repo,
  Repo Edu or both. The audit report's opening names it.

## Reports and files

- **Audit report**: the audit's document. Its opening names the target and the
  judged repo set, and its fields hold the findings.
- **Vet report**: one vetter's document, with one verdict for each finding of
  the audit report.
- **Rebuttal report**: the rebuttal's document, with one answer for each
  verdict other than an accept, naming the vetter it answers.
- **Phase result**: the control line that ends an unattended phase's response.
  It tells the runner whether the phase finished, failed or needs a ruling.
- **Settling line**: the one line that ends a widening audit report and a
  widening fix. It advises settle or keep open, with a one-line reason, and the
  runner keeps the latest one as the round's settling recommendation.
- **Evidence repo**: the private checkout `plan-evidence` beside the plan and
  Repo Edu checkouts. It holds the round folder and, after each close, the
  closed plan's round files. Only the runner commits it.
- **Round folder**: the `active/` folder of the evidence repo. It holds every
  round file of live work. The plan checkout's own `active/` folder holds plans
  and their briefs only.
- **Round file**: any file that a round, a plan step, a close or a yield review
  writes into the round folder, such as a report, a ruling, a log or a handoff.
- **Phase file**: a round file that one phase of a numbered round writes, named
  by its target, round number, order and kind.
- **Claim**: the empty round file that reserves a round's number before any
  phase runs.
- **Marker**: two senses. A marker commit records one point in a plan's life,
  such as ready, implemented or closed, and lands no other work. A marker file
  is an empty round file that records a change of plan phase: settle or reopen.
  Text that could mean either says marker commit or marker file.
- **Round data**: the checked machine files that keep each round's settings,
  phases, findings, outcomes and series answer. Each plan has one for its
  planning rounds and one for its implementation audits, and each commit
  series has its own. A plan's round data moves beside the archived plan at
  its close.
- **Model read-out**: the runner's comparison of auditors, vetter pairs and
  coders, built from round data and both Git histories. It starts no assistant
  and writes no round file or round data.

## Selections and settings

- **Selection**: an assistant with a model and an effort, as the runner
  settings name one for each phase and each list entry. The model may be a
  family alias that names whichever release is current.
- **Launched selection**: the selection the settings named for a phase before
  any alias was resolved. Every phase records one. It differs from the
  selection an audit ran on, which only the audit records, with its alias
  resolved when the runner started, and which the series rules match against
  each listed auditor.
- **Work class**: planning or implementation, the kind of work a round's
  target belongs to. Plan rounds and commit audits of plan commits only are
  planning. Implementation audits and commit audits with any Repo Edu commit
  are implementation. The work class picks the audit level.
- **Audit level**: the runner settings for one work class: its auditor list,
  its vetter list, its watch writer and, for planning, its fixer.
- **Auditor list**: the ordered auditors of one work class's audit level. An
  automatic series opens from it and picks every later auditor from it.
- **Listed auditor**: one entry of a work class's auditor list. Each listed
  auditor needs its own current read before an automatic series ends.
- **Auditor entry**: one entry of a manual queue that the user types for a
  series, which then runs in that order. An entry of the auditor list is a
  listed auditor instead.
- **Tier**: two senses. A finding's tier is its grade, A to D. A model tier is
  the base, top or unlisted letter in a commit's capability tag.

## Series

- **Automatic series**: consecutive audit rounds on one target in which the
  runner applies the fixed series rules after each round. The rules decide
  whether the series ends or which listed auditor reads next. A series runs
  this way whenever the user types no manual queue.
- **Commit series**: a series whose target is a set of commits rather than a
  plan. Each later round adds the fixes the series has landed. It has no close,
  so its round files stay in the round folder.
- **Current read**: a listed auditor's audit of the target that started after
  the latest event that changed the target's scope. Those events are a settle
  or reopen, a plan step, a plan-file edit outside a round and an audit with a
  real bug.
- **Real bug**: an accepted finding grave enough to make earlier reads stale:
  A in widening, and A or B in detailing, implementation and commit series.
- **Read floor**: the point where every listed auditor of the target's work
  class has a current read. An automatic series ends there with its series
  answer.
- **Series answer**: the runner's decision after an automatic round, with its
  reason: settle, ready, stop or the next listed auditor. Round data keeps it.
- **Chained round**: a planning round that the runner adds to an automatic
  implementation series for open deferrals into the plan repo. It audits only
  those deferrals, claims its own planning-round number and takes no turn of
  the implementation series.
- **Chain**: one succession of rounds along one branch of history, together
  with the handoffs those rounds write. A second branch carries its own chain.

## Plans and steps

- **Hosting repo**: a repo whose files a plan step changes, as the step's host
  sentence names it. A step hosted in both repos has two.
- **Hosted share**: one hosting repo's part of a plan step, landed as one step
  commit in that repo.
- **Step scope**: any set of plan steps: one step or an increasing range of
  steps.
- **Audit range**: one step scope listed in a plan's audit ranges sentence.
  Once a plan is implemented, the runner audits each listed range in order and
  then the full range.
- **Plan brief**: a reading aid for one plan, written for a reader who did not
  take part in its discussion. It is not committed, and no round reads it.
- **Listed file**: a doctrine file that tells a round session how to judge,
  named on the runner's list of such files or sitting under a folder the list
  names. It changes only inside a plan, as a step or as a fix from that plan's
  implementation audit.
- **Failure record**: the plan repo's root file with one row for each failure
  the round doctrine exists to prevent. A plan that changes a listed file and
  its audit rounds measure the change against it.
- **Walk-through**: the section of a plan that changes a listed file which
  answers two questions against the failure record: which failures the change
  answers and why the passages already aimed at them did not prevent them, and
  which failures it could bring back and why each still holds.
- **Yield review**: a hand-run rating of each plan decision's benefit to the
  user against its complexity, with optional vet, rebuttal and final reports
  of its own. It allocates no audit round and lands no commit.

## What binds a round

- **Fixed input**: something a round may not change by an ordinary finding.
  There are four kinds: an entry of the plan repo's boundaries file, a user
  decision, a decision of a shipped plan and a landed step. Each kind has one
  route for a change:
  1. A boundary entry, a user decision or a landed step changes only through
     the user. A round that has new evidence against one reports a premise
     error, and the user decides.
  2. A shipped plan's decision changes only when a plan names the narrowing or
     reversal in its Baseline with its new evidence. A change named that way
     is no premise error: the finding that brings it settles like a change to
     a plan decision. A change the Baseline does not name is a finding against
     the plan.
- **User decision**: a decision the user made, recorded in a plan's Product
  constraints as a numbered entry with its date and the user's words. It is a
  fixed input. An entry that lacks the date or the words is no user decision.
- **Plan decision**: an entry in a plan's Decisions: the plan's own choice,
  with its reason. It is no fixed input, so a round may change it under the
  shared planning rules. Once its plan has shipped, it is a shipped plan's
  decision.

## Finding ratings

- **Reach**: how far a finding's fault reaches a person: developer, ordinary,
  rare or very rare.
- **Complexity**: how a correction or a commit changes the whole maintenance
  burden, from a high reduction through none to a high increase. It measures
  what future work must understand, preserve and coordinate, never the effort
  of making the change.
- **Growth pattern**: one of the evidence-backed ways that planning work grows
  designs nobody asked for, as the plan repo's growth-patterns file lists them.
  Every finding names the patterns its work could match, or none.
- **Burden mark**: the growth or pruning word, with its level, before a
  commit's severity sequence. It states the whole commit's net change in
  maintenance burden.
