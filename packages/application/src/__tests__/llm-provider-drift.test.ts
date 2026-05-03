import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type LlmProviderKind,
  llmProviderKinds,
} from "@repo-edu/domain/settings"
import {
  type LlmProvider,
  supportedLlmProviders,
} from "@repo-edu/integrations-llm-contract"

// Compile-time assertion: domain's LlmProviderKind and the contract's
// LlmProvider must remain the same string-literal union. Adding a provider
// to one package without the other will fail typecheck.
type AssertEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false
const _providerKindMatchesContract: AssertEqual<LlmProviderKind, LlmProvider> =
  true
void _providerKindMatchesContract

describe("LLM provider union drift", () => {
  it("domain llmProviderKinds matches integrations-llm-contract supportedLlmProviders", () => {
    assert.deepStrictEqual(
      [...llmProviderKinds].sort(),
      [...supportedLlmProviders].sort(),
    )
  })
})
