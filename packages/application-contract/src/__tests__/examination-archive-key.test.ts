import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeExaminationRepositoryKey } from "../index.js"

describe("examination archive key helpers", () => {
  it("normalizes repository paths used in archive keys", () => {
    const cases: { raw: string; normalized: string }[] = [
      { raw: "", normalized: "" },
      { raw: "   ", normalized: "" },
      { raw: ".", normalized: "." },
      { raw: "./repo/./project", normalized: "repo/project" },
      { raw: "repo/project/..", normalized: "repo" },
      { raw: "../repo/../project", normalized: "../project" },
      { raw: "/repos/../repos/project//", normalized: "/repos/project" },
      { raw: "/../project", normalized: "/project" },
      { raw: "C:\\repos\\project\\..\\next", normalized: "C:/repos/next" },
      { raw: "C:/../project", normalized: "C:/project" },
      { raw: "C:", normalized: "C:/" },
    ]

    for (const { raw, normalized } of cases) {
      assert.equal(normalizeExaminationRepositoryKey(raw), normalized)
    }
  })
})
