/*
 * ตั้งเขตเวลาของกระบวนการก่อนโหลดอย่างอื่น
 *
 * คอนเทนเนอร์ Linux ส่วนใหญ่ไม่มี TZ จึงรันเป็น UTC ทำให้ log และค่าที่พึ่ง
 * เวลาเซิร์ฟเวอร์คลาดจากเวลาไทย 7 ชั่วโมง
 *
 * นี่เป็นเพียงชั้นป้องกันเสริม — โค้ดที่ตัดวันต้องใช้ common/utils/thai-date.util
 * ซึ่งระบุเขตเวลาเองเสมอ เพราะ worker/cron/เทส รันคนละกระบวนการกับตรงนี้
 */
process.env.TZ = process.env.TZ || 'Asia/Bangkok';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, text, urlencoded } from 'express';
import { isAbsolute, join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  /*
   * ให้ Nest ใช้ pino แทน logger ในตัว
   * bufferLogs: true ข้างบนทำให้ log ตอนบูตถูกเก็บไว้แล้วปล่อยออกมาผ่าน pino
   * ไม่งั้นบรรทัดแรก ๆ ตอนเริ่มระบบจะหลุดออกไปคนละรูปแบบกับที่เหลือ
   */
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const expressInstance = app.getHttpAdapter().getInstance();

  if (typeof expressInstance.disable === 'function') {
    expressInstance.disable('x-powered-by');
  }

  if (
    process.env.TRUST_PROXY === 'true' &&
    typeof expressInstance.set === 'function'
  ) {
    expressInstance.set('trust proxy', 1);
  }

  // /iclock/* คือช่องรับ push จากเครื่องสแกน (โปรโตคอล ADMS)
  // เครื่องกำหนด path เอง จึงต้องอยู่ root ไม่ใช่ใต้ /api
  app.setGlobalPrefix('api', {
    exclude: ['iclock/(.*)', 'iclock'],
  });

  const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
  const uploadRoot = isAbsolute(uploadDir)
    ? uploadDir
    : join(process.cwd(), uploadDir);

  // เปิด public สำหรับไฟล์รูปที่อนุญาตให้แสดงในหน้าเว็บเท่านั้น
  app.useStaticAssets(join(uploadRoot, 'avatars'), {
    prefix: '/uploads/avatars/',
  });

  app.useStaticAssets(join(uploadRoot, 'company-logos'), {
    prefix: '/uploads/company-logos/',
  });

  app.useStaticAssets(join(uploadRoot, 'branch-logos'), {
    prefix: '/uploads/branch-logos/',
  });

  const requestBodyLimit = process.env.REQUEST_BODY_LIMIT ?? '2mb';

  // เครื่องสแกนส่ง ATTLOG เป็น text คั่น tab — parse เป็น string ก่อนถึง controller
  app.use('/iclock', text({ type: () => true, limit: '5mb' }));

  app.use(json({ limit: requestBodyLimit }));
  app.use(
    urlencoded({
      extended: true,
      limit: requestBodyLimit,
    }),
  );

  app.use(requestIdMiddleware);

  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
      frameguard: {
        action: 'deny',
      },
      referrerPolicy: {
        policy: 'no-referrer',
      },
      hsts:
        process.env.NODE_ENV === 'production'
          ? {
              maxAge: 15552000,
              includeSubDomains: true,
              preload: false,
            }
          : false,
    }),
  );

  app.use(cookieParser());

  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      // Header ของ Native App (บทที่ 12.7) — บนเครื่องจริงไม่ผ่าน CORS จึงไม่เคยสะดุด
      // แต่ตอนเปิดแอปด้วย Expo web เพื่อดู UI จะติด preflight ถ้าไม่อนุญาตไว้
      // ทั้งหมดเป็น metadata เท่านั้น ตัวตนผู้ใช้ยังมาจาก Access Token เสมอ
      'Accept-Language',
      'Idempotency-Key',
      'X-App-Build',
      'X-App-Version',
      'X-Installation-Id',
      'X-OS-Version',
      'X-Platform',
    ],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);

  console.log(`HR Workforce API is running on http://localhost:${port}/api`);
  console.log(
    `Public avatars are served from http://localhost:${port}/uploads/avatars`,
  );
  console.log(
    `Public company logos are served from http://localhost:${port}/uploads/company-logos`,
  );
  console.log(
    `Public branch logos are served from http://localhost:${port}/uploads/branch-logos`,
  );
}

bootstrap();



