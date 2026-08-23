/**
 * Join an OAuth issuer base with a relative path without dropping the issuer path.
 * `new URL("/authorize/", issuer)` is wrong — a leading "/" replaces the path.
 */
export function oauthIssuerEndpoint(issuer: string, path: string): string {
  const base = issuer.replace(/\/+$/, "");
  const rel = path.replace(/^\/+/, "");
  return `${base}/${rel}${rel.endsWith("/") ? "" : "/"}`.replace(/([^:]\/)\/+/g, "$1");
}
