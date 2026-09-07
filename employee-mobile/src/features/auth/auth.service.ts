import type { ZodType } from 'zod';

import { disablePush } from '@/features/notifications/push';
import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { captureEvent } from '@/lib/monitoring/monitoring';
import { queryClient } from '@/providers/query-provider';
import {
  clearSessionSecrets,
  getOrCreateInstallationId,
  getSecureValue,
  setSecureValue,
} from '@/lib/storage/secure-storage';
import { storageKeys } from '@/lib/storage/storage-keys';

import { useAuthStore } from './auth.store';
import { hasPinFor, resetPinAttempts } from './pin';
import {
  authenticatedSessionSchema,
  loginResultSchema,
  type AuthenticatedSession,
  type LoginCredentials,
  type LoginResult,
} from './auth.types';
import { buildInstallationPayload } from './installation';

/** response ที่ผิดรูปต้องกลายเป็น ApiError ไม่ใช่ crash กลางหน้าจอ */
function parseOrThrow<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

async function persistSession(session: AuthenticatedSession) {
  // refresh token อยู่ใน SecureStore เท่านั้น ห้ามลง AsyncStorage หรือ log (บทที่ 15.2)
  await setSecureValue(storageKeys.refreshToken, session.refreshToken);

  useAuthStore.getState().markAuthenticated({
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    sessionId: session.session.id,
    user: session.user,
  });

  return session;
}

/**
 * หลังผ่านด่านอีเมล/รหัสผ่าน (หรือ 2FA) แล้ว ไม่ต้องถาม PIN ซ้ำในรอบเดียวกัน
 * — ผู้ใช้เพิ่งพิสูจน์ตัวตนด้วยของที่แข็งแรงกว่า PIN ไปแล้วเมื่อกี้
 *
 * แต่ยังต้องอ่านว่าเครื่องนี้มี PIN ของเขาอยู่ไหม เพื่อให้ตัวจัดเส้นทางรู้ว่า
 * ควรพาไปหน้าตั้ง PIN หรือเข้าแอปได้เลย
 */
async function adoptPinState(userId: string) {
  const exists = await hasPinFor(userId);

  /*
   * ล้างตัวนับที่ใส่ผิดทุกครั้งที่ล็อกอินสำเร็จ
   *
   * ถ้าไม่ล้าง คนที่เคยใส่ PIN ผิดจนถูกเด้งออกจะกลับเข้ามาพร้อมตัวนับที่เต็ม
   * แล้วพลาดครั้งเดียวก็โดนเด้งซ้ำทันที — ทั้งที่เพิ่งพิสูจน์ตัวตนด้วยอีเมล
   * และรหัสผ่านซึ่งแข็งแรงกว่า PIN ไปแล้วเมื่อกี้
   */
  await resetPinAttempts();

  useAuthStore.getState().setHasPin(exists);
  useAuthStore.getState().unlock();
}

export async function login(
  credentials: LoginCredentials,
): Promise<LoginResult> {
  const installation = await buildInstallationPayload();

  const payload = await apiClient.post<unknown>(
    '/mobile/v1/auth/login',
    {
      email: credentials.email.trim(),
      password: credentials.password,
      installation,
    },
    { allowRefresh: false, auth: false },
  );

  const result = parseOrThrow(loginResultSchema, payload);

  if (result.requiresTwoFactor) {
    useAuthStore.getState().markTwoFactorRequired({
      expiresAt: result.expiresAt,
      twoFactorToken: result.twoFactorToken,
    });

    return result;
  }

  await persistSession(result);
  await adoptPinState(result.user.id);
  captureEvent({ level: 'info', message: 'login_success' });

  return result;
}

