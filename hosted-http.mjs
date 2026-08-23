#!/usr/bin/env node
/**
 * Hosted HTTP MCP bootstrap.
 *
 * Streamable HTTP is stateful: each Cursor/client session needs its own
 * StreamableHTTPServerTransport. Reusing one transport causes
 * "Invalid Request: Server already initialized" on reconnect.
 */
import process from "node:process";
import express from "express";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { AssessClient } from "./dist/client.js";
import { registerAssessTools } from "./dist/register-tools.js";

const API_BASE_URL = process.env.PRAXICRAFT_API_BASE_URL || "https://assess.praxicraft.com";
const RESOURCE_SERVER_URL = process.env.MCP_RESOURCE_SERVER_URL || "https://assess.praxicraft.com/mcp";
const OAUTH_ISSUER_URL = process.env.MCP_OAUTH_ISSUER || "https://assess.praxicraft.com/api/v1/mcp/oauth";
const SERVICE_DOC_URL = process.env.MCP_SERVICE_DOCUMENTATION_URL || "https://docs.praxicraft.com/assess-mcp";
const PACKAGE_VERSION = "0.2.4";

function oauthIssuerEndpoint(issuer, path) {
  const base = String(issuer).replace(/\/+$/, "");
  const rel = String(path).replace(/^\/+/, "");
  return `${base}/${rel}${rel.endsWith("/") ? "" : "/"}`.replace(/([^:]\/)\/+/g, "$1");
}

function isBrowserNavigation(req) {
  if (req.get("authorization")) return false;
  const mode = (req.get("sec-fetch-mode") || "").toLowerCase();
  if (mode === "navigate" || mode === "nested-navigate") return true;
  const accept = (req.get("accept") || "").toLowerCase();
  return accept.includes("text/html");
}

function jsonRpcError(res, status, code, message) {
  if (res.headersSent) return;
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

// Keep in sync with backend APIKey.ALL_SCOPES.
const SCOPES_SUPPORTED = [
  "assessments:read",
  "assessments:write",
  "invitations:read",
  "invitations:write",
  "candidates:read",
  "cases:read",
  "cases:write",
  "organisation:read",
  "pipelines:read",
  "pipelines:write",
  "webhooks:read",
  "webhooks:write",
  "interviews:read",
  "interviews:write",
];

const port = Number(process.env.PORT || 8787);

/** @type {Map<string, StreamableHTTPServerTransport>} */
const transports = new Map();

function createMcpServer() {
  const server = new McpServer({ name: "assess-mcp-hosted", version: PACKAGE_VERSION });
  // Hosted mode should call the backend Public API using the *caller*'s MCP access token.
  // We keep a legacy fallback key optional so stdio-mode still works for local development.
  registerAssessTools(server, new AssessClient(process.env.PRAXICRAFT_API_KEY));
  return server;
}

const oauthIntrospectUrl = new URL("/api/v1/mcp/oauth/introspect/", API_BASE_URL).href;
const resourceServerUrl = new URL(RESOURCE_SERVER_URL);
const issuerUrl = new URL(OAUTH_ISSUER_URL.endsWith("/") ? OAUTH_ISSUER_URL : `${OAUTH_ISSUER_URL}/`);
const issuerPath = issuerUrl.pathname.replace(/\/+$/, "") || "";
const prmPath = `/.well-known/oauth-protected-resource${resourceServerUrl.pathname === "/" ? "" : resourceServerUrl.pathname}`;
const resourceMetadataUrl = new URL(prmPath, resourceServerUrl.origin).href;

const tokenCache = new Map();
const verifier = {
  async verifyAccessToken(token) {
    const cached = tokenCache.get(token);
    if (cached?.expiresAt && cached.expiresAt > Math.floor(Date.now() / 1000) + 5) return cached;

    const resp = await fetch(oauthIntrospectUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      throw new InvalidTokenError("Invalid MCP access token");
    }

    const data = await resp.json().catch(() => ({}));
    if (!data?.active || typeof data?.claims !== "object" || !data.claims) {
      throw new InvalidTokenError("Invalid MCP access token");
    }

    const claims = data.claims;
    const scopes = Array.isArray(claims.scopes) ? claims.scopes.map(String) : [];
    const expiresAt = typeof claims.exp === "number" ? claims.exp : undefined;
    if (typeof expiresAt !== "number" || Number.isNaN(expiresAt)) {
      throw new InvalidTokenError("Token missing expiration");
    }

    const authInfo = {
      token,
      clientId: String(claims.prefix ?? claims.client_id ?? ""),
      scopes,
      expiresAt,
      extra: { claims },
    };
    tokenCache.set(token, authInfo);
    return authInfo;
  },
};

const oauthMetadata = {
  issuer: OAUTH_ISSUER_URL.replace(/\/+$/, ""),
  authorization_endpoint: oauthIssuerEndpoint(OAUTH_ISSUER_URL, "authorize/"),
  token_endpoint: oauthIssuerEndpoint(OAUTH_ISSUER_URL, "token/"),
  introspection_endpoint: oauthIssuerEndpoint(OAUTH_ISSUER_URL, "introspect/"),
  registration_endpoint: oauthIssuerEndpoint(OAUTH_ISSUER_URL, "register/"),
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "client_credentials"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: SCOPES_SUPPORTED,
};

const app = express();

// Probes — must stay unauthenticated and outside /mcp.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// OAuth discovery endpoints for hosted MCP clients.
app.use(
  "/",
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl,
    serviceDocumentationUrl: SERVICE_DOC_URL ? new URL(SERVICE_DOC_URL) : undefined,
    scopesSupported: SCOPES_SUPPORTED,
    resourceName: "assess-mcp",
  }),
);

