# Long-running agent service deployed to Railway. Fetches the parquet
# (~600 MB unpacked) from a GitHub Release at build time so DuckDB
# queries hit local files. The web app on Vercel posts to /investigate
# over HTTP/SSE.
#
# To bump the parquet, upload a new tarball to a new release tag and
# update PARQUET_RELEASE_TAG below.

ARG PARQUET_RELEASE_TAG=parquet-v1
ARG PARQUET_REPO=jnoble157/follow-the-money

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

# Pull parquet from a public GitHub Release. The arg-rebinding here is
# the standard Docker pattern: ARG FOO is consumed inside this stage.
ARG PARQUET_RELEASE_TAG
ARG PARQUET_REPO
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p data \
    && echo "fetching parquet from ${PARQUET_REPO}@${PARQUET_RELEASE_TAG}" \
    && curl --fail --location --silent --show-error \
       "https://github.com/${PARQUET_REPO}/releases/download/${PARQUET_RELEASE_TAG}/parquet.tar.gz" \
       | tar -xz -C data \
    && du -sh data/parquet \
    && apt-get -y purge curl ca-certificates && apt-get -y autoremove

EXPOSE 8080

# tsx runs the TypeScript entry directly so we don't need a build step.
# Equivalent to `npm run serve --workspace=agent`.
CMD ["npx", "tsx", "agent/src/server.ts"]
