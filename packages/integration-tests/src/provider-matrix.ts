import type { GitProviderHarness } from "./git-provider-harness.js"
import { selectedGitProviders } from "./git-provider-harness.js"
import { createGiteaHarness } from "./gitea-harness.js"
import { createGitHubHarness } from "./github-harness.js"
import { createGitLabHarness } from "./gitlab-harness.js"

function createHarnessByProvider(provider: string): GitProviderHarness | null {
  switch (provider) {
    case "gitea":
      return createGiteaHarness()
    case "gitlab":
      return createGitLabHarness()
    case "github":
      return createGitHubHarness()
    default:
      return null
  }
}

export function resolveHarnessesFromEnvironment(): GitProviderHarness[] {
  const providers = selectedGitProviders()
  const harnesses: GitProviderHarness[] = []
  for (const provider of providers) {
    const harness = createHarnessByProvider(provider)
    if (harness === null) {
      throw new Error(
        `Unknown provider '${provider}' in INTEGRATION_GIT_PROVIDERS.`,
      )
    }
    harnesses.push(harness)
  }
  return harnesses
}
