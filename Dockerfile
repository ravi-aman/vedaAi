# VedaAI — Next.js + PaddleOCR on EC2 (ap-south-1)
# Multi-stage: deps -> builder -> runner (node:20 + python 3.11 for PaddleOCR)
FROM node:20-bookworm-slim AS base
WORKDIR /app

# System deps for canvas, mupdf, paddle (runtime)
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    build-essential \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    libgl1 libglib2.0-0 \
    git curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements-worker.txt ./requirements-worker.txt
COPY scripts/paddle_ocr_worker.py ./scripts/paddle_ocr_worker.py
RUN pip3 install --no-cache-dir --break-system-packages -r requirements-worker.txt || pip3 install --no-cache-dir --break-system-packages paddleocr paddlex paddlepaddle pillow psutil mupdf

# Node deps
COPY package*.json ./
RUN npm ci || npm install

# Build stage
COPY . .
RUN npm run build

# Runner stage — production
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PROCESSING_BACKEND=local
ENV PORT=3000

RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    libgl1 libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=base /usr/local/lib/python3.11/dist-packages /usr/local/lib/python3.11/dist-packages
COPY --from=base /usr/local/bin /usr/local/bin
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package*.json ./
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/next.config.ts ./next.config.ts
COPY --from=base /app/src ./src
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/requirements-worker.txt ./requirements-worker.txt

EXPOSE 3000
CMD ["npm", "start"]
