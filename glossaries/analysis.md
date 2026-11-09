# Analysis

## Terms

- **Person database**: the analysis model that groups the Git author name and
  email pairs found in one repository into persons, each with one canonical
  name and email, its other pairs as aliases and a commit count. A run builds
  its baseline from the commit log. Blame then adds each name and email pair
  the log did not show, as an alias of a matching person or as a new person.
