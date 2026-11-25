# --- 1. Construction de l'interface (Node) ---
FROM node:22-slim AS web
WORKDIR /web
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/frontend/ ./
RUN npm run build

# --- 2. API Python + interface construite ---
FROM python:3.12-slim
ENV TZ=Europe/Paris PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY app/requirements.txt ./
RUN pip install -r requirements.txt
COPY app/*.py ./
COPY addon_start.py ./
COPY --from=web /web/dist /app/web
ENV FRONTEND_DIR=/app/web GARMIN_DB=/data/garmin_local.db GARMINTOKENS=/data/garth
EXPOSE 8000
CMD ["python", "addon_start.py"]
