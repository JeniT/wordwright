# syntax=docker/dockerfile:1
#
# Two images from one file (see deploy/compose.yaml):
#   api  the Hono API, run from TypeScript with tsx (the workspace packages are TypeScript too)
#   web  Caddy serving the built web app, and sending /api to the api container
#
# Build from the repository root:  docker build --target api -t wordwright-api .

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# The pnpm version comes from "packageManager" in package.json.
RUN corepack enable
WORKDIR /app

# Everything, for the web build.
FROM base AS web-build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @wordwright/web build

# Only what the API needs at run time.
FROM base AS api-deps
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter @wordwright/api...

FROM node:24-slim AS api
LABEL org.opencontainers.image.source="https://github.com/JeniT/wordwright"
# TRUST_PROXY: the api is reached only through Caddy (deploy/compose.yaml), which writes the client's address.
ENV NODE_ENV=production \
    PORT=8787 \
    TRUST_PROXY=true \
    DATABASE_PATH=/data/wordwright.sqlite
WORKDIR /app
COPY --from=api-deps --chown=node:node /app /app
# The database lives on a volume mounted here; it must belong to the user the app runs as.
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/apps/api
EXPOSE 8787
CMD ["./node_modules/.bin/tsx", "src/server.ts"]

FROM caddy:2-alpine AS web
LABEL org.opencontainers.image.source="https://github.com/JeniT/wordwright"
COPY --from=web-build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
