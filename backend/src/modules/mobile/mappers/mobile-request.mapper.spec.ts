import { toMobileRequestDetail } from './mobile-request.mapper';

describe('mobile-request.mapper', () => {
  it('DRAFT ต้องเปิด edit/submit และส่ง editable snapshot โดยไม่ต้องให้ Mobile อ่าน raw', () => {
    const result = toMobileRequestDetail('LEAVE', {
      id: 'leave-1',
      status: 'DRAFT',
      leaveTypeId: 'lt-1',
      startDate: new Date('2026-08-20T00:00:00.000Z'),
      endDate: new Date('2026-08-21T00:00:00.000Z'),
      dayType: 'FULL_DAY',
      reason: 'พักรักษาตัว',
      leaveType: { id: 'lt-1', nameTh: 'ลาป่วย' },
    });

    expect(result).toMatchObject({
      canEdit: true,
      canSubmit: true,
      canDelete: false,
      editable: {
        dayType: 'FULL_DAY',
        leaveTypeId: 'lt-1',
        reason: 'พักรักษาตัว',
        startDate: '2026-08-20',
        endDate: '2026-08-21',
      },
    });
  });

  it('Offsite DRAFT เท่านั้นที่แสดง capability ลบฉบับร่าง', () => {
    const draft = toMobileRequestDetail('OFFSITE', {
      id: 'os-1',
      status: 'DRAFT',
      workDate: new Date('2026-08-20T00:00:00.000Z'),
      startTime: '09:00',
      endTime: '17:00',
      reason: 'พบลูกค้า',
    });
    const submitted = toMobileRequestDetail('OFFSITE', {
      id: 'os-2',
      status: 'SUBMITTED',
      workDate: new Date('2026-08-20T00:00:00.000Z'),
      startTime: '09:00',
      endTime: '17:00',
      reason: 'พบลูกค้า',
    });

    expect(draft.canDelete).toBe(true);
    expect(submitted.canDelete).toBe(false);
    expect(submitted.canEdit).toBe(false);
    expect(submitted.canSubmit).toBe(false);
  });
});
