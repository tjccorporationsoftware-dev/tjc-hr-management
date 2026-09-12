import { employeeDisplayName, withNickname } from './employee-display-name.util';

/**
 * ชื่อบนหน้าจอต้องมีชื่อเล่นต่อท้ายเสมอ แต่ห้ามต่อซ้ำ และห้ามต่อเมื่อไม่มีชื่อเล่น
 * (ผู้ใช้สั่ง 2569-09-12: ทุกหน้าที่มีรายชื่อพนักงานต้องมีวงเล็บชื่อเล่น)
 */
describe('employeeDisplayName', () => {
  it('ต่อชื่อเล่นท้าย displayName', () => {
    expect(
      employeeDisplayName({ displayName: 'นางสาว สุภาพร สองเมือง', nickname: 'ตาล' }),
    ).toBe('นางสาว สุภาพร สองเมือง (ตาล)');
  });

  it('ประกอบจากคำนำหน้า/ชื่อ/สกุล เมื่อไม่มี displayName แล้วต่อชื่อเล่น', () => {
    expect(
      employeeDisplayName({ title: 'นาย', firstName: 'ก', lastName: 'ข', nickname: 'โอ' }),
    ).toBe('นาย ก ข (โอ)');
    expect(
      employeeDisplayName(
        { title: 'นาย', firstName: 'ก', lastName: 'ข', nickname: 'โอ' },
        { includeTitle: false },
      ),
    ).toBe('ก ข (โอ)');
  });

  it('ไม่ต่อซ้ำถ้าชื่อมีวงเล็บชื่อเล่นอยู่แล้ว', () => {
    expect(withNickname('นาย ก ข (โอ)', 'โอ')).toBe('นาย ก ข (โอ)');
  });

  it('ไม่มีชื่อเล่น = ชื่อเดิม · ไม่มีพนักงาน = ค่าสำรอง', () => {
    expect(employeeDisplayName({ displayName: 'นาย ก ข', nickname: '' })).toBe('นาย ก ข');
    expect(employeeDisplayName({ displayName: 'นาย ก ข', nickname: null })).toBe('นาย ก ข');
    expect(employeeDisplayName(null)).toBe('-');
    expect(employeeDisplayName(undefined, { fallback: 'ไม่ระบุชื่อ' })).toBe('ไม่ระบุชื่อ');
  });

  it('ไม่มีชื่อเลย เหลือแค่รหัส — ยังต่อชื่อเล่นให้ จะได้รู้ว่าใคร', () => {
    expect(employeeDisplayName({ employeeCode: '670028', nickname: 'ตาล' })).toBe('670028 (ตาล)');
  });
});
