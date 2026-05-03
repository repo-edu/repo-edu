# arithmetic-expression-evaluator

Complexity: 2

## Assignment

Build a small command-line calculator that reads arithmetic expressions
from standard input one per line and prints the numeric result for each.
The calculator must support integers and decimals, the four basic
operators with correct precedence, and parenthesised sub-expressions.
Internally split the work into a tokenizer that turns a raw line into a
list of tokens, a parser that turns tokens into an expression tree, and
an evaluator that walks the tree to produce a number. Invalid input
should produce a clear error message on the same line instead of a
crash. Include a handful of pytest cases covering precedence, decimals,
parentheses, and at least one error case.
