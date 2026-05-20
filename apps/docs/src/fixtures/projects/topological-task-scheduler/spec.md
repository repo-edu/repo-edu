# topological-task-scheduler

Complexity: 2

## Assignment

Build a small command-line tool that reads task dependency
definitions from a text file and prints a valid build order, or
flags a circular dependency. The input has one task per line in the
form `task: dep1 dep2 ...` (an empty dep list is allowed); the tool
takes the file path as its first argument and either prints a
topologically sorted task sequence on stdout (one task per line,
dependencies before dependents) or reports the participating tasks
of any cycle on stderr and exits non-zero. Internally split the
work into a parser module that turns the file into typed `Task`
records (name plus dependency list), a graph module that builds
adjacency lists and in-degree counts from those records and
validates that every referenced dependency exists, and a scheduler
module that runs Kahn's algorithm over the graph to yield a
deterministic topological order or detect a cycle. Ties (multiple
tasks ready at the same time) must be broken in lexicographic order
so the output is reproducible across runs. Include a handful of
pytest cases covering parsing of varied input, a linear-order
graph, a graph with ties, a missing-dependency error, and at least
one cycle case.
