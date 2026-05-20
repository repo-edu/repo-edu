# huffman-encoder

Complexity: 2

## Assignment

Build a small command-line tool that compresses and decompresses
files using canonical Huffman coding. The CLI accepts
`encode <in> <out>` or `decode <in> <out>`, and an encode followed by
a decode must reproduce the original file byte-for-byte. The encoder
counts byte frequencies in the input, builds a prefix code, writes a
compact header describing the code-length table, and emits the
bit-packed payload; the decoder reverses each step. Internally split
the work into a frequency module that returns a sorted
symbol-frequency table, a tree module that builds a Huffman tree via
a min-heap and derives the canonical code-length table, and a codec
module that bit-packs a byte stream using the code table and decodes
a bit stream by walking the tree. Edge inputs (empty file,
single-symbol file) must round-trip without crashing. Include a
handful of pytest cases covering frequency counting, code generation
for a small alphabet, an encode-then-decode round-trip, and at least
one edge case.
