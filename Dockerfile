# Long-running agent service deployed to Railway. Bakes the parquet
# (~600 MB) into the image so DuckDB queries hit local files. The web
# app on Vercel posts to /investigate over HTTP/SSE.

FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Install workspace deps. We keep dev deps because the server runs TS
# directly via tsx (in agent's devDependencies). Avoids a separate build
# step at the cost of a slightly larger image.
COPY package.json package-lock.json ./
COPY agent/package.json ./agent/
COPY mcp/package.json ./mcp/
COPY web/package.json ./web/
RUN npm install --workspaces --include-workspace-root


FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Workspace deps are hoisted to the root node_modules/. The per-workspace
# node_modules dirs may or may not exist depending on npm's hoisting; we
# don't need them — `@txmoney/agent` and `@txmoney/mcp` resolve through
# root node_modules/@txmoney/ symlinks pointing back at agent/ and mcp/.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY agent/package.json ./agent/
COPY mcp/package.json ./mcp/
COPY web/package.json ./web/
COPY agent/src ./agent/src
COPY agent/tsconfig.json ./agent/
COPY mcp/src ./mcp/src
COPY mcp/tsconfig.json ./mcp/

# Bake parquet into the image. Local data/parquet/ MUST exist on the host
# at build time (.dockerignore allows it through). The build context is
# uploaded by `railway up` from the repo root, so the local 600 MB of
# parquet ends up here.
COPY data/parquet ./data/parquet

EXPOSE 8080

# tsx runs the TypeScript entry directly so we don't need a build step.
# Equivalent to `npm run serve --workspace=agent`.
CMD ["npx", "tsx", "agent/src/server.ts"]
