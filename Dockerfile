# The audit worker: this same app, run on an always-on server with Chrome, answering only the long-job routes.
# See docs/WORKER.md. The dashboard itself goes on Vercel, not in this image.
FROM node:24-bookworm-slim

# Chrome for the crawler and Lighthouse, plus fonts so Arabic and emoji render in what it reads
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.8.1

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CHROME_NO_SANDBOX=true \
    WORKER_ONLY=true \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
# manifests first, so the dependency layer is cached until they change (postinstall runs `prisma generate`)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
# Build-time placeholders only: nothing connects during the build. The real values come from the platform's environment.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" JWT_SECRET="build-time-placeholder-not-a-real-secret-0000" pnpm build \
 && chown -R node:node /app/.next

USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "pnpm exec next start -H 0.0.0.0 -p ${PORT}"]
