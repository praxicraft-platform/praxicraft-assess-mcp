# Assess MCP — end-to-end deployment

This repo is the **only source** for `@praxicraft/assess-mcp` (stdio + hosted HTTP + Dockerfile + npm).

Assess **staging/prod** still roll the container image through the web monorepo’s `deploy.yaml`, which **clones this repo** at the ref in `Gamified-Application/deploy/assess-mcp-ref` (for example `v0.2.5`), builds `bureau/assess-mcp`, and applies manifests in namespace **`bureau`**.

```
Internet HTTPS
  → host nginx (TLS) → Traefik :30080
  → Ingress host assess.praxicraft.com (prod) / staging.praxicraft.com (staging)
       /mcp + /.well-known/oauth-*  → Service bureau-assess-mcp:80 → pod :8787
       /api/v1                      → bureau-backend
  → pod assess-mcp
       PRAXICRAFT_API_BASE_URL=http://bureau-backend  (in-cluster)
       introspects OAuth at /api/v1/mcp/oauth/introspect/
       calls Public API with the caller’s access token
```

---

## Repos and ownership

| Piece | Owner |
|-------|--------|
| Source + Dockerfile + npm | **This repo** |
| Image build (Harbor / k3s import) | **Gamified-Application** `.github/workflows/deploy.yaml` (clones this repo) |
| Pin which MCP git ref to build | `Gamified-Application/deploy/assess-mcp-ref` |
| Staging manifests | `Gamified-Application/k3s/staging/assess-mcp/` |
| Prod manifests | **Kubernetes-infra** `gamified-application/assess-mcp/` (ArgoCD) |
| Backend OAuth issuer | Django — `MCP_OAUTH_ISSUER` / `MCP_OAUTH_AUDIENCE` must match ConfigMap |

---

## Release flow

1. Bump `package.json` / `PACKAGE_VERSION` in this repo → merge to `main`.
2. CI publishes npm when tag `v{version}` is new (`NPM_TOKEN` secret).
3. Create/push git tag `v{version}` (publish workflow does this) **or** set `deploy/assess-mcp-ref` to `main`.
4. Set `Gamified-Application/deploy/assess-mcp-ref` to that tag (e.g. `v0.2.5`).
5. Merge/deploy the web monorepo (or `workflow_dispatch` Deploy) → Harbor + k3s/Argo roll `bureau-assess-mcp`.

Do not put application source back under `packages/assess-mcp` in the web monorepo.

---

## Workload (both envs)

| Resource | Name |
|----------|------|
| Deployment | `bureau-assess-mcp` |
| Service | `bureau-assess-mcp` (ClusterIP `80` → `8787`) |
| ConfigMap | `assess-mcp-config` |
| NetworkPolicy | `assess-mcp-network-policy` |
| Command | `node hosted-http.mjs` |
| Probes | `GET /healthz` |
| Security | non-root `1001`, read-only root FS, `/tmp` emptyDir |

### ConfigMap ↔ backend

**Prod:** resource `https://assess.praxicraft.com/mcp`, issuer `https://assess.praxicraft.com/api/v1/mcp/oauth`, API base `http://bureau-backend`.

**Staging:** same with `https://staging.praxicraft.com/...`.

Backend `MCP_OAUTH_AUDIENCE` must equal `MCP_RESOURCE_SERVER_URL`.

---

## Ingress / NetworkPolicy / scale

- Ingress paths on the Assess host: `/mcp`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` → MCP. Do not steal ACME `/.well-known/acme-challenge`.
- NetworkPolicy: ingress TCP `8787`; egress DNS + `bureau-backend` pods on TCP `8000` only.
- Keep **`replicas: 1`** — Streamable HTTP sessions are in-memory (`hosted-http.mjs`). Multi-replica needs sticky sessions + shared store.

---

## Runtime edge cases

| Issue | Fix |
|-------|-----|
| Hosted MCP always live | Use stdio + `ct_test_` for Test mode |
| IP allowlist ignored on hosted OAuth | Expected; empty allowlist for stdio MCP keys |
| OAuth / introspect failures | Align ConfigMap with backend; check NetworkPolicy |
| npm `E403` previously published version | Bump version before publish |
| Image not updating | Bump `deploy/assess-mcp-ref` and re-run Deploy |

---

## Local image

```bash
docker build -f Dockerfile -t bureau/assess-mcp:local .
```
