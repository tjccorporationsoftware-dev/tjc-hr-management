# =============================================================================
# Frontend (Next.js)
# =============================================================================
#   docker build -t hr-frontend -f frontend/Dockerfile frontend
#
# ใช้ output: "standalone" (ตั้งไว้ใน next.config.ts) เพื่อให้อิมเมจที่รันจริง
# ไม่ต้องมี node_modules ทั้งก้อน

# --- ชั้นติดตั้ง dependency ----------------------------------------------------
FROM node:24-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


# --- ชั้นคอมไพล์ ---------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ที่อยู่ API ถูกฝังลงบันเดิลตอน build จึงต้องส่งเข้ามาตั้งแต่ตอนนี้
# เปลี่ยนทีหลังตอนรันไม่ได้ ต้อง build ใหม่
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# --- ชั้นที่รันจริง ------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Bangkok \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# standalone รวมเฉพาะ dependency ที่ใช้จริงมาให้แล้ว
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
