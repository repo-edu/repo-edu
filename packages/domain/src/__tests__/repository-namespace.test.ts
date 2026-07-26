import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  gitNamespaceTerminology,
  normalizeGitNamespaceInput,
} from "../repository-namespace.js"

describe("gitNamespaceTerminology", () => {
  it("uses provider-specific labels and samples", () => {
    assert.deepEqual(gitNamespaceTerminology("gitlab"), {
      label: "GitLab Group",
      sampleSlug: "course-group",
    })
    for (const provider of ["github", "gitea", null, undefined] as const) {
      assert.deepEqual(gitNamespaceTerminology(provider), {
        label: "Organization",
        sampleSlug: "course-org",
      })
    }
  })
})

describe("normalizeGitNamespaceInput", () => {
  it("preserves bare and nested namespace paths", () => {
    assert.equal(normalizeGitNamespaceInput("course-org"), "course-org")
    assert.equal(normalizeGitNamespaceInput("parent/sub"), "parent/sub")
  })

  it("extracts namespace paths from provider URLs", () => {
    assert.equal(
      normalizeGitNamespaceInput("https://github.com/course-org"),
      "course-org",
    )
    assert.equal(
      normalizeGitNamespaceInput(
        "http://gitlab.example.edu/parent/sub?archived=false#repositories",
      ),
      "parent/sub",
    )
  })

  it("excludes query and fragment from bare paths", () => {
    assert.equal(
      normalizeGitNamespaceInput("parent/sub?archived=false#repositories"),
      "parent/sub",
    )
  })

  it("rejects non-provider URL protocols", () => {
    assert.equal(normalizeGitNamespaceInput("ftp://example.edu/parent/sub"), "")
  })

  it("trims whitespace and surrounding slashes", () => {
    assert.equal(
      normalizeGitNamespaceInput("  ///parent/sub///  "),
      "parent/sub",
    )
    assert.equal(normalizeGitNamespaceInput("   "), "")
  })
})
