import { safeFetch } from "@/lib/fetch-client";

const ANILIST_URL = "https://graphql.anilist.co";
const MAX_RETRY_WAIT_MS = 10_000;

export class AniListError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "AniListError";
  }
}

/**
 * POSTs a GraphQL query to AniList and returns `data`. `token` sends it as a signed-in user
 * (their list, mutations). Retries 429 and 5xx responses, waiting for Retry-After when AniList
 * sends it.
 */
export async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  { retries = 3, timeoutMs = 8000, token }: { retries?: number; timeoutMs?: number; token?: string } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await safeFetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      timeoutMs,
    });

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, MAX_RETRY_WAIT_MS)));
      continue;
    }

    const json = await res.json().catch(() => null);
    // AniList can answer 200 with partial data and an errors array; only fail when data is missing
    if (!res.ok || !json?.data) {
      throw new AniListError(json?.errors?.[0]?.message || `AniList responded ${res.status}`, res.status);
    }
    return json.data as T;
  }
}