export async function verifyTwoFactor(code: string) {
  const twoFactorToken = useAuthStore.getState().twoFactorToken;

  if (!twoFactorToken) {
    throw ApiError.invalidRequest(
      'เซสชันยืนยันตัวตนหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    );
  }

  const installation = await buildInstallationPayload();

  const payload = await apiClient.post<unknown>(
    '/mobile/v1/auth/2fa/verify',
    { twoFactorToken, code: code.trim(), installation },
    { allowRefresh: false, auth: false },
  );

  const session = parseOrThrow(authenticatedSessionSchema, payload);

  await persistSession(session);
  await adoptPinState(session.user.id);
  captureEvent({ level: 'info', message: 'two_factor_verified' });

  return session;
}

/**
 * ต่ออายุ session — ถูกเรียกจากสองที่
 *   1) ตอนเปิดแอป เพื่อกู้ session เดิม
 *   2) จาก API client เมื่อเจอ 401 (ผ่าน refresh mutex ไม่ให้ยิงซ้อนกัน)
 *
 * คืน null = ไม่มี refresh token ในเครื่อง ถือว่ายังไม่ได้เข้าสู่ระบบ
 * throw    = refresh token ใช้ไม่ได้แล้ว ผู้เรียกต้องล้าง session ทิ้ง
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getSecureValue(storageKeys.refreshToken);

  if (!refreshToken) {
    return null;
  }

  const installationId = await getOrCreateInstallationId();

  const payload = await apiClient.post<unknown>(
    '/mobile/v1/auth/refresh',
    { refreshToken, installationId },
    { allowRefresh: false, auth: false },
  );

  const session = parseOrThrow(authenticatedSessionSchema, payload);

  await persistSession(session);

  return session.accessToken;
}

export async function logout() {
  const refreshToken = await getSecureValue(storageKeys.refreshToken);
  const installationId = await getOrCreateInstallationId();

  /*
   * ถอน push token ก่อนปิด session — ต้องทำตอนที่ยังมี access token อยู่
   * บนเครื่องที่ใช้ร่วมกัน ถ้าไม่ถอน คนถัดไปที่ล็อกอินจะได้รับแจ้งเตือน
   * ของคนก่อนหน้า ซึ่งมีชื่อพนักงานและเรื่องที่ยื่นติดไปด้วย
   */
  await disablePush();

  try {
    await apiClient.post(
      '/mobile/v1/auth/logout',
      { installationId, ...(refreshToken ? { refreshToken } : {}) },
      { allowRefresh: false },
    );
  } catch (error) {
    // ในมุมผู้ใช้ การออกจากระบบต้องสำเร็จเสมอ แม้เน็ตหลุดหรือ token หมดอายุไปแล้ว
    captureEvent({
      context: { code: error instanceof ApiError ? error.code : 'UNKNOWN' },
      level: 'warning',
      message: 'logout_remote_failed',
    });
  }

  await clearLocalSession();
}

/**
 * เปลี่ยนรหัสผ่านของตัวเอง
 *
 * ใช้ endpoint กลางร่วมกับเว็บ (/auth/change-password) ไม่ทำของมือถือแยก
 * เพราะกติกาความแข็งแรงของรหัสและการปลดธง mustChangePassword
 * ต้องเป็นชุดเดียวกันทั้งสองช่องทาง
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  await apiClient.post('/auth/change-password', input);
}

/**
 * ล้าง session ในเครื่อง — **ไม่แตะ PIN ที่ผู้ใช้ตั้งไว้**
 *
 * เดิมล้าง PIN ทิ้งด้วยทุกครั้ง ผลคือคนที่ออกจากระบบเองหรือโดนเด้งเพราะ token
 * หมดอายุ ต้องมาตั้ง PIN ใหม่ทุกรอบที่ล็อกอิน ทั้งที่เพิ่งตั้งไปเมื่อวาน
 *
 * ที่เคยกลัวคือเครื่องใช้ร่วมกันแล้ว PIN ของคนก่อนค้างขวางคนใหม่ — ซึ่งกันด้วย
 * การผูก PIN กับ userId อยู่แล้ว (`hasPinFor` / `verifyPin` เช็คเจ้าของก่อนเสมอ)
 * คนใหม่จึงถูกพาไปตั้งของตัวเองอัตโนมัติ ไม่ต้องล้างที่นี่
 *
 * เคสที่ต้องล้างจริงคือ "ลืมรหัส PIN" กับ "ใส่ผิดครบเพดาน" ซึ่งสองจอนั้น
 * เรียก `clearPin()` เองก่อนออกจากระบบ
 */
export async function clearLocalSession(message?: string | null) {
  await clearSessionSecrets();
  useAuthStore.getState().markUnauthenticated(message);

  /*
   * ล้างคำตอบที่แคชไว้ทั้งหมด — **ต้องอยู่ตรงนี้ ไม่ใช่ที่ปุ่มออกจากระบบ**
   * เพราะ session จบได้หลายทาง (กดออกเอง, refresh token หมดอายุ, ถูกเตะออก)
   *
   * query key ของแอปไม่มี user id อยู่ในนั้น ถ้าไม่ล้าง เครื่องที่สลับบัญชี
   * โดยไม่ปิดแอปจะเห็นข้อมูลของคนก่อนหน้าค้างอยู่จนกว่า staleTime ของแต่ละ
   * key จะหมด — ซึ่งบางตัวยาว 10 นาที (เช่นปีภาษี 50 ทวิ) และไม่ใช่แค่
   * "แสดงผิด" แต่เป็นข้อมูลเงินเดือนของคนอื่นโผล่ให้อีกคนเห็น
   */
  queryClient.clear();
}
