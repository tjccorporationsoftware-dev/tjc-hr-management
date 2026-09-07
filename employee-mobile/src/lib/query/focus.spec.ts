import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { installQueryFocusManager } from './focus';

/**
 * การต่อ AppState เข้ากับ react-query
 *
 * เป็นโค้ดสามบรรทัดที่ลบทิ้งได้ง่ายมากเวลาจัดระเบียบไฟล์ และเมื่อหายไปแล้ว
 * **จะไม่มีอะไรพัง** — แอปยังทำงานปกติทุกอย่าง ยกเว้นข้อมูลค้างเงียบ ๆ
 * จนผู้ใช้บ่นว่า "แอปไม่อัปเดต" ซึ่งไล่หาสาเหตุยากมาก
 *
 * เทสนี้จึงล็อกพฤติกรรมไว้ ไม่ใช่ล็อกโค้ด
 */
/**
 * ดัก handler ที่ installQueryFocusManager ส่งให้ AppState เพื่อยิงสถานะเองได้
 *
 * ใช้ object ห่อไว้แทนตัวแปรตรง ๆ เพราะ TypeScript แคบชนิดของตัวแปรที่ถูก
 * กำหนดค่าเฉพาะใน callback ให้เหลือ never แล้วเรียกใช้ไม่ได้
 */
function captureAppStateHandler() {
  const ref = { current: (_status: string) => {} };

  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, handler) => {
      ref.current = handler as (status: string) => void;
      return { remove: jest.fn() } as never;
    });

  return ref;
}

describe('installQueryFocusManager', () => {
  afterEach(() => {
    /* คืน listener เดิมให้ react-query ไม่งั้นเทสอื่นได้ของที่เราตั้งค้างไว้ */
    focusManager.setEventListener(() => () => undefined);
    jest.restoreAllMocks();
  });

  it('บอก react-query ว่า focus เมื่อแอปกลับมา active', () => {
    const emit = captureAppStateHandler();

    installQueryFocusManager();

    emit.current('background');
    expect(focusManager.isFocused()).toBe(false);

    emit.current('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('ถือว่า inactive ยังไม่ใช่การออกจากแอป', () => {
    const emit = captureAppStateHandler();

    installQueryFocusManager();

    emit.current('active');
    emit.current('inactive');

    /*
     * iOS ยิง inactive ตอนลากแถบควบคุมลงมาหรือมีสายเข้า ผู้ใช้ยังอยู่กับแอป
     * ถ้านับเป็น blur จะเกิด refetch รัวทุกครั้งที่ปัดแถบแจ้งเตือน
     */
    expect(focusManager.isFocused()).toBe(false);
  });

  it('ถอน listener คืนเมื่อ react-query เลิกใช้', () => {
    const remove = jest.fn();

    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove }) as never);

    installQueryFocusManager();

    /* ตั้ง listener ตัวใหม่ทับ = ตัวเก่าต้องถูกถอน */
    focusManager.setEventListener(() => () => undefined);

    expect(remove).toHaveBeenCalled();
  });
});
