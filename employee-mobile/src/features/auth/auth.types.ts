import { z } from 'zod';

export type AuthStatus =
  | 'restoring'
  | 'unauthenticated'
  | 'two-factor-required'
  | 'authenticated';

export const mobileUserSchema = z.object({
  avatarUrl: z.string().nullish(),
  displayName: z.string(),
  email: z.string(),
  id: z.string().min(1),
  /*
   * บัญชีที่ HR เพิ่งสร้างให้ใช้รหัสชั่วคราว ต้องบังคับตั้งใหม่ก่อนเข้าแอป
   * default false เพื่อให้แอปรุ่นนี้ยังคุยกับ backend รุ่นเก่าที่ไม่ส่งค่านี้ได้
   */
  mustChangePassword: z.boolean().default(false),
});

export type MobileUser = z.infer<typeof mobileUserSchema>;

/** ผลลัพธ์ตอนบัญชีนั้นต้องยืนยัน 2FA ก่อน */
export const twoFactorChallengeSchema = z.object({
  requiresTwoFactor: z.literal(true),
  twoFactorToken: z.string().min(1),
  expiresAt: z.coerce.date(),
  /** มีเฉพาะตอน dev — production ต้องไม่มี field นี้ (BE-MOB-002) */
  debugTwoFactorCode: z.string().optional(),
});

export type TwoFactorChallenge = z.infer<typeof twoFactorChallengeSchema>;

export const authenticatedSessionSchema = z.object({
  requiresTwoFactor: z.literal(false),
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.coerce.date().nullable(),
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: z.coerce.date(),
  tokenType: z.string(),
  session: z.object({
    id: z.string(),
    installationId: z.string(),
  }),
  user: mobileUserSchema,
});

export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;

/** login คืนได้สองแบบ ต้องแยกด้วย requiresTwoFactor ก่อนใช้งานเสมอ */
export const loginResultSchema = z.discriminatedUnion('requiresTwoFactor', [
  twoFactorChallengeSchema,
  authenticatedSessionSchema,
]);

export type LoginResult = z.infer<typeof loginResultSchema>;

export interface LoginCredentials {
  email: string;
  password: string;
}
