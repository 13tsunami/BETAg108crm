# ЛТС-ветка Node 22 на musl
FROM node:22-alpine AS base

# Устойчивость сети для npm (ретраи/таймауты)
ENV npm_config_fetch_retries=6 \
    npm_config_fetch_retry_maxtimeout=240000 \
    npm_config_network_timeout=600000

FROM base AS deps
WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./

# Свежий npm внутри слоя deps (устойчивей postinstall @prisma/engines)
RUN npm i -g npm@11.6.2

# Повторяем npm ci до 3 раз с паузами
RUN (npm ci) || (sleep 5 && npm ci) || (sleep 15 && npm ci)

# Генерация клиента Prisma c ретраями (на случай сетевых обрывов CDN)
COPY prisma ./prisma
RUN (npx prisma generate) || (sleep 5 && npx prisma generate) || (sleep 15 && npx prisma generate)

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# как у вас
CMD tail -f /dev/null

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public

# Next.js standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

USER nextjs
CMD ["node", "server.js"]
