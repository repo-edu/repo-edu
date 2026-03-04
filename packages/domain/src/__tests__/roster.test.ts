import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRoster, normalizeRosterMember } from "../index.js";

describe("normalizeRosterMember", () => {
  it("uses the first non-empty name candidate and normalizes optional fields", () => {
    const member = normalizeRosterMember({
      id: " 42 ",
      studentNumber: " s-1001 ",
      nameCandidates: ["", " Ada Lovelace ", "Ignored"],
      emailCandidates: [" ", " ada@example.com "],
      gitUsername: " adal ",
      source: " lms ",
    });

    assert.deepStrictEqual(member, {
      id: "42",
      name: "Ada Lovelace",
      email: "ada@example.com",
      studentNumber: "s-1001",
      gitUsername: "adal",
      gitUsernameStatus: "unknown",
      status: "active",
      lmsStatus: null,
      lmsUserId: null,
      enrollmentType: "student",
      enrollmentDisplay: null,
      department: null,
      institution: null,
      source: "lms",
    });
  });

  it("falls back to the normalized id when no name is available", () => {
    const member = normalizeRosterMember({
      id: 77,
      studentNumber: "",
      displayNameCandidates: ["", " "],
      emailCandidates: [null],
      gitUsername: "",
      status: "dropped",
      enrollmentType: "ta",
    });

    assert.deepStrictEqual(member, {
      id: "77",
      name: "77",
      email: "",
      studentNumber: null,
      gitUsername: null,
      gitUsernameStatus: "unknown",
      status: "dropped",
      lmsStatus: null,
      lmsUserId: null,
      enrollmentType: "ta",
      enrollmentDisplay: null,
      department: null,
      institution: null,
      source: "local",
    });
  });
});

describe("normalizeRoster", () => {
  it("normalizes separate student and staff arrays", () => {
    const roster = normalizeRoster(
      [
        {
          id: "s-1",
          nameCandidates: ["Ada"],
          emailCandidates: ["ada@example.com"],
        },
        {
          id: "s-2",
          nameCandidates: ["Grace"],
        },
      ],
      [
        {
          id: "t-1",
          nameCandidates: ["Prof. Turing"],
          emailCandidates: ["turing@example.com"],
        },
      ],
    );

    assert.deepStrictEqual(roster, {
      connection: null,
      students: [
        {
          id: "s-1",
          name: "Ada",
          email: "ada@example.com",
          studentNumber: null,
          gitUsername: null,
          gitUsernameStatus: "unknown",
          status: "active",
          lmsStatus: null,
          lmsUserId: null,
          enrollmentType: "student",
          enrollmentDisplay: null,
          department: null,
          institution: null,
          source: "local",
        },
        {
          id: "s-2",
          name: "Grace",
          email: "",
          studentNumber: null,
          gitUsername: null,
          gitUsernameStatus: "unknown",
          status: "active",
          lmsStatus: null,
          lmsUserId: null,
          enrollmentType: "student",
          enrollmentDisplay: null,
          department: null,
          institution: null,
          source: "local",
        },
      ],
      staff: [
        {
          id: "t-1",
          name: "Prof. Turing",
          email: "turing@example.com",
          studentNumber: null,
          gitUsername: null,
          gitUsernameStatus: "unknown",
          status: "active",
          lmsStatus: null,
          lmsUserId: null,
          enrollmentType: "teacher",
          enrollmentDisplay: null,
          department: null,
          institution: null,
          source: "local",
        },
      ],
      groups: [],
      groupSets: [],
      assignments: [],
    });
  });
});
