import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeHeader,
  parseCsv,
  parseXlsx,
  serializeCsv,
  serializeXlsx,
} from "../index.js";

describe("normalizeHeader", () => {
  it("lowercases and replaces spaces", () => {
    assert.equal(normalizeHeader("First Name"), "first_name");
  });

  it("replaces non-alphanumeric with underscore", () => {
    assert.equal(normalizeHeader("Student ID#"), "student_id");
  });

  it("collapses consecutive underscores", () => {
    assert.equal(normalizeHeader("a - b"), "a_b");
  });

  it("trims leading/trailing underscores", () => {
    assert.equal(normalizeHeader(" name "), "name");
    assert.equal(normalizeHeader("_name_"), "name");
  });

  it("handles all-special-characters", () => {
    assert.equal(normalizeHeader("---"), "");
  });

  it("handles unicode characters", () => {
    assert.equal(normalizeHeader("Prénom"), "pr_nom");
  });
});

describe("parseCsv", () => {
  it("parses a simple CSV", () => {
    const text = "Name,Email\nAlice,alice@example.com\nBob,bob@example.com";
    const result = parseCsv(text);

    assert.deepStrictEqual(result.headers, ["name", "email"]);
    assert.deepStrictEqual(result.rawHeaderNames, ["Name", "Email"]);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].name, "Alice");
    assert.equal(result.rows[0].email, "alice@example.com");
    assert.equal(result.rows[1].name, "Bob");
  });

  it("skips empty rows", () => {
    const text = "Name\nAlice\n\n\nBob";
    const result = parseCsv(text);

    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].name, "Alice");
    assert.equal(result.rows[1].name, "Bob");
  });

  it("handles rows with fewer columns than headers", () => {
    const text = "Name,Email,Phone\nAlice,alice@example.com";
    const result = parseCsv(text);

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].name, "Alice");
    assert.equal(result.rows[0].email, "alice@example.com");
    assert.equal(result.rows[0].phone, undefined);
  });

  it("normalizes headers", () => {
    const text = "Student Name,Student ID,Git Username\nAlice,s1,alice";
    const result = parseCsv(text);

    assert.deepStrictEqual(result.headers, [
      "student_name",
      "student_id",
      "git_username",
    ]);
  });

  it("omits empty values from rows", () => {
    const text = "Name,Email\nAlice,";
    const result = parseCsv(text);

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].name, "Alice");
    assert.equal(result.rows[0].email, undefined);
  });

  it("returns empty result for empty input", () => {
    const result = parseCsv("");
    assert.deepStrictEqual(result.headers, []);
    assert.deepStrictEqual(result.rows, []);
  });
});

describe("serializeCsv", () => {
  it("serializes rows with headers", () => {
    const csv = serializeCsv({
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    });

    assert.ok(csv.includes("name"));
    assert.ok(csv.includes("Alice"));
    assert.ok(csv.includes("bob@example.com"));
  });

  it("handles missing values", () => {
    const csv = serializeCsv({
      headers: ["name", "email"],
      rows: [{ name: "Alice" }],
    });

    assert.ok(csv.includes("Alice"));
  });
});

describe("CSV roundtrip", () => {
  it("roundtrips through serialize and parse", () => {
    const original = {
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    };

    const csv = serializeCsv(original);
    const parsed = parseCsv(csv);

    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].name, "Alice");
    assert.equal(parsed.rows[0].email, "alice@example.com");
    assert.equal(parsed.rows[1].name, "Bob");
  });
});

describe("parseXlsx", () => {
  it("parses a programmatically created XLSX buffer", () => {
    const buffer = serializeXlsx({
      headers: ["name", "email"],
      rows: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    });

    const result = parseXlsx(buffer);

    assert.deepStrictEqual(result.headers, ["name", "email"]);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].name, "Alice");
    assert.equal(result.rows[1].email, "bob@example.com");
  });

  it("normalizes XLSX headers", () => {
    const buffer = serializeXlsx({
      headers: ["Student Name", "Git Username"],
      rows: [{ "Student Name": "Alice", "Git Username": "alice" }],
    });

    const result = parseXlsx(buffer);

    assert.deepStrictEqual(result.headers, ["student_name", "git_username"]);
    assert.equal(result.rows[0].student_name, "Alice");
  });
});

describe("XLSX roundtrip", () => {
  it("roundtrips through serialize and parse", () => {
    const original = {
      headers: ["name", "email", "status"],
      rows: [
        { name: "Alice", email: "alice@example.com", status: "active" },
        { name: "Bob", email: "bob@example.com", status: "dropped" },
      ],
    };

    const buffer = serializeXlsx(original);
    const parsed = parseXlsx(buffer);

    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].name, "Alice");
    assert.equal(parsed.rows[0].status, "active");
    assert.equal(parsed.rows[1].name, "Bob");
    assert.equal(parsed.rows[1].status, "dropped");
  });

  it("uses custom sheet name", () => {
    const buffer = serializeXlsx({
      headers: ["name"],
      rows: [{ name: "Alice" }],
      sheetName: "Students",
    });

    const result = parseXlsx(buffer);
    assert.equal(result.rows.length, 1);
  });
});
