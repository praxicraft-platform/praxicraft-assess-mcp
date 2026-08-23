# Assess MCP — end-to-end deployment

This repo is the **canonical source** for `@praxicraft/assess-mcp` (stdio + hosted HTTP code + Dockerfile).

Production and staging **still build and roll the Harbor/k3s image from the web monorepo** (`packages/assess-mcp`) so Assess deploys stay atomic with backend/frontend. Treat the monorepo path as a **deploy mirror**: change here, sync into `Gamified-Application/packages/assess-mcp`, then ship via the normal Assess deploy pipeline.

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

Namespace: **`bureau`** (prod ArgoCD + staging k3s).

---

## Repos and ownership

| Piece | Owner today | Notes |
|-------|-------------|--------|
| Source + npm | **This repo** | Publish via `.github/workflows/publish.yml` |
| Docker image build + Harbor push | **Gamified-Application** `.github/workflows/deploy.yaml` | Context `./packages/assess-mcp` |
| Staging apply | **Gamified-Application** `k3s/staging/assess-mcp/` | Image `bureau/assess-mcp:<staging-version>` imported into k3s containerd |
| Prod manifests | **Kubernetes-infra** `gamified-application/assess-mcp/` | Image `164.68.119.226:30002/bureau/assess-mcp:<version>`; ArgoCD |
| Backend OAuth issuer | Django in monorepo | `MCP_OAUTH_ISSUER`, `MCP_OAUTH_AUDIENCE` must match ConfigMap |

Do **not** npm-publish from the monorepo once this repo owns releases (monorepo `publish-assess-mcp.yml` is disabled for publish).

---

## Workload (both envs)

| Resource | Name |
|----------|------|
| Deployment | `bureau-assess-mcp` |
| Service | `bureau-assess-mcp` (ClusterIP `80` → `8787`) |
| ConfigMap | `assess-mcp-config` |
| NetworkPolicy | `assess-mcp-network-policy` |
| Container command | `node hosted-http.mjs` |
| Probes | `GET /healthz` on port `http` |
| Security | non-root `1001`, read-only root FS, `/tmp` emptyDir |

### ConfigMap (must stay aligned with backend)

**Prod** (`Kubernetes-infra/.../configmaps/assess-mcp-config.yaml`):

| Key | Value |
|-----|--------|
| `PORT` | `8787` |
| `PRAXICRAFT_API_BASE_URL` | `http://bureau-backend` |
| `MCP_RESOURCE_SERVER_URL` | `https://assess.praxicraft.com/mcp` |
| `MCP_OAUTH_ISSUER` | `https://assess.praxicraft.com/api/v1/mcp/oauth` |
| `MCP_SERVICE_DOCUMENTATION_URL` | `https://docs.praxicraft.com/assess-mcp` |

**Staging** (`k3s/staging/configmaps/assess-mcp-config.yaml`): same shape with `https://staging.praxicraft.com/...` for resource + issuer.

Backend ConfigMap must set:

- `MCP_OAUTH_ISSUER` = same issuer URL as above  
- `MCP_OAUTH_AUDIENCE` = same as `MCP_RESOURCE_SERVER_URL`  

Mismatch → OAuth clients fail with invalid audience / metadata.

---

## Ingress (edge cases)

On the Assess host, these paths go to **`bureau-assess-mcp`**, not the Next frontend:

- `/mcp` (Prefix)
- `/.well-known/oauth-protected-resource` (Prefix)
- `/.well-known/oauth-authorization-server` (Prefix)

**Do not** route `/.well-known/acme-challenge` to MCP (TLS renewals). Keep ACME on the cert controller / nginx.

Host nginx must forward Assess host traffic to Traefik including `/mcp` (see `Kubernetes-infra/nginx/bureau.conf`).

---

## NetworkPolicy

`assess-mcp-networkpolicy.yaml`:

