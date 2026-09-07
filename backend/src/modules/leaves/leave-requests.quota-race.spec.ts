import { LeaveRequestsService } from './leave-requests.service';

/**
 * โควตาลาต้องเบิกเกินไม่ได้แม้กดพร้อมกัน
 *
 * เคสที่เคยพังจริง: เส้นทางส่งใบลาเป็น อ่านยอด → เช็ค → หัก โดยไม่ล็อกแถว
 * พนักงานที่เหลือโควตา 1 วัน กดส่งใบลา 2 ใบพร้อมกันจะอ่านยอดเดียวกันทั้งคู่
 * ผ่านการเช็คทั้งคู่ แล้วกัน pendingDays ซ้อนกันจนติดลบ
 *
 * ทดสอบที่ระดับฟังก์ชัน เพราะพฤติกรรมล็อกจริงเป็นของฐานข้อมูล
 * สิ่งที่ต้องพิสูจน์คือ "มีการสั่งล็อกแถวก่อนอ่านค่ามาเช็ค" และอ่านค่าใหม่ใต้ล็อก
 */
type LockBalanceFn = (
  tx: unknown,
  params: {
    employeeId: string;
    leaveTypeId: string;
    companyId: string;
    branchId: string | null;
    employeeTypeId: string | null;
    year: number;
  },
) => Promise<any>;

const params = {
  employeeId: 'emp-1',
  leaveTypeId: 'lt-1',
  companyId: 'com-1',
  branchId: null,
  employeeTypeId: null,
  year: 2026,
};

/** ยอดก่อนล็อก vs ยอดจริงหลังธุรกรรมอื่น commit ไปแล้ว */
const STALE_BALANCE = { id: 'bal-1', pendingDays: 0, usedDays: 0 };
const FRESH_BALANCE = { id: 'bal-1', pendingDays: 1, usedDays: 0 };

function buildService() {
  const service = new (LeaveRequestsService as unknown as new (
    ...args: unknown[]
  ) => LeaveRequestsService)();

  const calls: string[] = [];

  const tx = {
    $queryRaw: jest.fn((...args: unknown[]) => {
      calls.push('lock');
      void args;
      return Promise.resolve([{ id: 'bal-1' }]);
    }),
    leaveBalance: {
      findUnique: jest.fn((): Promise<Record<string, unknown> | null> => {
        calls.push('read-after-lock');
        return Promise.resolve(FRESH_BALANCE);
      }),
    },
  };

  // ตัดการสร้างแถวออก เหลือเฉพาะพฤติกรรมล็อกที่กำลังทดสอบ
  (service as any).ensureBalanceForRequest = jest.fn(() => {
    calls.push('ensure');
    return Promise.resolve(STALE_BALANCE);
  });

  const lockBalanceForUpdate = (service as any)
    .lockBalanceForUpdate as LockBalanceFn;

  return {
    calls,
    tx,
    lock: lockBalanceForUpdate.bind(service),
  };
}

describe('lockBalanceForUpdate', () => {
  it('สั่งล็อกแถวโควตาด้วย FOR UPDATE', async () => {
    const { tx, lock } = buildService();
    await lock(tx, params);

    const sql = tx.$queryRaw.mock.calls[0]?.[0];
    const text = Array.isArray(sql) ? sql.join('?') : String(sql);

    expect(text).toContain('leave_balances');
    expect(text).toContain('FOR UPDATE');
  });

  it('ล็อกก่อน แล้วค่อยอ่านยอด — ไม่ใช่อ่านก่อนล็อก', async () => {
    const { calls, tx, lock } = buildService();
    await lock(tx, params);

    expect(calls).toEqual(['ensure', 'lock', 'read-after-lock']);
  });

  it('คืนยอดที่อ่านใต้ล็อก ไม่ใช่ยอดเก่าที่อ่านไว้ก่อน', async () => {
    const { tx, lock } = buildService();
    const balance = await lock(tx, params);

    // ธุรกรรมอื่นกัน pendingDays ไป 1 วันแล้ว ต้องเห็นค่านั้น
    expect(balance.pendingDays).toBe(1);
  });

  it('อ่านซ้ำแล้วไม่เจอแถว ถอยไปใช้ค่าเดิมแทนที่จะพัง', async () => {
    const { tx, lock } = buildService();
    tx.leaveBalance.findUnique.mockResolvedValue(null);

    const balance = await lock(tx, params);

    expect(balance).toEqual(STALE_BALANCE);
  });
});
