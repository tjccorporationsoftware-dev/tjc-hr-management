/**
 * แก้ปัญหา "localhost" ตอนรันบนมือถือจริง
 *
 * .env ตั้ง EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api ซึ่งถูกสำหรับ
 * เครื่องที่รัน backend เท่านั้น พอเปิดบนโทรศัพท์ คำว่า localhost หมายถึง
 * "ตัวโทรศัพท์เอง" ทุก request จึงยิงไปที่ว่างเปล่าและล็อกอินไม่ผ่าน
 * โดยไม่มีข้อความบอกว่าผิดตรงไหน
 *
 * Metro รู้ IP ในวงแลนของเครื่อง dev อยู่แล้ว (hostUri เช่น "192.168.1.5:8081")
 * จึงยืมเลขนั้นมาแทน host แต่คงพอร์ตและ path ของ backend ไว้ตามเดิม
 *
 * ทำเฉพาะตอน development เท่านั้น — บน production ค่า URL ต้องเป็นสิ่งที่
 * ตั้งใจ deploy จริง ห้ามให้อะไรมาเขียนทับเงียบ ๆ
 */

/** host ที่หมายถึง "เครื่องนี้" ซึ่งใช้ไม่ได้เมื่อแอปอยู่คนละเครื่องกับ backend */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export interface ResolveDevApiBaseUrlParams {
  /** ค่าจาก EXPO_PUBLIC_API_BASE_URL */
  apiBaseUrl: string;
  /** Constants.expoConfig?.hostUri เช่น "192.168.1.5:8081" (ไม่มีตอน build จริง) */
  hostUri?: string | null;
  /** true เฉพาะตอนรัน dev server */
  isDevelopment: boolean;
  /**
   * Android emulator เข้าถึง localhost ของเครื่อง host ผ่าน 10.0.2.2
   * ส่วน emulator เองมองไม่เห็น IP วงแลนในบางเครือข่าย จึงต้องแยกเคส
   */
  isAndroidEmulator?: boolean;
}

/** ดึงเฉพาะส่วน host ออกจาก hostUri โดยตัดพอร์ตของ Metro ทิ้ง */
function hostOf(hostUri: string): string | null {
  const trimmed = hostUri.trim();

  if (!trimmed) {
    return null;
  }

  /* hostUri อาจมาพร้อม scheme หรือ path ได้ ตัดให้เหลือ authority ล้วน */
  const authority =
    trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0] ?? '';

  /* IPv6 มาในรูป [::1]:8081 — เอาเฉพาะในวงเล็บ */
  if (authority.startsWith('[')) {
    const closing = authority.indexOf(']');
    return closing > 0 ? authority.slice(0, closing + 1) : null;
  }

  return authority.split(':')[0] || null;
}

/**
 * คืน URL ที่ใช้ได้จริงบนเครื่องที่แอปกำลังรันอยู่
 *
 * ถ้าไม่เข้าเงื่อนไขใด ๆ จะคืนค่าเดิมเสมอ — ฟังก์ชันนี้ต้องไม่ทำให้
 * การตั้งค่าที่ถูกอยู่แล้วเสียหาย
 */
export function resolveDevApiBaseUrl({
  apiBaseUrl,
  hostUri,
  isDevelopment,
  isAndroidEmulator = false,
}: ResolveDevApiBaseUrlParams): string {
  if (!isDevelopment) {
    return apiBaseUrl;
  }

  let url: URL;

  try {
    url = new URL(apiBaseUrl);
  } catch {
    /* URL พังจะถูกจับโดย schema ใน env.ts อยู่แล้ว ที่นี่แค่อย่าให้ throw ซ้ำ */
    return apiBaseUrl;
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    return apiBaseUrl;
  }

  /*
   * Android emulator มี alias ตายตัวชี้กลับไปที่ host machine
   * ใช้ค่านี้ก่อน IP วงแลนเพราะทำงานได้แม้เครื่องไม่ได้ต่อ Wi-Fi เดียวกัน
   */
  if (isAndroidEmulator) {
    url.hostname = '10.0.2.2';
    return url.toString().replace(/\/+$/, '');
  }

  const lanHost = hostUri ? hostOf(hostUri) : null;

  /* ไม่รู้ IP ก็คืนค่าเดิม ดีกว่าเดาแล้วยิงผิดเครื่อง */
  if (!lanHost || LOOPBACK_HOSTS.has(lanHost)) {
    return apiBaseUrl;
  }

  url.hostname = lanHost;

  return url.toString().replace(/\/+$/, '');
}
