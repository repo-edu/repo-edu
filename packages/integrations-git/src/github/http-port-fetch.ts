import type { HttpPort, HttpRequest } from "@repo-edu/host-runtime-contract";

/**
 * Creates a Fetch API-compatible function that delegates to HttpPort.
 * Used by Octokit's `request.fetch` option.
 */
export function createHttpPortFetch(
  http: HttpPort,
): (url: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const resolvedUrl =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url.url;

    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          headers[key] = value;
        }
      } else {
        Object.assign(headers, init.headers);
      }
    }

    const request: HttpRequest = {
      url: resolvedUrl,
      method: (init?.method ?? "GET") as HttpRequest["method"],
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body:
        init?.body !== null && init?.body !== undefined
          ? String(init.body)
          : undefined,
      signal: init?.signal ?? undefined,
    };

    const httpResponse = await http.fetch(request);

    return new Response(httpResponse.body, {
      status: httpResponse.status,
      statusText: httpResponse.statusText,
      headers: httpResponse.headers,
    });
  };
}
