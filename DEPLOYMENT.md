# Hosting Assess MCP

Use the hosted service at `https://assess.praxicraft.com/mcp` or run the published package locally as described in [README.md](README.md).

For self-hosting, build the image from this repository:

```sh
docker build -f Dockerfile -t assess-mcp:local .
```

Configure the Public API URL and OAuth issuer/audience for your own environment. Keep backend credentials in a secret manager, run the container as a non-root user, and use HTTPS at your edge. Do not publish internal service URLs, cluster identities, network rules, or credentials.

The hosted transport keeps sessions in memory. Multiple replicas require routing that preserves those sessions or a shared session implementation.

Operator-specific deployment procedures are maintained privately.
