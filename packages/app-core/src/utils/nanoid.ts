/**
 * ID generation utilities using nanoid.
 * Uses a custom alphabet for URL-safe IDs compatible with the backend.
 */

import { customAlphabet } from "nanoid"

/**
 * Custom nanoid generator with URL-safe alphabet.
 * Matches the backend configuration for consistent ID generation.
 */
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-",
  21,
)

import type {
  AssignmentId,
  RosterMemberId,
  StudentId,
} from "@repo-edu/backend-interface/types"

/**
 * Generate a new roster member ID
 */
export const generateMemberId = (): RosterMemberId => nanoid() as RosterMemberId

/** @deprecated Use generateMemberId instead */
export const generateStudentId = (): StudentId => generateMemberId()

/**
 * Generate a new assignment ID
 */
export const generateAssignmentId = (): AssignmentId => nanoid() as AssignmentId

/**
 * Generate a new group ID
 */
export const generateGroupId = (): string => nanoid()

/**
 * Generate a new group set ID
 */
export const generateGroupSetId = (): string => nanoid()
