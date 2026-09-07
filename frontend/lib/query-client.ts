import { QueryClient } from "@tanstack/react-query";

import { ApiClientError } from "./api";

/**
 * ค่าเริ่มต้นของ react-query ทั้งแอป
 * ---------------------------------
 * ก่อนหน้านี้ @tanstack/react-query อยู่ใน package.json แต่ไม่ถูกใช้เลยสักที่
 * ทุกหน้า fetch เองด้วย useEffect + useState (186 useEffect, ไม่มี
 * AbortController สักตัว) ผลคือไม่มี cache ไม่มี dedup กลับมาหน้าเดิมยิงใหม่หมด
 * และเปลี่ยนตัวกรองเร็ว ๆ แล้ว response เก่ามาทับใหม่ได้
 */

/** ผิดพลาดฝั่ง client (4xx) ยิงซ้ำไปก็ได้ผลเดิม ยกเว้น 408/429 ที่ลองใหม่มีความหมาย */
function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiClientError) {
    const retryableClientError = error.status === 408 || error.status === 429;

    if (error.status >= 400 && error.status < 500 && !retryableClientError) {
      return false;
    }
  }

  return failureCount < 2;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // ข้อมูล HR ส่วนใหญ่ไม่ได้เปลี่ยนทุกวินาที 30 วิพอให้สลับหน้าไปกลับ
        // แล้วไม่ยิงซ้ำ แต่ยังไม่ค้างจนเห็นข้อมูลเก่า
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        // ไม่ refetch ตอนสลับแท็บ ให้พฤติกรรมใกล้ของเดิมที่ไม่เคย refetch เอง
        // หน้าไหนที่อยากได้สดตลอด ค่อยตั้ง refetchInterval เป็นราย query
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * ฝั่ง server สร้างใหม่ทุกครั้ง เพื่อไม่ให้ cache ของผู้ใช้คนหนึ่งรั่วไปอีกคน
 * ฝั่ง browser ใช้ตัวเดิมค้างไว้ ไม่งั้น re-render จะล้าง cache ทิ้ง
 */
export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }

  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }

  return browserQueryClient;
}
