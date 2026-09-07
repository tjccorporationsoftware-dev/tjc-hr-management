import { toPublicFileUrl } from '@/lib/api/public-url';

const API = 'http://192.168.1.10:4000/api';

/**
 * บั๊กจริงที่เทสชุดนี้กัน: เอา apiBaseUrl (ลงท้ายด้วย /api) ไปต่อกับพาธของรูป
 * ตรง ๆ จะได้ /api/uploads/... ซึ่ง backend ไม่ได้เสิร์ฟไว้ตรงนั้น รูปเลยไม่ขึ้น
 * ทั้งแอปโดยไม่มี error ให้เห็น เพราะการโหลดรูปที่ล้มเหลวจะตกไปใช้ตัวสำรองเงียบ ๆ
 */
describe('toPublicFileUrl', () => {
  it('พาธสัมพัทธ์ต้องต่อกับ origin ไม่ใช่กับ base url ที่มี /api', () => {
    expect(toPublicFileUrl(API, '/uploads/avatars/abc.jpg')).toBe(
      'http://192.168.1.10:4000/uploads/avatars/abc.jpg',
    );
  });

  it('พาธที่ไม่มีทับนำหน้าก็ต้องได้ผลเหมือนกัน', () => {
    expect(toPublicFileUrl(API, 'uploads/avatars/abc.jpg')).toBe(
      'http://192.168.1.10:4000/uploads/avatars/abc.jpg',
    );
  });

  it('ทับซ้อนกันต้องไม่กลายเป็นทับคู่', () => {
    expect(toPublicFileUrl('http://host:4000/api/', '//uploads/a.png')).toBe(
      'http://host:4000/uploads/a.png',
    );
  });

  it('ที่อยู่เต็มหรือรูปฝังในตัวเองต้องส่งคืนตามเดิม', () => {
    expect(toPublicFileUrl(API, 'https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png',
    );
    expect(toPublicFileUrl(API, 'data:image/png;base64,AAA')).toBe(
      'data:image/png;base64,AAA',
    );
  });

  it('ไม่มีพาธต้องคืน null ให้ผู้เรียกไปแสดงตัวสำรอง', () => {
    expect(toPublicFileUrl(API, null)).toBeNull();
    expect(toPublicFileUrl(API, undefined)).toBeNull();
    expect(toPublicFileUrl(API, '')).toBeNull();
  });

  it('base url ที่ไม่มีพาธต่อท้ายก็ยังทำงานถูก', () => {
    expect(toPublicFileUrl('http://host:4000', '/uploads/a.png')).toBe(
      'http://host:4000/uploads/a.png',
    );
  });
});
