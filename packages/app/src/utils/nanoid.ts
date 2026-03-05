import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-",
  21,
);

export const generateMemberId = (): string => nanoid();
export const generateAssignmentId = (): string => nanoid();
export const generateGroupId = (): string => nanoid();
export const generateGroupSetId = (): string => nanoid();
export const generateProfileId = (): string => nanoid();
