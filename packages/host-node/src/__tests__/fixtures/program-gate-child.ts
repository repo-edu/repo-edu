import {
  claimProgramGate,
  programGateArtifactProbeMarker,
} from "../../program-gate.js"

const root = process.env.REPO_EDU_PROGRAM_GATE_TEST_ROOT
const mode = process.env.REPO_EDU_PROGRAM_GATE_TEST_MODE

if (!root || (mode !== "attempt" && mode !== "hold")) {
  throw new Error("The program-gate child requires a root and mode.")
}

const claim = await claimProgramGate(root)
process.stdout.write(
  `${JSON.stringify({ marker: programGateArtifactProbeMarker, state: claim.status })}\n`,
)

if (claim.status === "held") {
  if (mode === "attempt") {
    claim.release()
  } else {
    process.stdin.resume()
  }
}
