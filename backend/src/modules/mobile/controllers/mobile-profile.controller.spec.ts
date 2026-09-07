import { MobileProfileController } from './mobile-profile.controller';

describe('MobileProfileController', () => {
  const user = { id: 'user-1' } as never;

  it('โหลดโปรไฟล์ด้วย user id จาก token', async () => {
    const profile = {
      getMyProfile: jest.fn(async () => ({ user: { id: 'user-1' } })),
    };
    const controller = new MobileProfileController(profile as never);

    await controller.getMyProfile(user);

    expect(profile.getMyProfile).toHaveBeenCalledWith('user-1');
  });

  it('ตั้ง no-store เมื่อเปิดเอกสารส่วนตัว', async () => {
    const profile = {
      getMyDocumentFile: jest.fn(async () => ({
        filePath: '/tmp/file.pdf',
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
        size: 123,
      })),
    };
    const controller = new MobileProfileController(profile as never);
    const response = {
      setHeader: jest.fn(),
      sendFile: jest.fn((value) => value),
    } as never;

    await controller.downloadDocument(user, 'doc-1', response);

    expect(profile.getMyDocumentFile).toHaveBeenCalledWith('user-1', 'doc-1');
    expect((response as any).setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });
});
