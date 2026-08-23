# Praxicraft Assess MCP

Official [Model Context Protocol](https://modelcontextprotocol.io) server for the **[Praxicraft Assess](https://assess.praxicraft.com)** Public API.

Connect Cursor, Claude Code, Claude Desktop, Codex, or any MCP client so an agent can invite candidates, manage assessments and pipelines, register webhooks, and fetch results — with your permission.

```bash
npx -y @praxicraft/assess-mcp
```

**Requires Node.js 18+.** Product docs: [docs.praxicraft.com/assess-mcp](https://docs.praxicraft.com/assess-mcp) · [Build with agents](https://docs.praxicraft.com/build-with-agents)

Prefer one install for API MCP + docs search + skills? Use the [Assess Agent Plugin](https://github.com/praxicraft-platform/praxicraft-assess-agent-plugin).

## Table of Contents

- [Two ways to connect](#two-ways-to-connect)
- [Authentication](#authentication)
- [Quickstart](#quickstart)
  - [Hosted HTTP (Cursor / Claude Code)](#hosted-http-cursor--claude-code)
  - [Stdio (API key)](#stdio-api-key)
- [What agents can do](#what-agents-can-do)
- [Live vs Test mode](#live-vs-test-mode)
- [Errors](#errors)
- [Requirements & support](#requirements--support)
- [License](#license)

---

## Two ways to connect

| Mode | Best for | Auth |
|------|----------|------|
| **Hosted HTTP** | Interactive IDE sessions | Browser OAuth at `https://assess.praxicraft.com/mcp` (always **live**) |
| **Stdio** (`npx @praxicraft/assess-mcp`) | CI, locked-down machines, **Test** mode | `PRAXICRAFT_API_KEY` (`ct_live_…` or `ct_test_…`) |

Hosted OAuth is the easiest path in Cursor and Claude. Use stdio when you need a `ct_test_` key or a non-interactive environment.

---

## Authentication

### Hosted (OAuth)

No API key in your config. The first tool call opens a browser consent screen. Owners, admins, and [developers](https://docs.praxicraft.com/roles) can approve.

Hosted sessions are always **live** mode.

### Stdio (API key)

Create an organisation API key:

**Assess → Developer → API Keys** → create key → copy `ct_live_…` or `ct_test_…` (shown once).

```bash
export PRAXICRAFT_API_KEY="ct_test_xxxxxxxxxxxxxxxx"
# optional
export PRAXICRAFT_API_BASE_URL="https://assess.praxicraft.com"
```

Never commit API keys. Prefer environment variables or a secrets manager.

IP allowlists on API keys apply to Public API / stdio MCP requests. They do **not** apply to hosted OAuth. Use a dedicated key with an empty allowlist for stdio if other keys are CIDR-restricted.

Scopes and rotation: [Authentication](https://docs.praxicraft.com/authentication)

### Recommended scopes

| Flow | Scopes |
|------|--------|
| Invite + notify | `assessments:read`, `invitations:write`, `candidates:read`, `webhooks:write` |
| Pipelines | `pipelines:read`, `pipelines:write`, `webhooks:write` |
| Read-only | `assessments:read`, `candidates:read`, `organisation:read` |

---

## Quickstart

### Hosted HTTP (Cursor / Claude Code)

Add to your MCP settings:

```json
{
  "mcpServers": {
    "praxicraft-assess": {
      "url": "https://assess.praxicraft.com/mcp"
    }
  }
}
```

Claude Code example:

```json
{
  "mcpServers": {
    "praxicraft-assess": {
      "type": "http",
      "url": "https://assess.praxicraft.com/mcp"
    }
  }
}
```

Restart the client, then try: *“List my Assess assessments and invite me to the first active one.”*

### Stdio (API key)

```json
{
  "mcpServers": {
    "praxicraft-assess": {
      "command": "npx",
      "args": ["-y", "@praxicraft/assess-mcp"],
      "env": {
        "PRAXICRAFT_API_KEY": "ct_test_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

From source (contributors):

```bash
git clone https://github.com/praxicraft-platform/praxicraft-assess-mcp.git
cd praxicraft-assess-mcp
npm ci
npm test
npm run smoke
```

---

## What agents can do

Tools map to the Assess Public API (`/api/v1/public/…`). Coverage includes:

| Area | Examples |
|------|----------|
| Assessments | List, create, update, activate, attach cases |
| Invitations | Invite, bulk invite, remind, cancel |
| Results | List / retrieve by `invite_token` |
| Webhooks | Create destinations, test, list deliveries, retry |
| Pipelines | List, enroll, hold / unhold / reject |
| Interviews | List / manage interview rooms |
| Organisation | Profile, quota, squads, audit (plan-gated) |
| Integrations | Connector status (no secrets in responses) |

Responses are **flat JSON** (same shape as the Public API — no `{ "data": … }` wrapper).

Remind agents to respect [plan limits](https://docs.praxicraft.com/plan-limits) and to branch on `error.code`.

---

## Live vs Test mode

| | Live (`ct_live_…` / hosted OAuth) | Test (`ct_test_…` via stdio) |
|--|-----------------------------------|------------------------------|
| Data | Production org | Isolated test data |
| Webhooks | Live destinations only | Test destinations only |

A test `candidate.passed` never hits a live Slack or HTTPS destination. See [Live and Test mode](https://docs.praxicraft.com/authentication#live-and-test-mode).

---

## Errors

Public API errors look like:

```json
{ "error": { "code": "SOME_CODE", "message": "…", "details": {} } }
```

Always branch on `error.code`. Reference: [Errors](https://docs.praxicraft.com/errors)

---

## Requirements & support

- Node.js **18+** (stdio package)
- Assess plan that includes API keys (see [plan limits](https://docs.praxicraft.com/plan-limits))
- Product docs: [docs.praxicraft.com](https://docs.praxicraft.com)
- Agent Plugin (API + docs Knowledge MCP + skills): [praxicraft-assess-agent-plugin](https://github.com/praxicraft-platform/praxicraft-assess-agent-plugin)
- Issues: [GitHub Issues](https://github.com/praxicraft-platform/praxicraft-assess-mcp/issues)
- Email: [support@praxicraft.com](mailto:support@praxicraft.com)

Maintainers deploying the hosted `/mcp` service: see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## License

[MIT](LICENSE)
