# syntax=docker/dockerfile:1.4
# Hosted Assess MCP (Streamable HTTP) — listens on PORT (default 8787) at /mcp
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787

RUN groupadd --system --gid 1001 mcp && \
    useradd --system --uid 1001 --gid mcp mcp

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY hosted-http.mjs ./

USER mcp
EXPOSE 8787

CMD ["node", "hosted-http.mjs"]
