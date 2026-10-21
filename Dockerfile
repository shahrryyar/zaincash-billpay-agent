# The hosted demo: web app + in-process mock wallet (synthetic data only). One image, one port.
#   docker build -t zc-billpay .
#   docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... zc-billpay        # real model (key from your host's secret store)
#   docker run -p 3000:3000 -e LLM_PROVIDER=fake zc-billpay            # scripted demo sentences, no key
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/wallet-api/package.json apps/wallet-api/
COPY packages/core/package.json packages/core/
COPY packages/llm/package.json packages/llm/
COPY packages/asr/package.json packages/asr/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY eval/package.json eval/
RUN pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @zc/web build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DEMO_MODE=1 LLM_MODE=tools
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/web
CMD ["node", "server.js"]
