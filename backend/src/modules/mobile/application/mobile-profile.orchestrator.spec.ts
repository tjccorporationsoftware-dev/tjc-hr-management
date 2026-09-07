import { MobileProfileOrchestrator } from './mobile-profile.orchestrator';

describe('MobileProfileOrchestrator', () => {
  it('update ใช้ ProfileService เดิมแล้วอ่าน snapshot ใหม่', async () => {
    const profileService = {
      updateMe: jest.fn(async () => ({})),
      getMobileProfileSnapshot: jest.fn(async () => ({
        user: {
          id: 'user-1',
          email: 'u@example.com',
          displayName: 'ชื่อใหม่',
          phone: '0812345678',
          avatarUrl: null,
        },
        employee: null,
      })),
    };
    const service = new MobileProfileOrchestrator(profileService as never);

    const result = await service.updateMyProfile('user-1', {
      displayName: 'ชื่อใหม่',
    });

    expect(profileService.updateMe).toHaveBeenCalledWith('user-1', {
      displayName: 'ชื่อใหม่',
    });
    expect(profileService.getMobileProfileSnapshot).toHaveBeenCalledWith('user-1');
    expect(result.user.displayName).toBe('ชื่อใหม่');
  });

  it('download ส่ง userId ให้ domain service แทนการรับ employeeId จาก client', async () => {
    const profileService = {
      getMyDocumentFileForDownload: jest.fn(async () => ({ filePath: '/tmp/a' })),
    };
    const service = new MobileProfileOrchestrator(profileService as never);

    await service.getMyDocumentFile('user-1', 'doc-1');

    expect(profileService.getMyDocumentFileForDownload).toHaveBeenCalledWith(
      'user-1',
      'doc-1',
    );
  });
});