- **Ingress:** TCP `8787` (Traefik + kubelet probes)
- **Egress:** DNS + **only** pods `app.kubernetes.io/name=bureau-backend` on TCP **8000** (pod targetPort; Service is `:80` → `:8000`)

If MCP cannot reach the API: check Calico/Cilium is enforcing, backend labels match, and `PRAXICRAFT_API_BASE_URL` is the in-cluster Service name (not the public HTTPS URL from inside the pod unless you also allow egress to the internet — today you must not).

---

## Stateful sessions (scale edge case)

`hosted-http.mjs` keeps Streamable HTTP transports in an **in-memory `Map`**. Comment in code: reusing one transport breaks reconnects (`Server already initialized`).

| Rule | Why |
|------|-----|
| Keep **`replicas: 1`** unless you add session affinity + shared session store | Cursor reconnects must hit the same pod |
| RollingUpdate `maxUnavailable: 0` | Avoid dropping the only ready pod during surge |
| Do not put MCP behind a multi-replica Deployment without sticky sessions | Clients will get 4xx on session resume |

---

## Image pipeline (today)

### Staging (k3s)

1. Push to monorepo triggers deploy workflow (paths include `packages/assess-mcp/**`).
2. Build: `docker build -f packages/assess-mcp/Dockerfile -t bureau/assess-mcp:$VER ./packages/assess-mcp`
3. `k3s ctr images import`
4. `kubectl apply -R -f k3s/staging` in namespace `bureau`
5. Deployment rolls because image tag changes each run

### Production (Harbor + Kubernetes-infra)

1. Same monorepo deploy job builds/pushes `…/bureau/assess-mcp:$VER` and `:latest`
2. Manifests repo (`MANIFESTS_REPO` / Kubernetes-infra) image tags updated by sed for `assess-mcp`
3. ArgoCD syncs `gamified-application/` into `bureau`

### Local image

```bash
docker build -f Dockerfile -t bureau/assess-mcp:local .
# staging-style: import into k3s or retag for Harbor
```

---

## Sync checklist (change MCP code)

1. Edit/test in **this** repo (`npm test`, `npm run smoke`).
2. Copy tree into `Gamified-Application/packages/assess-mcp` (keep Dockerfile/hosted-http/src/package files identical).
3. Open PR on monorepo → staging deploy builds image + applies `k3s/staging`.
4. Merge to `main` → Harbor push + Kubernetes-infra tag bump + ArgoCD.
5. Bump `package.json` version here → npm publish workflow (secret `NPM_TOKEN`).

Optional helper:

```bash
rsync -a --delete \
  --exclude node_modules --exclude dist --exclude .git --exclude .github \
  ~/Desktop/praxicraft-assess-mcp/ \
  ~/Desktop/Gamified-Application/packages/assess-mcp/
```

---

## Runtime edge cases

| Issue | Cause / fix |
|-------|-------------|
| Hosted MCP always live | By design; use stdio + `ct_test_` for Test mode |
| API key IP allowlist ignored on hosted OAuth | Hosted clients have no stable IP; stdio keys still honor CIDR |
| Browser navigation to `/mcp` | Hosted handler may return HTML docs redirect; agents must use MCP client |
| `PRAXICRAFT_API_KEY` in ConfigMap | Not required for hosted OAuth; tools use caller token. Optional fallback only |
| readOnlyRootFilesystem | Needs `/tmp` emptyDir (already in Deployment) |
| OAuth well-known 404 | Ingress path missing or nginx not forwarding Assess host |
| Introspect failures | Backend down / NetworkPolicy / wrong `PRAXICRAFT_API_BASE_URL` |
| Dual npm publish | Publish **only** from this repo |

---

## Phase 2 (optional later)

- Build/push `bureau/assess-mcp` from this repo’s CI (Harbor credentials as secrets).
- Monorepo deploy consumes the prebuilt tag or submodules this repo.
- Until then, **do not** remove `packages/assess-mcp` from the monorepo or Assess staging/prod deploys will break.
