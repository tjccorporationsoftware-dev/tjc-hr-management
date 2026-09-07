import { create } from 'zustand';

import type { AuthStatus, MobileUser } from './auth.types';

interface AuthState {
  /** access token อยู่ใน memory เท่านั้น ห้าม persist ลงดิสก์ (บทที่ 15.1) */
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  /**
   * เครื่องนี้ตั้ง PIN ให้ผู้ใช้คนปัจจุบันแล้วหรือยัง
   * null = ยังไม่ได้ตรวจ — จอ index ต้องรออยู่ที่หน้าโหลด ห้ามเดาว่าไม่มี
   */
  hasPin: boolean | null;
  /**
   * true = ต้องใส่ PIN ก่อนถึงจะเข้าแอปได้
   *
   * ค่าเริ่มต้นเป็น true โดยตั้งใจ — ระหว่างที่กู้ session ยังไม่รู้ว่าตั้ง PIN ไว้ไหม
   * ถ้าเริ่มที่ false จะมีจังหวะที่ status เป็น authenticated แล้วแต่ยังไม่ทันล็อก
   * ทำให้เนื้อหาแวบขึ้นมาให้เห็นก่อนถูกเด้งไปหน้าใส่ PIN
   */
  locked: boolean;
  sessionError: string | null;
  sessionId: string | null;
  status: AuthStatus;
  twoFactorExpiresAt: Date | null;
  twoFactorToken: string | null;
  user: MobileUser | null;

  beginRestoring: () => void;
  markAuthenticated: (input: {
    accessToken: string;
    accessTokenExpiresAt?: Date | null;
    sessionId?: string | null;
    user: MobileUser;
  }) => void;
  markTwoFactorRequired: (input: {
    expiresAt: Date;
    twoFactorToken: string;
  }) => void;
  markUnauthenticated: (message?: string | null) => void;
  /** ล็อกแอปไว้รอ PIN — ใช้ตอนเปิดแอปใหม่และตอนกลับมาจากพื้นหลังนาน ๆ */
  lock: () => void;
  unlock: () => void;
  setHasPin: (hasPin: boolean) => void;
  /** ปลดธงบังคับเปลี่ยนรหัส หลังตั้งรหัสใหม่สำเร็จ */
  markPasswordChanged: () => void;
  setAccessToken: (accessToken: string | null) => void;
  updateUser: (patch: Partial<Pick<MobileUser, 'avatarUrl' | 'displayName'>>) => void;
}

const clearedState = {
  accessToken: null,
  accessTokenExpiresAt: null,
  hasPin: null,
  /* ออกจากระบบแล้วไม่ต้องล็อก — ด่านถัดไปคืออีเมลกับรหัสผ่านอยู่แล้ว */
  locked: false,
  sessionId: null,
  twoFactorExpiresAt: null,
  twoFactorToken: null,
  user: null,
} as const;

export const useAuthStore = create<AuthState>((set) => ({
  ...clearedState,
  locked: true,
  sessionError: null,
  status: 'restoring',

  beginRestoring: () => {
    set({ sessionError: null, status: 'restoring' });
  },

  markPasswordChanged: () => {
    set((state) =>
      state.user
        ? { user: { ...state.user, mustChangePassword: false } }
        : {},
    );
  },

  markAuthenticated: ({
    accessToken,
    accessTokenExpiresAt = null,
    sessionId = null,
    user,
  }) => {
    set({
      accessToken,
      accessTokenExpiresAt,
      sessionError: null,
      sessionId,
      status: 'authenticated',
      // เคลียร์ร่องรอย 2FA ทิ้งทันทีที่ผ่านด่านแล้ว
      twoFactorExpiresAt: null,
      twoFactorToken: null,
      user,
    });
  },

  markTwoFactorRequired: ({ expiresAt, twoFactorToken }) => {
    set({
      ...clearedState,
      sessionError: null,
      status: 'two-factor-required',
      twoFactorExpiresAt: expiresAt,
      twoFactorToken,
    });
  },

  markUnauthenticated: (message = null) => {
    set({
      ...clearedState,
      sessionError: message,
      status: 'unauthenticated',
    });
  },

  setAccessToken: (accessToken) => {
    set({ accessToken });
  },

  updateUser: (patch) => {
    set((state) => (state.user ? { user: { ...state.user, ...patch } } : {}));
  },

  lock: () => {
    set({ locked: true });
  },

  unlock: () => {
    set({ locked: false });
  },

  setHasPin: (hasPin) => {
    set({ hasPin });
  },
}));
