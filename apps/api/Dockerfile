# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for monorepo
COPY package.json package-lock.json turbo.json ./

# Copy api package files
COPY apps/api/package.json apps/api/

# Install all dependencies
RUN npm ci

# Copy source files
COPY apps/api apps/api

# Build the API
RUN npm run build --workspace=@savitools/api

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and production dependencies
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
USER nestjs

EXPOSE 3001

CMD ["node", "dist/main.js"]