// RFC 8414 path insertion: issuer https://host/api/v1/mcp/oauth →
// GET /.well-known/oauth-authorization-server/api/v1/mcp/oauth
if (issuerPath && issuerPath !== "/") {
  const pathStyleAs = `/.well-known/oauth-authorization-server${issuerPath}`;
  const sendAsMetadata = (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.status(200).json(oauthMetadata);
  };
  app.get(pathStyleAs, sendAsMetadata);
  app.get(`${pathStyleAs}/`, sendAsMetadata);
}

// Browser visit to /mcp should not look like a broken JSON API.
app.get("/mcp", (req, res, next) => {
  if (!isBrowserNavigation(req)) return next();
  const docs = SERVICE_DOC_URL || "https://docs.praxicraft.com/assess-mcp";
  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Assess MCP · Praxicraft</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root { --brand:#0d41ff; --text:#171717; --muted:#5c5c5d; --border:#e6e6e8; }
    body { margin:0; font-family:"Space Grotesk",system-ui,sans-serif; color:var(--text); background:#fff; }
    header { display:flex; align-items:center; height:80px; padding:0 16px; border-bottom:1px solid var(--border); }
    header img { height:24px; }
    .badge { margin-left:8px; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--brand); }
    main { max-width:560px; margin:48px auto; padding:0 16px; }
    h1 { font-size:32px; line-height:40px; margin:0 0 12px; }
    p { color:var(--muted); font-size:16px; line-height:26px; }
    pre { background:#f5f5f6; border:1px solid var(--border); border-radius:8px; padding:16px; overflow:auto; font-size:13px; }
    a.btn { display:inline-block; margin-top:8px; background:var(--brand); color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:500; }
  </style>
</head>
<body>
  <header>
    <img src="/images/brand/logo-full-dark.svg" alt="Praxicraft" width="130" height="24" />
    <span class="badge">Assess</span>
  </header>
  <main>
    <h1>Assess MCP</h1>
    <p>This URL is the hosted MCP endpoint for coding agents (Cursor, Claude Desktop, Codex). Open it from your MCP client — not as a normal web page.</p>
    <p>Add this to <code>mcp.json</code>, then connect and sign in when prompted:</p>
    <pre>{
  "mcpServers": {
    "assess": {
      "url": "${RESOURCE_SERVER_URL.replace(/"/g, '\\"')}"
    }
  }
}</pre>
    <p><a class="btn" href="${docs}">Read the MCP docs</a></p>
  </main>
</body>
</html>`);
});

// Parse JSON bodies once so initialize detection + transport can share them.
app.use("/mcp", express.json({ limit: "4mb", type: ["application/json", "application/*+json"] }));

// Gate tool execution with bearer-token verification.
app.use(
  "/mcp",
  requireBearerAuth({
    verifier,
    requiredScopes: [],
    resourceMetadataUrl,
  }),
);

app.all("/mcp", async (req, res) => {
  try {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId) {
      jsonRpcError(res, 404, -32001, "Session not found");
      return;
    }

    // New session: only accept initialize POSTs without a session id.
    if (req.method !== "POST" || !isInitializeRequest(req.body)) {
      jsonRpcError(res, 400, -32000, "Bad Request: No valid session ID provided");
      return;
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
      },
      onsessionclosed: (sid) => {
        transports.delete(sid);
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("assess-mcp /mcp handler error:", err);
    jsonRpcError(res, 500, -32603, "Internal server error");
  }
});

app.listen(port, () => {
  console.log(`assess-mcp hosted HTTP listening on :${port} (/mcp) v${PACKAGE_VERSION}`);
});
