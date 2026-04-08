import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  classifyCommentLines,
  extensionToLanguage,
} from "../../analysis/comment-detector.js"

describe("extensionToLanguage", () => {
  it("maps known extensions", () => {
    assert.equal(extensionToLanguage("ts"), "ts")
    assert.equal(extensionToLanguage("py"), "py")
    assert.equal(extensionToLanguage("java"), "java")
  })

  it("strips leading dot", () => {
    assert.equal(extensionToLanguage(".ts"), "ts")
  })

  it("is case-insensitive", () => {
    assert.equal(extensionToLanguage("TS"), "ts")
    assert.equal(extensionToLanguage(".PY"), "py")
  })

  it("returns undefined for unsupported extensions", () => {
    assert.equal(extensionToLanguage("xyz"), undefined)
    assert.equal(extensionToLanguage("md"), undefined)
  })
})

describe("classifyCommentLines", () => {
  describe("C-family (//  /* */)", () => {
    it("detects single-line comments", () => {
      const lines = [
        "// this is a comment",
        "const x = 1",
        "  // indented comment",
      ]
      const result = classifyCommentLines(lines, "ts")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
      assert.ok(result.has(2))
    })

    it("detects block comments", () => {
      const lines = ["/* start", " * middle", " */", "code"]
      const result = classifyCommentLines(lines, "ts")
      assert.ok(result.has(0))
      assert.ok(result.has(1))
      assert.ok(result.has(2))
      assert.ok(!result.has(3))
    })

    it("detects single-line block comment", () => {
      const lines = ["/* single line */", "code"]
      const result = classifyCommentLines(lines, "ts")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
    })

    it("does not classify trailing comments as comment lines", () => {
      const lines = ["const x = 1 // inline comment"]
      const result = classifyCommentLines(lines, "ts")
      assert.ok(!result.has(0))
    })

    it("enters block mode for mid-line block start", () => {
      const lines = ["code /* block start", " continued", " */", "more code"]
      const result = classifyCommentLines(lines, "ts")
      assert.ok(!result.has(0))
      assert.ok(result.has(1))
      assert.ok(result.has(2))
      assert.ok(!result.has(3))
    })
  })

  describe("Python (# and triple quotes)", () => {
    it("detects hash comments", () => {
      const lines = ["# comment", "x = 1"]
      const result = classifyCommentLines(lines, "py")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
    })

    it("detects triple-quote block comments", () => {
      const lines = ['"""', "docstring body", '"""', "code"]
      const result = classifyCommentLines(lines, "py")
      assert.ok(result.has(0))
      assert.ok(result.has(1))
      assert.ok(result.has(2))
      assert.ok(!result.has(3))
    })
  })

  describe("Ruby (# and =begin/=end)", () => {
    it("detects hash comments", () => {
      const lines = ["# comment", "code"]
      const result = classifyCommentLines(lines, "rb")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
    })

    it("detects =begin/=end blocks", () => {
      const lines = ["=begin", "comment body", "=end", "code"]
      const result = classifyCommentLines(lines, "rb")
      assert.ok(result.has(0))
      assert.ok(result.has(1))
      assert.ok(result.has(2))
      assert.ok(!result.has(3))
    })
  })

  describe("HTML (<!-- -->)", () => {
    it("detects HTML comments", () => {
      const lines = [
        "<!-- comment -->",
        "<div>",
        "<!-- multi",
        "  line",
        "  comment -->",
        "</div>",
      ]
      const result = classifyCommentLines(lines, "html")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
      assert.ok(result.has(2))
      assert.ok(result.has(3))
      assert.ok(result.has(4))
      assert.ok(!result.has(5))
    })
  })

  describe("SQL (-- and /* */)", () => {
    it("detects both comment styles", () => {
      const lines = [
        "-- single line",
        "SELECT *",
        "/* block",
        "   continued */",
        "FROM t",
      ]
      const result = classifyCommentLines(lines, "sql")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
      assert.ok(result.has(2))
      assert.ok(result.has(3))
      assert.ok(!result.has(4))
    })
  })

  describe("TeX (marker must be at beginning)", () => {
    it("detects % line comments", () => {
      const lines = ["% comment", "\\section{Title}"]
      const result = classifyCommentLines(lines, "tex")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
    })

    it("does not enter block mode for mid-line block start", () => {
      const lines = ["text \\begin{comment}", "inside", "\\end{comment}"]
      const result = classifyCommentLines(lines, "tex")
      assert.ok(!result.has(0))
      assert.ok(!result.has(1))
      assert.ok(!result.has(2))
    })

    it("detects block comments at line start", () => {
      const lines = [
        "\\begin{comment}",
        "commented out",
        "\\end{comment}",
        "visible",
      ]
      const result = classifyCommentLines(lines, "tex")
      assert.ok(result.has(0))
      assert.ok(result.has(1))
      assert.ok(result.has(2))
      assert.ok(!result.has(3))
    })
  })

  describe("Ruby (=begin must be at beginning)", () => {
    it("detects # line comments", () => {
      const lines = ["# comment", "code"]
      const result = classifyCommentLines(lines, "rb")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
    })

    it("detects =begin/=end block comments at line start", () => {
      const lines = ["=begin", "block comment", "=end", "code"]
      const result = classifyCommentLines(lines, "rb")
      assert.ok(result.has(0))
      assert.ok(result.has(1))
      assert.ok(result.has(2))
      assert.ok(!result.has(3))
    })

    it("does not enter block mode for mid-line =begin", () => {
      const lines = ["x =begin", "not a comment", "=end"]
      const result = classifyCommentLines(lines, "rb")
      assert.ok(!result.has(0))
      assert.ok(!result.has(1))
      assert.ok(!result.has(2))
    })
  })

  describe("Ada (-- only)", () => {
    it("detects line comments only", () => {
      const lines = ["-- comment", "code"]
      const result = classifyCommentLines(lines, "ada")
      assert.ok(result.has(0))
      assert.ok(!result.has(1))
    })
  })

  describe("empty input", () => {
    it("returns empty set", () => {
      const result = classifyCommentLines([], "ts")
      assert.equal(result.size, 0)
    })
  })
})
