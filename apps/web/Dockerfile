# Stage 1: Build Next.js web application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build --workspace=@savitools/web

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -s /bin/sh -D nextjs

COPY --from=builder /app/apps/web/public apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static apps/web/.next/static

USER nextjs

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
