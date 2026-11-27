# App glossary

- **adapter**: an implementation that maps one contract onto something outside
  it. Name the sense wherever the bare word could mislead. A provider adapter
  talks to one outside service, such as an LMS, a Git host or an LLM provider.
  A platform adapter is the operating-system sense that
  `glossaries/child-process-lifetime.md` defines. A coding adapter is the plan
  runner's driver for one Claude, Codex or Gemini coding session, kept apart
  from the product's LLM provider adapters. Other adapters, such as the desktop's
  workflow transport adapter, take only the general meaning.
- **admission**: the check run at the moment a result or record arrives that
  decides whether it is allowed to land, into session state or into the archive.
- **area model**: the committed `tools/architecture-check/src/area-model.json`
  that gives every source file in the source inventory one primary owner and
  records cross-cutting concerns. It is made of partition areas and cover areas,
  each with a stable ID.
- **body**: the function a queued session command runs when its turn comes; it
  awaits its host work and commits its result before the next body starts.
- **browser-safe**: free of Node built-ins across the whole runtime import
  closure, so the sandboxed renderer can load it. The architecture check proves
  it for the renderer and for each independently browser-safe root.
- **commit**: the final step that makes a result count by writing it into the
  session's official state; only queued bodies may commit.
- **contract package**: a package, named with a `-contract` suffix, that
  declares the types, schemas and interfaces one side implements and the other
  calls, without the implementation itself.
- **course backing**: where a course's people come from, chosen when the course
  is set up. An LMS-backed course keeps a student roster and may link to a
  course in the school's LMS. A RepoBee-backed course has no LMS link and works
  from teams of Git usernames instead of a roster.
- **course data**: the content of one course: its name, student and team roster,
  LMS link, repository template and clone settings, analysis settings and
  revision number. Saved and loaded only as one whole course, never in parts.
- **course database**: the one shared file holding every course at rest; the
  only saved home of course data. Settings, window state and the examination
  archive live elsewhere.
- **cover area**: an area-model area that may overlap others and marks a
  cross-cutting concern, used as audit and drift context. It never owns a file
  and never creates an import boundary.
- **fixture**: generated stand-in data. Two senses share the word, so name the
  sense. Deterministic fixture data is the seeded course, settings and file
  data that tests across the monorepo share. A generated fixture repository is
  a realistic student Git repository that the fixture engine, a developer-only
  AI-driven tool, writes for the analysis features; its own terms live in
  `packages/fixture-engine/CLAUDE.md`.
- **group-set naming mode**: whether a group set is named or unnamed. A named
  group set holds named groups of roster members. An unnamed group set holds
  teams listed only by their members' Git usernames, as a RepoBee student list
  does, so a repository name cannot use a group name.
- **host**: four senses share the word, so name the sense. The host process
  and the Codex SDK host process are the process senses that
  `glossaries/child-process-lifetime.md` defines; the second is never a host
  process itself. A host package is one of the packages
  named for the host side: `host-node`, `host-runtime-contract` and
  `renderer-host-contract`. The renderer host bridge is the interface the
  desktop gives the sandboxed renderer for native actions such as file pickers
  and clean close.
- **partition area**: an area-model area that owns source files. The partition
  areas together cover every file in the source inventory exactly once, and
  their import boundaries are enforced. The partition area that owns a file is
  its primary area.
- **port**: an interface for one outside capability that the application
  depends on, such as HTTP, processes, the file system or an LLM. The
  `host-runtime-contract` package declares the ports and `host-node` implements
  them for Node.
- **reducer**: a function that takes the current state and one event and returns
  the next state; the only place session state is allowed to change.
- **row**: one entry in a database, like one line in a table. In the course
  database each row is one complete course: all its course data in one entry,
  replaced whole on every save.
- **session**: the renderer's live working context from startup to teardown:
  loaded settings, courses, the active surface, the stores and the workers
  persisting them.
- **source inventory**: the list of current TypeScript source files under
  `apps/*/src`, `packages/*/src` and `tools/*/src`, untracked ones included,
  that the area model must cover and every architecture check reads.
- **surface**: the main content view the session has active, a course view or
  home; changing it is a surface transition.
- **worker**: a long-lived background helper that writes changes to disk on its
  own schedule; it reports status but may not commit session state.
- **workflow**: one named unit of application work with a fixed input and
  result shape, listed in the application contract's catalogue. The desktop
  runs it through its entry gateway and the command-line program runs it
  in-process.
