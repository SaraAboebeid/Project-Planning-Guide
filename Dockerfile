# syntax=docker/dockerfile:1.7

# ──────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the Vite/React frontend
# ──────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first (better layer caching)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy frontend source and the standalone 3D map (referenced at build time
# only by Vite dev middleware — safe to include).
COPY frontend/ ./
COPY assets/gothenburg_3d.html /app/assets/gothenburg_3d.html

RUN npm run build

# ──────────────────────────────────────────────────────────────────────────
# Stage 2 — Python runtime serving FastAPI + the built SPA + the 3D map
# ──────────────────────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Minimal system deps (curl for healthcheck; build tools only if a wheel is missing)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Python deps — only the FastAPI backend needs them
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt python-dotenv requests

# Application code
COPY backend/ ./backend/
COPY utils/   ./utils/
COPY config/  ./config/

# Static asset(s) served by FastAPI
COPY assets/gothenburg_3d.html ./assets/gothenburg_3d.html

# Built SPA from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Optional: bake a minimal buildings.json if you want the API to work without volumes.
# (Mount the real one via docker-compose for the full dataset.)
COPY frontend/public/buildings.json ./frontend/public/buildings.json

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
