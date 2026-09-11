# syntax=docker/dockerfile:1
#
# Fangorn Market - single container that serves the React app AND the API on one
# origin. Node 24 for the built-in node:sqlite (no native build step).
FROM node:24-slim

# corepack activates the pnpm version pinned in package.json (packageManager).
RUN corepack enable
WORKDIR /app

# Copy the whole monorepo, then install ONLY the api + web workspaces and their
# dependencies (the "..." suffix pulls in db/shared/trading). This deliberately
# skips the heavier packages (x402pay/grove/services) and their native deps.
COPY . .
RUN pnpm install --filter "@fangorn-market/api..." --filter "@fangorn-market/web..." --frozen-lockfile

# Build the static frontend; the API serves it from apps/web/dist in production.
# Default network label can be overridden at build time.
ARG VITE_NETWORK_LABEL="Robinhood Chain · 46630"
RUN VITE_NETWORK_LABEL="$VITE_NETWORK_LABEL" pnpm -C apps/web build

EXPOSE 8080
# tsx runs the TS API directly; PORT/NODE_ENV come from fly.toml [env].
CMD ["pnpm", "-C", "apps/api", "start"]
