/** Public API path builders — keep in sync with backend public_urls.py */

export const PUBLIC_PREFIX = "/api/v1/public";

export type QueryValue = string | number | boolean | undefined | null;

/** Drop empty values and stringify the rest for URLSearchParams. */
export function queryParams(
  query: Record<string, QueryValue>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = String(value);
  }
  return out;
}

/** Append `?key=value` query string to an absolute API path. */
export function appendQuery(
  path: string,
  query?: Record<string, string | undefined>,
): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  if (!qs) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${qs}`;
}

/** List endpoint: `/api/v1/public/{resource}/` with optional query string. */
export function listPath(
  resource: string,
  query?: Record<string, string | undefined>,
): string {
  const trimmed = resource.replace(/^\/+|\/+$/g, "");
  return appendQuery(`${PUBLIC_PREFIX}/${trimmed}/`, query);
}

/** Detail/action endpoint under public prefix. */
export function publicPath(...segments: string[]): string {
  const joined = segments
    .map((s) => s.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `${PUBLIC_PREFIX}/${joined}/`;
}

/**
 * Extract the opaque `cursor` query param from a Public API `next` / `previous` URL.
 * Internal hostnames (e.g. `bureau-backend`) are fine — only the cursor value is needed.
 */
export function extractCursorFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url, "https://assess.praxicraft.com");
    return parsed.searchParams.get("cursor");
  } catch {
    return null;
  }
}

/**
 * Enrich cursor-paginated list payloads with `next_cursor` / `previous_cursor`
 * so agents can page without rewriting absolute `next` URLs.
 */
export function withPaginationCursors(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const page = payload as Record<string, unknown>;
  if (!("results" in page) || (!("next" in page) && !("previous" in page))) {
    return payload;
  }
  return {
    ...page,
    next_cursor: extractCursorFromUrl(
      typeof page.next === "string" ? page.next : null,
    ),
    previous_cursor: extractCursorFromUrl(
      typeof page.previous === "string" ? page.previous : null,
    ),
  };
}
