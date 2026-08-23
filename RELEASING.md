# Releasing @praxicraft/assess-mcp

## npm (this repo)

1. Bump `"version"` in `package.json` (and `PACKAGE_VERSION` in `hosted-http.mjs` if not derived).
2. Push to `main`.
3. `Publish` workflow tags `v{version}` and runs `npm publish` when the tag is new.
4. Set **Settings → Secrets → Actions → `NPM_TOKEN`** (npm Automation token or granular with 2FA bypass for `@praxicraft/*`).

Do **not** publish from `Gamified-Application` — that workflow’s publish job is disabled.

## Container / K8s

Follow [DEPLOYMENT.md](./DEPLOYMENT.md): sync into monorepo `packages/assess-mcp`, then use the Assess deploy pipeline (staging k3s + Harbor + Kubernetes-infra).
