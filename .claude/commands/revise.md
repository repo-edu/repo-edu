---
description: Rewrite one draft twin of a planning or implementation-audit round in a fresh session, so the document the user decides from is read once by someone who did not write it.
argument-hint: [workflow-file] [document-file] [source-file...]
disable-model-invocation: true
---

This command is a special case of /simple. Invoke the `simple` skill with no
arguments so its requirement enters this session, and apply that requirement
to the whole session. Skip the skill's confirm-and-wait step: continue
directly with the rewrite.

You are the second pass: you did not write this draft, so read it the way the
user will. Apply the workflow's tests, then replace the file with the rewritten
document. Never append a critique or a change list.

The first argument is the workflow that owns this document's shape. Read it
completely, including its section on the second pass, and follow it. The second
argument is the draft to replace. Any further arguments are the sources that
workflow grounds the document in; a workflow that grounds its document in
something else names that itself, and one that names no extra source is given
none.

$ARGUMENTS
