/**
 * Minimal glob matcher. Supports `*`/`**` (any characters, including `/`) and
 * `?` (single non-`/` character).
 * An empty or undefined pattern matches any string.
 */
export function matchesGlob(
  name: string,
  pattern: string | undefined,
): boolean {
  if (pattern === undefined || pattern === "") {
    return true
  }
  const regex = globToRegExp(pattern)
  return regex.test(name)
}

function globToRegExp(pattern: string): RegExp {
  let regex = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        regex += ".*"
        index += 1
      } else {
        regex += ".*"
      }
      continue
    }
    if (char === "?") {
      regex += "[^/]"
      continue
    }
    if (/[.+^${}()|[\]\\]/.test(char)) {
      regex += `\\${char}`
      continue
    }
    regex += char
  }
  regex += "$"
  return new RegExp(regex)
}
