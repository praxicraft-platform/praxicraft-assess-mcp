/**
 * Smoke test: spawn assess-mcp, list tools, call get_org against a mock API.
 * Run after `npm run build`.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, "dist", "index.js");

const EXPECTED_TOOLS = [
  "list_assessments",
  "get_assessment",
  "list_assessment_results",
  "create_assessment",
  "update_assessment",
  "duplicate_assessment",
  "list_assessment_tasks",
  "attach_assessment_tasks",
  "replace_assessment_tasks",
  "remove_assessment_task",
  "create_invite",
  "bulk_invite",
  "get_invite",
  "remind_invite",
  "get_invite_result",
  "list_invites",
  "cancel_invite",
  "get_org",
  "list_audit_log",
  "get_org_stats",
  "list_squads",
  "get_squad",
  "list_squad_members",
  "list_org_team",
  "list_platform_tasks",
  "list_tasks",
  "create_task",
  "get_task",
  "update_task",
  "delete_task",
  "list_webhooks",
  "create_webhook",
  "test_webhook",
  "get_webhook",
  "update_webhook",
  "delete_webhook",
  "list_webhook_deliveries",
  "list_interviews",
  "create_interview",
  "bulk_create_interviews",
  "get_interview",
  "get_interview_analysis",
  "get_interview_replay",
  "cancel_interview",
  "reschedule_interview",
  "get_interview_analytics",
  "list_interview_templates",
  "create_interview_template",
  "update_interview_template",
  "delete_interview_template",
  "share_interview",
  "list_interview_org_tasks",
  "list_pipelines",
  "get_pipeline",
  "get_pipeline_enrollment",
  "enroll_candidate",
  "list_integrations",
  "get_integration_connect_url",
  "test_integration",
];

const mockOrg = { name: "Acme", slug: "acme", plan: "growth", squads_enabled: true };

const mockServer = http.createServer((req, res) => {
  if (req.url === "/api/v1/public/org/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(mockOrg));
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", () => resolve()));
const { port } = mockServer.address();
const baseUrl = `http://127.0.0.1:${port}`;

const transport = new StdioClientTransport({
  command: "node",
  args: [serverEntry],
  env: {
    PRAXICRAFT_API_KEY: "ct_live_smoke_test_key",
    PRAXICRAFT_API_BASE_URL: baseUrl,
  },
});

const mcp = new Client({ name: "assess-mcp-smoke", version: "0.1.0" });
await mcp.connect(transport);

try {
  const { tools } = await mcp.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [...EXPECTED_TOOLS].sort(), "tool catalog mismatch");

  const result = await mcp.callTool({ name: "get_org", arguments: {} });
  assert.equal(result.isError, undefined);
  const text = result.content[0];
  assert.equal(text?.type, "text");
  const payload = JSON.parse(text.text);
  assert.equal(payload.name, "Acme");
  assert.equal(payload.plan, "growth");

  console.log(`assess-mcp smoke OK — ${tools.length} tools, get_org returned ${payload.slug}`);
} finally {
  await mcp.close();
  await new Promise((resolve, reject) =>
    mockServer.close((err) => (err ? reject(err) : resolve())),
  );
}
