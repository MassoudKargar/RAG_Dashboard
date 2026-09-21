# syntax=docker/dockerfile:1

# ---------- Stage 1: frontend build ----------
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: backend build ----------
FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Runtime artifacts only. No .env is ever copied into the image.
COPY --from=backend-build /app/backend/dist /app/backend/dist
COPY --from=backend-build /app/backend/node_modules /app/backend/node_modules
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
COPY sample-data /app/sample-data

# Sample data is read-only at runtime.
RUN adduser -D -u 10001 appuser \
  && mkdir -p /app/data \
  && chown -R appuser:appuser /app /app/data

USER appuser

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "backend/dist/server.js"]