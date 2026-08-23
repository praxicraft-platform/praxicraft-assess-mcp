# @praxicraft/assess-mcp

MCP server for the [Praxicraft Assess Public API](https://docs.praxicraft.com).

| Mode | Entry | Auth |
|------|--------|------|
| **Hosted HTTP** (production) | `https://assess.praxicraft.com/mcp` | Browser OAuth (always **live**) |
| **Stdio** (local / CI / Test) | `npx @praxicraft/assess-mcp` | `PRAXICRAFT_API_KEY` (`ct_live_` or `ct_test_`) |

Docs: [MCP](https://docs.praxicraft.com/assess-mcp) · [Build with agents](https://docs.praxicraft.com/build-with-agents) · [Agent Plugin](https://github.com/praxicraft-platform/praxicraft-assess-agent-plugin)

**Deploy / K8s:** see [DEPLOYMENT.md](./DEPLOYMENT.md) (Harbor image, `bureau` namespace, NetworkPolicy, OAuth URLs, sticky-session edge case).

## Install (stdio)

```bash
npx @praxicraft/assess-mcp
```

```bash
git clone https://github.com/praxicraft-platform/praxicraft-assess-mcp.git
cd praxicraft-assess-mcp
npm ci
npm test
npm run smoke
```

Environment:

- `PRAXICRAFT_API_KEY` — required for stdio
- `PRAXICRAFT_API_BASE_URL` — optional (default `https://assess.praxicraft.com`)

## Cursor / Claude

**Hosted (recommended):**

```json
{
  "mcpServers": {
    "praxicraft-assess-api": {
      "url": "https://assess.praxicraft.com/mcp"
    }
  }
}
```

**Stdio:**

```json
{
  "mcpServers": {
    "praxicraft-assess-api": {
      "command": "npx",
      "args": ["-y", "@praxicraft/assess-mcp"],
      "env": {
        "PRAXICRAFT_API_KEY": "ct_test_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

## License

MIT
