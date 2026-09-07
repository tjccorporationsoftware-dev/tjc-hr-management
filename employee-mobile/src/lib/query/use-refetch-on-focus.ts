import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/**
 * ดึงข้อมูลใหม่เมื่อผู้ใช้กลับมาที่จอนี้ (ถ้าข้อมูลเก่าพอ)
 *
 * ## ทำไมยังต้องมี ทั้งที่ต่อ AppState ไปแล้ว
 *
 * `installQueryFocusManager()` จับได้เฉพาะ "ออกจากแอปแล้วกลับมา" แต่แท็บล่าง
 * ของ expo-router เก็บจอที่เคยเปิดไว้ในหน่วยความจำ ไม่ unmount — ผู้ใช้ที่
 * สลับแท็บไปมาโดยไม่เคยออกจากแอปเลยจึงไม่เข้าเงื่อนไขนั้น
 *
 * เคสจริงที่เจอ: เปิดแท็บเงินเดือนตอนเช้าตอนที่ HR ยังไม่ประกาศงวด → เห็น
 * "ยังไม่มีสลิป" → ไปทำอย่างอื่นในแอป → กลับมาแท็บเดิมตอนบ่าย ก็ยังเห็น
 * ข้อความเดิม เพราะจอไม่เคย mount ใหม่และแอปไม่เคยถูกพักไปเบื้องหลัง
 *
 * ## ที่ตั้งใจไม่ทำ
 *
 * ไม่ยิงทุกครั้งที่จอ focus — เช็ค `isStale` ก่อนเสมอ ไม่งั้นการปัดสลับแท็บ
 * ไปกลับหนึ่งรอบจะยิง request สี่ห้าตัวโดยไม่มีอะไรเปลี่ยน กินเน็ตผู้ใช้และ
 * ทำให้จอกระพริบ
 *
 * ข้ามการยิงรอบแรกด้วย เพราะตอน mount ครั้งแรก react-query โหลดให้อยู่แล้ว
 *
 * @example
 * const payslips = usePayslips(canView);
 * useRefetchOnFocus(payslips);
 */
export function useRefetchOnFocus(query: {
  isStale: boolean;
  refetch: () => unknown;
}) {
  const mounted = useRef(false);

  /*
   * เก็บสถานะล่าสุดไว้ใน ref แล้วเขียนทับใน effect (ไม่ใช่ระหว่าง render)
   *
   * ที่ต้องใช้ ref แทนการใส่ลง dependency ของ useFocusEffect: `isStale`
   * เปลี่ยนค่าได้ระหว่างที่ผู้ใช้ยังอยู่บนจอ ถ้าผูกเป็น dependency จอจะยิง
   * refetch ทันทีที่ข้อมูลหมดอายุ ทั้งที่ผู้ใช้ไม่ได้เพิ่งกลับมา — ซึ่งไม่ใช่
   * สิ่งที่ hook นี้ทำ
   */
  const latest = useRef(query);

  useEffect(() => {
    latest.current = query;
  });

  useFocusEffect(
    useCallback(() => {
      if (!mounted.current) {
        mounted.current = true;
        return;
      }

      if (latest.current.isStale) {
        latest.current.refetch();
      }
    }, []),
  );
}
