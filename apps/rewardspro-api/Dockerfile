# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/rewardspro-api/package.json apps/rewardspro-api/package.json
RUN pnpm install --frozen-lockfile --filter @cambridge-tcg/rewardspro-api...

FROM dependencies AS build
COPY apps/rewardspro-api/certs apps/rewardspro-api/certs
COPY apps/rewardspro-api/tsconfig.json apps/rewardspro-api/tsconfig.json
COPY apps/rewardspro-api/src apps/rewardspro-api/src
COPY apps/rewardspro-api/migrations apps/rewardspro-api/migrations
RUN pnpm --filter @cambridge-tcg/rewardspro-api build
RUN pnpm --filter @cambridge-tcg/rewardspro-api deploy --prod /prod/rewardspro-api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /prod/rewardspro-api/package.json ./package.json
COPY --from=build --chown=node:node /prod/rewardspro-api/node_modules ./node_modules
COPY --from=build --chown=node:node /prod/rewardspro-api/certs ./certs
COPY --from=build --chown=node:node /prod/rewardspro-api/dist ./dist
COPY --from=build --chown=node:node /prod/rewardspro-api/migrations ./migrations
RUN printf '%s  %s\n' \
  '17c557502061c4879b844fff983288a2fb07d520f4cf2a5de60f5cda800a4494' \
  '/app/certs/eu-west-2-bundle.pem' \
  | sha256sum --check --strict - \
  && node -e "const fs = require('node:fs'); const tls = require('node:tls'); const ca = fs.readFileSync('/app/certs/eu-west-2-bundle.pem', 'utf8'); tls.createSecureContext({ ca });"
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/health/live`).then((response) => { if (response.status !== 200) process.exit(1); }).catch(() => process.exit(1))"]
CMD ["node", "dist/main.js"]
