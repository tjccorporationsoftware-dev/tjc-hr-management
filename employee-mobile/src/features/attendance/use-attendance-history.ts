import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { queryKeys } from '@/lib/query/query-keys';

import { monthOf, shiftMonth } from './calendar';
import { fetchAttendanceHistory, type AttendanceRange } from './history.api';
import type { AttendanceHistory } from './history.types';

export function useAttendanceHistory(
  month: string,
  range: AttendanceRange = 'calendar',
  anchorDate?: string,
  /*
   * ปิดไว้ก่อนได้ — ผู้เรียกบางรายรู้ว่าจะถามงวดไหนก็ต่อเมื่อคำตอบของงวด
   * ปัจจุบันมาถึงแล้ว (เดือนของงวดไม่เท่ากับเดือนปฏิทิน ฝั่งแอปเดาเองไม่ได้
   * เพราะไม่รู้วันตัดของบริษัท) ยิงด้วย month ว่างจะได้ 400 เปล่า ๆ
   */
  enabled = true,
) {
  return useQuery({
    enabled,
    /*
     * คงข้อมูลเดือนก่อนไว้ระหว่างโหลดเดือนใหม่
     * ไม่งั้นกดเปลี่ยนเดือนแล้วปฏิทินจะกะพริบเป็นจอเปล่าทุกครั้ง
     */
    placeholderData: keepPreviousData,
    queryFn: () => fetchAttendanceHistory(month, range, anchorDate),
    /* คนละช่วงคือคนละชุดข้อมูล ต้องแยก key ไม่งั้นสองจอจะกินแคชของกันและกัน */
    queryKey: queryKeys.attendanceHistory(month, range, anchorDate),
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    /* ข้อมูลย้อนหลังเปลี่ยนไม่บ่อย แต่เดือนปัจจุบันเปลี่ยนได้ทุกวัน */
    staleTime: 60_000,
  });
}

/**
 * ประวัติเวลาแบบไล่ย้อนหลังต่อเนื่อง — หนึ่ง "หน้า" คือหนึ่งงวดเงินเดือน
 *
 * จอประวัติลงเวลาต้องดูย้อนได้เรื่อย ๆ ไม่ใช่ทีละงวดผ่านปุ่มลูกศร แต่ backend
 * ตอบเป็นรายเดือน/รายงวด จึงต่อกันเองที่ฝั่งแอป: หน้าแรกถามด้วยวันที่วันนี้
 * เพื่อให้ได้ "งวดที่ครอบวันนี้" แล้วหน้าถัดไปถอยจากวันปิดงวดที่ backend
 * ตอบกลับมาทีละงวด — ห้ามเดาจากเดือนปฏิทิน เพราะแอปไม่รู้วันตัดของบริษัท
 */
export function useAttendanceHistoryFeed(anchorDate: string, enabled = true) {
  return useInfiniteQuery({
    enabled,
    /*
     * หยุดเมื่อเจองวดที่ไม่มีบันทึกเลย = ถอยไปก่อนวันเริ่มงานแล้ว
     * และกันไว้ที่ 24 งวดเป็นเพดานแข็ง เผื่อกรณีที่ backend คืนงวดว่างไม่ได้
     */
    /*
     * ต้องระบุชนิดของพารามิเตอร์เอง — eslint บังคับเรียงคีย์ตามตัวอักษร
     * ทำให้ getNextPageParam มาก่อน queryFn แล้ว TS ยังไม่รู้ชนิดของหน้า
     */
    getNextPageParam: (lastPage: AttendanceHistory, allPages: AttendanceHistory[]) => {
      if (lastPage.days.length === 0 || allPages.length >= 24) return undefined;

      const to = lastPage.period?.to;

      return to ? shiftMonth(monthOf(to), -1) : undefined;
    },
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      fetchAttendanceHistory(
        pageParam || monthOf(anchorDate),
        'payroll',
        /* วันอ้างอิงใช้เฉพาะหน้าแรก หน้าถัดไปรู้เดือนของงวดตัวเองแล้ว */
        pageParam ? undefined : anchorDate,
      ),
    queryKey: queryKeys.attendanceHistoryFeed(anchorDate),
    retry(failureCount, error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        return false;
      }

      return failureCount < 2;
    },
    staleTime: 60_000,
  });
}
