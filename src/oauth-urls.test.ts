import assert from "node:assert/strict";
import test from "node:test";
import { oauthIssuerEndpoint } from "./oauth-urls.js";

test("oauthIssuerEndpoint preserves issuer path (no leading-slash replace)", () => {
  const issuer = "https://staging.praxicraft.com/api/v1/mcp/oauth";
  assert.equal(
    oauthIssuerEndpoint(issuer, "authorize/"),
    "https://staging.praxicraft.com/api/v1/mcp/oauth/authorize/",
  );
  assert.equal(
    oauthIssuerEndpoint(issuer, "/token"),
    "https://staging.praxicraft.com/api/v1/mcp/oauth/token/",
  );
  assert.equal(
    oauthIssuerEndpoint(issuer, "register/"),
    "https://staging.praxicraft.com/api/v1/mcp/oauth/register/",
  );
  // Regression: absolute-path join would wrongly become /authorize/ on the host root.
  assert.notEqual(
    new URL("/authorize/", issuer).href,
    oauthIssuerEndpoint(issuer, "authorize/"),
  );

  // RFC 8414 path insertion for issuer with a path component.
  const issuerUrl = new URL(`${issuer}/`);
  const issuerPath = issuerUrl.pathname.replace(/\/+$/, "");
  assert.equal(
    `/.well-known/oauth-authorization-server${issuerPath}`,
    "/.well-known/oauth-authorization-server/api/v1/mcp/oauth",
  );
});
