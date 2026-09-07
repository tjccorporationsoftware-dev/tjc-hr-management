import { toMobileProfile } from './mobile-profile.mapper';

describe('toMobileProfile', () => {
  it('ส่งเฉพาะข้อมูลที่ Mobile ต้องใช้และ mask เลขบัญชี', () => {
    const result = toMobileProfile({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'สมชาย',
        phone: '0812345678',
        avatarUrl: '/uploads/avatar.jpg',
      },
      employee: {
        id: 'emp-1',
        employeeCode: 'E001',
        title: 'นาย',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        nickname: 'ชาย',
        displayName: null,
        email: 'work@example.com',
        phone: '0812345678',
        position: 'เจ้าหน้าที่',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        employmentEndDate: null,
        probationEndDate: null,
        probationPassedAt: null,
        status: 'ACTIVE',
        company: { id: 'c1', code: 'C1', nameTh: 'บริษัท A', nameEn: null },
        branch: null,
        department: null,
        division: null,
        employeeType: null,
        positionMaster: null,
        supervisor: null,
        profile: {
          gender: 'MALE',
          birthDate: null,
          maritalStatus: 'SINGLE',
          nationality: 'ไทย',
          currentAddress: 'กรุงเทพฯ',
          registeredAddress: null,
          emergencyContactName: 'แม่',
          emergencyContactPhone: '0890000000',
          emergencyContactRelation: 'มารดา',
          emergencyContactAddress: null,
          educationLevel: 'ปริญญาตรี',
          educationInstitute: 'มหาวิทยาลัย A',
          educationMajor: 'บัญชี',
          bankName: 'ธนาคาร A',
          bankAccountNo: '1234567890',
          bankAccountName: 'สมชาย ใจดี',
          personalEmail: 'personal@example.com',
          workPhoneExt: '123',
          lineId: 'somchai',
          bloodType: 'O',
          payrollPaymentMethod: 'BANK_TRANSFER',
        },
        documents: [
          {
            id: 'doc-1',
            type: 'BANK_BOOK',
            title: 'สำเนาสมุดบัญชี',
            description: null,
            fileName: 'bank.pdf',
            fileSize: 1000,
            mimeType: 'application/pdf',
            issuedDate: null,
            expiredDate: null,
            status: 'ACTIVE',
            createdAt: new Date('2026-08-20T00:00:00.000Z'),
          },
        ],
      },
    } as never);

    expect(result.bank?.accountNumber).toBe('1234567890');
    expect(result.documents[0]).toEqual(
      expect.not.objectContaining({ storageKey: expect.anything() }),
    );
    expect(result.capabilities).toEqual({
      editSelf: true,
      editHrData: false,
      changeAvatar: true,
    });
  });
});
