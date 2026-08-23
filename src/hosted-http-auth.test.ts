// @ts-nocheck
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import test from "node:test";
import express from "express";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { AssessClient } from "./client.js";
import { registerAssessTools } from "./register-tools.js";

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("hosted MCP forwards validated bearer token to Public API", async () => {
  const app = express();

  const GOOD_TOKEN = "mcp_good_token";
  const FALLBACK_API_KEY = "ct_live_should_not_be_used";

  let introspectCalls = 0;
  let publicApiAuthHeader = undefined;

  app.use(express.json({ type: "*/*" }));

  app.post("/api/v1/mcp/oauth/introspect/", (req, res) => {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${GOOD_TOKEN}`) {
      return res.status(401).json({ active: false });
    }
    introspectCalls += 1;
    const now = Math.floor(Date.now() / 1000);
    return res.json({
      active: true,
      claims: {
        exp: now + 900,
        prefix: "ct_live_prefix",
        scopes: ["organisation:read"],
        org_id: "org-id",
        api_key_id: "api-key-id",
      },
    });
  });

  app.get("/api/v1/public/org/", (req, res) => {
    publicApiAuthHeader = req.headers.authorization ?? "";
    assert.equal(publicApiAuthHeader, `Bearer ${GOOD_TOKEN}`);
    return res.json({ name: "Acme", slug: "acme", plan: "growth", squads_enabled: true });
  });

  const backendServer = http.createServer(app);
  backendServer.listen(0, "127.0.0.1");
  const backendPort = await new Promise((resolve) => backendServer.on("listening", () => resolve(backendServer.address().port)));
  const apiBaseUrl = `http://127.0.0.1:${backendPort}`;

  const mcpServerApp = express();
  /** @type {Map<string, StreamableHTTPServerTransport>} */
  const transports = new Map();

  const oauthIntrospectUrl = new URL("/api/v1/mcp/oauth/introspect/", apiBaseUrl).href;
  const verifier = {
    async verifyAccessToken(token) {
      const resp = await fetch(oauthIntrospectUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new InvalidTokenError("Invalid token");
      const data = await resp.json();
      if (!data.active) throw new InvalidTokenError("Invalid token");
      const claims = data.claims;
      return {
        token,
        clientId: String(claims.prefix ?? ""),
        scopes: Array.isArray(claims.scopes) ? claims.scopes.map(String) : [],
        expiresAt: claims.exp,
      };
    },
  };

  mcpServerApp.use("/mcp", express.json({ limit: "4mb" }));
  mcpServerApp.use(
    "/mcp",
    requireBearerAuth({
      verifier,
      requiredScopes: [],
      resourceMetadataUrl: "http://localhost/.well-known/oauth-protected-resource/mcp",
    }),
  );

  mcpServerApp.all("/mcp", async (req, res) => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (sessionId) {
        res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null });
        return;
      }
      if (req.method !== "POST" || !isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        });
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
      const server = new McpServer({ name: "assess-mcp-hosted-test", version: "0.0.0" });
      registerAssessTools(server, new AssessClient(FALLBACK_API_KEY, apiBaseUrl));
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  const mcpServerHttp = http.createServer(mcpServerApp);
  mcpServerHttp.listen(0, "127.0.0.1");
  const mcpPort = await new Promise((resolve) => mcpServerHttp.on("listening", () => resolve(mcpServerHttp.address().port)));
  const mcpUrl = new URL(`http://127.0.0.1:${mcpPort}/mcp`);

  const clients = [];
  try {
    async function connectClient() {
      const transportWithAuth = new StreamableHTTPClientTransport(mcpUrl, {
        requestInit: {
          headers: { Authorization: `Bearer ${GOOD_TOKEN}` },
        },
      });
      const client = new Client({ name: "test", version: "0.0.0" });
      await withTimeout(client.connect(transportWithAuth), 5000, "client.connect");
      clients.push({ client, transport: transportWithAuth });
      return client;
    }

    const client = await connectClient();
    const result = await withTimeout(
      client.callTool({ name: "get_org", arguments: {} }),
      5000,
      "callTool get_org",
    );
    assert.equal(result.isError, undefined);
    assert.ok(result.content?.[0]?.text, "expected a text response");
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.slug, "acme");
    assert.ok(introspectCalls >= 1, "expected at least one introspection call");

    // Reconnect must create a new session (not "Server already initialized").
    const client2 = await connectClient();
    const result2 = await withTimeout(
      client2.callTool({ name: "get_org", arguments: {} }),
      5000,
      "callTool get_org reconnect",
    );
    assert.equal(result2.isError, undefined);
    assert.ok(transports.size >= 1);
  } finally {
    for (const { client, transport } of clients) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
    }
    for (const t of transports.values()) {
      try {
        await t.close();
      } catch {
        /* ignore */
      }
    }
    await new Promise((resolve) => mcpServerHttp.close(resolve));
    await new Promise((resolve) => backendServer.close(resolve));
  }
});
