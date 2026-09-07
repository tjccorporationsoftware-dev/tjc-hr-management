import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { configureApiAuthBridge } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { tokenRefreshManager } from '@/lib/api/token-refresh-manager';
import { captureEvent } from '@/lib/monitoring/monitoring';
import { queryClient } from '@/providers/query-provider';

import { clearLocalSession, refreshAccessToken } from './auth.service';
import { useAuthStore } from './auth.store';
import { hasPinFor } from './pin';

interface AuthSessionProviderProps {
  children: ReactNode;
}

const SESSION_EXPIRED_MESSAGE = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';

/**
 * อยู่พื้นหลังนานเกินเท่านี้แล้วกลับมา ต้องใส่ PIN ใหม่
 *
 * สองนาทีเป็นการประนีประนอม: สลับไปเปิดกล้อง/ปฏิทิน/รับสายแล้วกลับมาไม่โดนถาม
 * แต่วางเครื่องทิ้งไว้บนโต๊ะแล้วมีคนหยิบไปเปิดจะโดน — ถ้าล็อกทุกครั้งที่สลับแอป
 * ผู้ใช้จะพิมพ์ PIN วันละสิบรอบจนเลิกใช้แอปไปเลย
 */
const RELOCK_AFTER_BACKGROUND_MS = 2 * 60 * 1000;

/**
 * เชื่อม API client เข้ากับ auth store แล้วกู้ session ตอนเปิดแอป
 *
 * การกู้ session ทำโดยยิง refresh จริง ไม่ใช่แค่เช็คว่ามี token ค้างอยู่ในเครื่อง
 * เพราะ token ที่ถูกถอนสิทธิ์จากเครื่องอื่นก็ยังอยู่ในเครื่องนี้เหมือนเดิม
 * ถ้าเช็คแค่ว่ามีอยู่ ผู้ใช้จะเข้าแอปได้แล้วไปเจอ 401 ทุกหน้าแทน
 */
export function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  useEffect(() => {
    configureApiAuthBridge({
      getAccessToken: () => useAuthStore.getState().accessToken,
      onSessionExpired: async () => {
        queryClient.clear();
        await clearLocalSession(SESSION_EXPIRED_MESSAGE);
      },
      refreshAccessToken,
    });

    return () => {
      configureApiAuthBridge(null);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      useAuthStore.getState().beginRestoring();

      try {
        /*
         * ต้องผ่าน mutex ตัวเดียวกับที่ api client ใช้ ห้ามเรียกตรง ๆ
         *
         * backend หมุน refresh token ทุกครั้งและ **ยกเลิก session ทั้งอัน**
         * เมื่อเจอ token ที่ไม่ตรง (auth.service.ts) ดังนั้นถ้าการกู้ session
         * ตอนเปิดแอปวิ่งชนกับคำขอที่เจอ 401 พอดี ทั้งสองจะยิง refresh ด้วย
         * token ใบเดียวกัน ตัวที่มาทีหลังกลายเป็น token ผิด แล้ว session
         * ถูกฆ่าทิ้งทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด — อาการคือถูกเด้งออกเป็นครั้งคราว
         * โดยหาสาเหตุไม่เจอ
         */
        const accessToken = await tokenRefreshManager.run(refreshAccessToken);

        if (!active) {
          return;
        }

        if (!accessToken) {
          useAuthStore.getState().markUnauthenticated();
          return;
        }

        /*
         * กู้ session ได้ = ยังล็อกอินอยู่ แต่ "เปิดแอปใหม่" ต้องผ่าน PIN ก่อนเสมอ
         * ส่วนคนที่ยังไม่เคยตั้ง PIN ให้ปลดล็อกไว้ แล้วปล่อยให้ตัวจัดเส้นทาง
         * พาไปหน้าตั้ง PIN — ไม่ใช่ขังไว้หน้าใส่ PIN ที่ยังไม่มีรหัสให้ใส่
         */
        const userId = useAuthStore.getState().user?.id ?? null;
        const exists = userId ? await hasPinFor(userId) : false;

        if (!active) {
          return;
        }

        useAuthStore.getState().setHasPin(exists);

        if (exists) {
          useAuthStore.getState().lock();
        } else {
          useAuthStore.getState().unlock();
        }
      } catch (error) {
        if (!active) {
          return;
        }

        // เน็ตล่มตอนเปิดแอป ไม่เท่ากับถูกไล่ออกจากระบบ
        // จึงเก็บ refresh token ไว้ให้ลองใหม่ได้ แทนที่จะล้างทิ้งทันที
        const isSessionRejected =
          error instanceof ApiError &&
          error.status !== null &&
          error.status >= 400 &&
          error.status < 500;

        if (isSessionRejected) {
          await clearLocalSession(SESSION_EXPIRED_MESSAGE);
          return;
        }

        captureEvent({
          context: { code: error instanceof ApiError ? error.code : 'UNKNOWN' },
          level: 'warning',
          message: 'session_restore_failed',
        });

        useAuthStore
          .getState()
          .markUnauthenticated('เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง');
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);

  /* กลับมาจากพื้นหลังนาน ๆ ให้ล็อกใหม่ — จอในแอปจะเด้งไปหน้าใส่ PIN เอง */
  useEffect(() => {
    let leftAt: number | null = null;

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        /* จำเวลาที่ออกไปครั้งแรกเท่านั้น inactive→background ไม่ควรรีเซ็ตนาฬิกา */
        leftAt = leftAt ?? Date.now();
        return;
      }

      const away = leftAt === null ? 0 : Date.now() - leftAt;
      leftAt = null;

      const state = useAuthStore.getState();

      if (
        away >= RELOCK_AFTER_BACKGROUND_MS &&
        state.status === 'authenticated' &&
        state.hasPin
      ) {
        state.lock();
      }
    });

    return () => subscription.remove();
  }, []);

  return children;
}
