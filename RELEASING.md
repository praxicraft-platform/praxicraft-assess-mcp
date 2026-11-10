# Releasing @praxicraft/assess-mcp

## npm (this repo)

1. Bump `"version"` in `package.json` (and `PACKAGE_VERSION` in `hosted-http.mjs` if not derived).
2. Push to `main`.
3. `Publish` workflow tags `v{version}` and runs `npm publish` when the tag is new.
4. Set **Settings → Secrets → Actions → `NPM_TOKEN`** (npm Automation token or granular with 2FA bypass for `@praxicraft/*`).

Publish the package from this repository only.

## Container release

Build the Dockerfile from the same tagged source as the package. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for public self-hosting guidance; hosted-service operations are documented privately.
