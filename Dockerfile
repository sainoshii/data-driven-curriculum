FROM node:26-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN VITE_PUBLIC_DEMO=true npm run build

FROM python:3.14-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    CURRICULUM_PUBLIC_DEMO=1 CURRICULUM_FRONTEND_DIR=/app/frontend/dist
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && useradd --system --uid 10001 demo \
    && mkdir /app/data \
    && chown demo /app/data
COPY backend/ ./backend/
COPY scripts/generate_demo_data.py ./scripts/generate_demo_data.py
COPY --from=frontend /build/dist ./frontend/dist/
USER demo
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port \"${PORT:-8080}\""]
