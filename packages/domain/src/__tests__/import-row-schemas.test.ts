import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  gitUsernameImportRowSchema,
  groupEditImportRowSchema,
  studentImportRowSchema,
} from "../schemas.js"

describe("studentImportRowSchema", () => {
  it("accepts a row with all fields", () => {
    const result = studentImportRowSchema.safeParse({
      name: "Alice",
      id: "s1",
      email: "alice@example.com",
      student_number: "12345",
      git_username: "alice",
      status: "active",
    })
    assert.equal(result.success, true)
  })

  it("accepts a row with only name", () => {
    const result = studentImportRowSchema.safeParse({ name: "Bob" })
    assert.equal(result.success, true)
  })

  it("rejects a row without name", () => {
    const result = studentImportRowSchema.safeParse({
      email: "bob@example.com",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty name", () => {
    const result = studentImportRowSchema.safeParse({ name: "" })
    assert.equal(result.success, false)
  })
})

describe("gitUsernameImportRowSchema", () => {
  it("accepts valid email + git_username", () => {
    const result = gitUsernameImportRowSchema.safeParse({
      email: "alice@example.com",
      git_username: "alice",
    })
    assert.equal(result.success, true)
  })

  it("rejects missing git_username", () => {
    const result = gitUsernameImportRowSchema.safeParse({
      email: "alice@example.com",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty email", () => {
    const result = gitUsernameImportRowSchema.safeParse({
      email: "",
      git_username: "alice",
    })
    assert.equal(result.success, false)
  })
})

describe("groupEditImportRowSchema", () => {
  it("accepts row with student_id", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_id: "s1",
    })
    assert.equal(result.success, true)
  })

  it("accepts row with student_email", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_email: "alice@example.com",
    })
    assert.equal(result.success, true)
  })

  it("accepts row with both identifiers", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_id: "s1",
      student_email: "alice@example.com",
      group_id: "g1",
    })
    assert.equal(result.success, true)
  })

  it("rejects row with neither identifier", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty group_name", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "",
      student_id: "s1",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty student_id when no email", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_id: "",
    })
    assert.equal(result.success, false)
  })
})
