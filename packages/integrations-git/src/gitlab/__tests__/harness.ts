import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"

export const baseDraft: GitConnectionDraft = {
  provider: "gitlab",
  baseUrl: "https://gitlab.example.com",
  token: "glpat-test-token",
}

type MockRoute = {
  method: string
  urlPattern: string | RegExp
  status: number
  body: unknown
}

export function findUserAgent(
  headers: Record<string, string> | undefined,
): string | undefined {
  return headers?.["User-Agent"]
}

export function createMockHttpPort(routes: MockRoute[]): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      for (const route of routes) {
        const methodMatches =
          request.method === route.method ||
          (!request.method && route.method === "GET")
        const urlMatches =
          typeof route.urlPattern === "string"
            ? request.url.includes(route.urlPattern)
            : route.urlPattern.test(request.url)
        if (methodMatches && urlMatches) {
          return {
            status: route.status,
            statusText: route.status < 300 ? "OK" : "Error",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(route.body),
          }
        }
      }
      return {
        status: 404,
        statusText: "Not Found",
        headers: {},
        body: JSON.stringify({ message: "Not Found" }),
      }
    },
  }
}
