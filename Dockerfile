# ЛТС-ветка Node 22 на musl
FROM node:22-alpine AS base

# Увеличенные таймауты и ретраи для npm — меньше сбоев сети на CI/проде
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_network_timeout=600000

FROM base AS deps
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# оставляю как у вас
CMD tail -f /dev/null

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs \
    && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public

# Output traces для Next.js standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

USER nextjs
CMD ["node", "server.js"]
