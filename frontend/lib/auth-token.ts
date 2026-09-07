const ACCESS_TOKEN_KEY = "hr_access_token";

export const AUTH_FORCE_LOGOUT_EVENT = "hr_auth_force_logout";
export const AUTH_FORCE_LOGOUT_STORAGE_KEY = "hr_auth_force_logout_at";

function getBrowserStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function clearLegacyPersistentToken() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ไม่ให้ token cleanup ทำให้ UI ล่มถ้า browser จำกัด storage
  }
}

export function getAccessToken() {
  const storage = getBrowserStorage();

  if (!storage) return null;

  const token = storage.getItem(ACCESS_TOKEN_KEY);

  if (token) {
    return token;
  }

  // migration จาก version เก่าที่เคยเก็บ access token ใน localStorage
  // อ่านครั้งเดียวแล้วย้ายเข้า sessionStorage เพื่อลดความเสี่ยง token ค้างถาวร
  try {
    const legacyToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);

    if (legacyToken) {
      storage.setItem(ACCESS_TOKEN_KEY, legacyToken);
      clearLegacyPersistentToken();
      return legacyToken;
    }
  } catch {
    // ignore legacy migration failure
  }

  return null;
}

export function setAccessToken(token: string) {
  const storage = getBrowserStorage();

  if (!storage) return;

  storage.setItem(ACCESS_TOKEN_KEY, token);
  clearLegacyPersistentToken();
}

export function clearAccessToken() {
  const storage = getBrowserStorage();

  if (storage) {
    storage.removeItem(ACCESS_TOKEN_KEY);
  }

  clearLegacyPersistentToken();
}

export function forceLogoutClient(reason = "SESSION_EXPIRED") {
  if (typeof window === "undefined") return;

  clearAccessToken();

  const payload = JSON.stringify({
    reason,
    at: Date.now(),
  });

  // ใช้ localStorage เฉพาะ broadcast event ข้าม tab เท่านั้น ไม่เก็บ access token ถาวร
  window.localStorage.setItem(AUTH_FORCE_LOGOUT_STORAGE_KEY, payload);

  // แจ้ง tab ปัจจุบัน
  window.dispatchEvent(
    new CustomEvent(AUTH_FORCE_LOGOUT_EVENT, {
      detail: {
        reason,
      },
    }),
  );
}
