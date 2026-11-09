# Program gate

## Terms

- **Program gate**: the one exclusive claim that the desktop and the
  command-line program each take in the app-data root before product work
  starts. While one program holds it, starting the other fails at once with a
  conflict message; the holder keeps it until no more product work can run.
- **App-data root**: the one per-platform folder where both programs keep their
  saved data and the program gate. Tests and validation harnesses may point
  both programs at another absolute folder instead.
- **Artifact proof**: a check that runs a shipped artifact, the packaged
  desktop app or the compiled command-line binary, rather than the source, to
  prove that a runtime rule holds in what ships. The code an artifact proof
  runs inside the shipped program is its probe.
