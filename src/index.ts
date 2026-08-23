#!/usr/bin/env node
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AssessClient } from "./client.js";
import { registerAssessTools } from "./register-tools.js";

const apiKey = process.env.PRAXICRAFT_API_KEY;
if (!apiKey) {
  console.error("PRAXICRAFT_API_KEY is required (ct_live_…)");
  process.exit(1);
}

const client = new AssessClient(apiKey);
const server = new McpServer({ name: "assess-mcp", version: "0.2.2" });
registerAssessTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
