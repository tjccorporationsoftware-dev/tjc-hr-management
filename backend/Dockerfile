# =============================================================================
# Backend (NestJS + Prisma)
# =============================================================================
# สร้างเป็นหลายชั้นเพื่อไม่ให้ dev dependency และซอร์สโค้ดติดไปกับอิมเมจที่รันจริง
#
#   docker build -t hr-backend -f backend/Dockerfile backend
#
# หมายเหตุสำคัญ: ต้องมี Chromium ในอิมเมจ เพราะสลิปเงินเดือนและหนังสือรับรอง
# ออกเป็น PDF ด้วย Puppeteer ถ้าไม่มี จะพังตอนกดออกเอกสาร ไม่ใช่ตอนบูต
# จึงไม่มีอะไรเตือนจนกว่าจะมีคนใช้จริง

# --- ชั้นติดตั้ง dependency ----------------------------------------------------
FROM node:24-bookworm-slim AS deps

WORKDIR /app

# Prisma ต้องใช้ openssl ตอน generate
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ต้องตั้งตั้งแต่ชั้นนี้ ไม่ใช่แค่ชั้นที่รันจริง
#
# postinstall ของ puppeteer โหลด Chrome ~150MB ลงมาเองตอน `npm ci`
# ถ้าโหลดไม่สำเร็จ (เครือข่ายบล็อก หรือ storage.googleapis.com ล่ม) `npm ci` จะ exit 1
# ทำให้ build ทั้งอิมเมจล้ม — ทั้งที่เราไม่ได้ใช้ Chrome ตัวนั้นเลย
# เพราะชั้นที่รันจริงติดตั้ง chromium ของ Debian แล้วชี้ PUPPETEER_EXECUTABLE_PATH ไปหา
ENV PUPPETEER_SKIP_DOWNLOAD=true

# ค่าหลอกให้ `prisma generate` ผ่านตอน build เท่านั้น
#
# prisma.config.ts ประกาศ datasource ด้วย env("DATABASE_URL") ซึ่งโยน error ทันที
# ถ้าตัวแปรหายไป และ postinstall เรียก `prisma generate` ตอน `npm ci` พอดี
# ตอน build ไม่มี .env (อยู่ใน .dockerignore ถูกแล้ว ห้ามเอาค่าลับอบเข้าอิมเมจ)
# generate ใช้แค่สคีมา ไม่ได้ต่อฐานข้อมูลจริง ค่านี้จึงเป็นอะไรก็ได้
#
# ค่านี้อยู่แค่ชั้น deps/build ชั้นที่รันจริงเป็น FROM ใหม่ จึงไม่ติดไปกับอิมเมจปลายทาง
# ตอนรันจริงอ่าน DATABASE_URL จาก env_file ของ compose
ENV DATABASE_URL=postgresql://build-time-placeholder@127.0.0.1:5432/placeholder

# postinstall เรียก prisma generate จึงต้องมีสคีมาก่อน npm ci
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci


# --- ชั้นคอมไพล์ ---------------------------------------------------------------
FROM deps AS build

WORKDIR /app

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build \
  # ตัด dev dependency ออกหลังคอมไพล์เสร็จ เพื่อคัดลอกไปชั้นสุดท้ายได้เลย
  && npm prune --omit=dev


# --- ชั้นที่รันจริง ------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Bangkok \
    PORT=4000 \
    # ชี้ Puppeteer ไปที่ Chromium ของระบบ แทนการให้มันโหลดเองตอนติดตั้ง
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      tzdata \
      # Chromium + ฟอนต์ไทย — ไม่มีฟอนต์ไทย PDF จะออกมาเป็นกล่องสี่เหลี่ยม
      chromium \
      fonts-thai-tlwg \
      fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma

# งานตั้งเวลา (สำรองข้อมูล/ล้างไฟล์/ล้างบันทึก) เรียกสคริปต์ในโฟลเดอร์นี้ผ่าน npm run
# ถ้าไม่คัดลอกมา งานจะล้มทุกคืนโดยที่ระบบยังให้บริการได้ปกติ — สังเกตยาก
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json

# สคริปต์ล้างบันทึกตรวจสอบ import Prisma client จาก src/generated ตรง ๆ
# ตัวแอปที่คอมไพล์แล้วมีสำเนาของตัวเองอยู่ใน dist จึงบูตได้โดยไม่ต้องมีโฟลเดอร์นี้
# ขาดไปแล้ว `npm run cleanup:audit` จะพังทุกคืน โดยที่ระบบยังให้บริการปกติ
COPY --from=build /app/src/generated ./src/generated

# โฟลเดอร์ที่ต้อง mount เป็น volume เมื่อรันหลาย instance
# ไม่งั้นไฟล์ที่อัปโหลดผ่าน instance หนึ่งจะหาไม่เจอจากอีก instance
RUN mkdir -p uploads storage/exports storage/temp \
  && chown -R node:node /app

USER node

EXPOSE 4000

# ตรวจสุขภาพจากภายในคอนเทนเนอร์ — /api/health ตรวจฐานข้อมูลจริง ไม่ใช่ตอบ 200 เปล่า ๆ
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# ย้ำ: อิมเมจนี้ **ไม่** รัน migration ให้เอง เพราะถ้าหลาย instance บูตพร้อมกัน
# จะแย่งกันแก้สคีมา ให้สั่งครั้งเดียวจากภายนอกก่อนเปิดใช้ทุกครั้งที่ deploy:
#   docker compose -f docker-compose.prod.yml run --rm backend npm run db:migrate:deploy
# (prisma CLI ถูกย้ายไป dependencies แล้ว จึงยังอยู่ในอิมเมจหลัง npm prune)
CMD ["node", "dist/main"]
