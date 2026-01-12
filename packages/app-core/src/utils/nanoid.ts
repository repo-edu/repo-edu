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

import type { AssignmentId, GroupId, StudentId } from "@repo-edu/backend-interface/types"

/**
 * Generate a new student ID
 */
export const generateStudentId = (): StudentId => nanoid() as StudentId

/**
 * Generate a new assignment ID
 */
export const generateAssignmentId = (): AssignmentId => nanoid() as AssignmentId

/**
 * Generate a new group ID
 */
export const generateGroupId = (): GroupId => nanoid() as GroupId
