import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback, useRef } from 'react';

import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

import {
  fetchPunchContext,
  submitPunch,
  type PunchLocationPayload,
} from './punch.api';
import type { PunchResult, PunchType } from './punch.types';

/**
 * ข้อมูลรอบลงเวลา ณ ตอนนี้
 *
 * ต้องสดเสมอเพราะ "กดได้/ไม่ได้" ขึ้นกับเวลาปัจจุบัน ค้างไว้แค่ 15 วินาที
 * และดึงใหม่ทุกครั้งที่กลับเข้าหน้าจอ — ข้อมูลเก่าจะทำให้ปุ่มโกหกผู้ใช้
 */
export function usePunchContext(punchType?: PunchType) {
  return useQuery({
    queryFn: () => fetchPunchContext(punchType),
    queryKey: queryKeys.punchContext(punchType),
    refetchOnMount: 'always',
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    staleTime: 15_000,
  });
}

export interface PunchSubmission {
  location?: PunchLocationPayload;
  note?: string;
  punchType?: PunchType;
}

export function usePunch() {
  const queryClient = useQueryClient();
  /*
   * Idempotency key ผูกกับ "ความตั้งใจกดหนึ่งครั้ง" ไม่ใช่กับ request
   * ถ้าเน็ตหลุดตอนกำลังส่ง แล้วผู้ใช้กดใหม่ ต้องใช้ key เดิมเพื่อให้ backend
   * รู้ว่าเป็นครั้งเดียวกัน ไม่งั้นจะได้เวลาเข้างานสองรายการ
   */
  const attemptKey = useRef<string | null>(null);

  const mutation = useMutation({
    async mutationFn(input: PunchSubmission): Promise<PunchResult> {
      attemptKey.current ??= Crypto.randomUUID();

      return submitPunch({
        idempotencyKey: attemptKey.current,
        installationId: await getOrCreateInstallationId(),
        location: input.location,
        note: input.note,
        punchType: input.punchType,
      });
    },
    onSuccess() {
      /* บันทึกแล้ว ครั้งถัดไปคือความตั้งใจใหม่ ต้องได้ key ใหม่ */
      attemptKey.current = null;

      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
      /*
       * ข้ามคิว current-location — invalidate ทั้ง ['attendance'] จะกวาดโดน
       * ['attendance','current-location'] ด้วย ซึ่งสั่งอ่าน GPS ใหม่ทันทีทั้งที่
       * เพิ่งอ่านไปตอนกดส่ง เสียแบตและทำให้แถบ "กำลังอ่านตำแหน่ง…" ขึ้นค้าง
       * หลังลงเวลาสำเร็จ
       */
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'attendance' &&
          query.queryKey[1] !== 'current-location',
      });
    },
  });

  /** เริ่มความตั้งใจใหม่ เช่นผู้ใช้ปิดจอแล้วเปิดใหม่ */
  const resetAttempt = useCallback(() => {
    attemptKey.current = null;
    mutation.reset();
  }, [mutation]);

  return { ...mutation, resetAttempt };
}
