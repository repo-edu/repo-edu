import { customAlphabet } from "nanoid"

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-",
  21,
)

export const generateCourseId = (): string => nanoid()
