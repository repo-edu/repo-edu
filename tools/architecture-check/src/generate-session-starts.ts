import { readFileSync, writeFileSync } from "node:fs"
import {
  rendererStartDocument,
  renderSessionStartTable,
  startTableBegin,
  startTableEnd,
} from "./renderer-start-document.js"
import { ROOT, repoPathToAbsolute } from "./repo-paths.js"

const file = repoPathToAbsolute(ROOT, rendererStartDocument)
const document = readFileSync(file, "utf8")
const beginning = document.indexOf(startTableBegin)
const ending = document.indexOf(startTableEnd)
if (beginning < 0 || ending < beginning)
  throw new Error(
    "The renderer documentation must mark its generated start table.",
  )
writeFileSync(
  file,
  document.slice(0, beginning) +
    renderSessionStartTable() +
    document.slice(ending + startTableEnd.length),
)
