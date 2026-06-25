import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  analysisAutoDiscoveryScopeKey,
  analysisQueryKeys,
  analysisResultScopeKey,
  blameResultScopeKey,
  buildAnalysisOutputConfigKey,
  buildAnalysisQueryIdentity,
  buildBlameOutputConfigKey,
  buildBlameQueryIdentity,
  buildRosterOutputContextKey,
} from "../analysis/analysis-query-keys.js"

function makeRosterMember(id: string, name: string, email: string) {
  return {
    id,
    name,
    email,
    studentNumber: null,
    gitUsername: null,
    gitUsernameStatus: "unknown" as const,
    status: "active" as const,
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: "student" as const,
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "test",
  }
}

function onlyDefinedValues(value: object) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

describe("analysis query keys", () => {
  it("canonicalizes analysis output config identity", () => {
    const key = buildAnalysisOutputConfigKey({
      subfolder: " src\\",
      extensions: [".TS", "ts", " js "],
      includeFiles: ["*"],
      excludeFiles: ["", " **/dist/** "],
      excludeAuthors: [" Bob ", "Alice", "Bob"],
      whitespace: false,
      nFiles: 10,
    })

    assert.deepEqual(onlyDefinedValues(key), {
      subfolder: "src",
      extensions: ["js", "ts"],
      excludeFiles: ["**/dist/**"],
      excludeAuthors: ["Alice", "Bob"],
      nFiles: 10,
    })
  })

  it("canonicalizes blame output config identity", () => {
    const key = buildBlameOutputConfigKey({
      subfolder: " src\\",
      extensions: [".TS", "ts"],
      includeFiles: ["*"],
      excludeEmails: [" student@example.com ", "staff@example.com"],
      whitespace: false,
      copyMove: 1,
    })

    assert.deepEqual(onlyDefinedValues(key), {
      subfolder: "src",
      extensions: ["ts"],
      excludeEmails: ["staff@example.com", "student@example.com"],
    })
  })

  it("preserves roster order in the output context identity", () => {
    const key = buildRosterOutputContextKey({
      members: [
        makeRosterMember("m_002", "Sam Student", "sam.two@example.test"),
        makeRosterMember("m_001", "Sam Student", "sam.one@example.test"),
      ],
    })

    assert.deepEqual(
      key.map((member) => member.id),
      ["m_002", "m_001"],
    )
  })

  it("nests analysis result and blame keys under the repository prefix", () => {
    const source = ["folder", "/courses"] as const
    const repoPath = "/courses/repo-a"
    const analysis = buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid: "abc123",
      config: { includeFiles: ["*"], whitespace: false },
      rosterContext: undefined,
    })
    const blame = buildBlameQueryIdentity({
      source,
      repoPath,
      analysis,
      config: { includeFiles: ["*"], copyMove: 1 },
    })

    assert.deepEqual(
      analysisQueryKeys.result(analysis).slice(0, 5),
      analysisQueryKeys.repo(source, repoPath),
    )
    assert.deepEqual(
      analysisQueryKeys.blame(blame).slice(0, 5),
      analysisQueryKeys.repo(source, repoPath),
    )
    assert.equal("files" in blame, false)
  })

  it("excludes execution-only controls from analysis and blame identities", () => {
    const source = ["folder", "/courses"] as const
    const repoPath = "/courses/repo-a"
    const fastAnalysis = buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid: "abc123",
      config: { extensions: ["ts"], maxConcurrency: 4, blameSkip: false },
      rosterContext: undefined,
    })
    const slowAnalysis = buildAnalysisQueryIdentity({
      source,
      repoPath,
      snapshotCommitOid: "abc123",
      config: { extensions: ["ts"], maxConcurrency: 16, blameSkip: true },
      rosterContext: undefined,
    })
    assert.equal(
      analysisResultScopeKey(fastAnalysis),
      analysisResultScopeKey(slowAnalysis),
    )

    const fewWorkers = buildBlameQueryIdentity({
      source,
      repoPath,
      analysis: fastAnalysis,
      config: { copyMove: 2, maxConcurrency: 4 },
    })
    const manyWorkers = buildBlameQueryIdentity({
      source,
      repoPath,
      analysis: fastAnalysis,
      config: { copyMove: 2, maxConcurrency: 16 },
    })
    assert.equal(
      blameResultScopeKey(fewWorkers),
      blameResultScopeKey(manyWorkers),
    )
  })

  it("scopes auto-discovery markers by source, folder and depth", () => {
    const folder = "/courses/shared"

    assert.notEqual(
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 5),
      analysisAutoDiscoveryScopeKey(["course", "course-b"], folder, 5),
    )
    assert.notEqual(
      analysisAutoDiscoveryScopeKey(["folder", folder], folder, 5),
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 5),
    )
    assert.notEqual(
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 5),
      analysisAutoDiscoveryScopeKey(["course", "course-a"], folder, 6),
    )
  })
})
