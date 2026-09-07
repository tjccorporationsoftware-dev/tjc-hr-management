import { ApiError } from './api-error';
import { createRequestId } from './request-id';

type IdempotentMutationParams<T> = {
  /** ชื่อ operation คงที่ เช่น request:create หรือ approval:approve */
  scope: string;
  /** ข้อมูลที่นิยาม user intent — ต้องไม่ใส่ค่าชั่วคราวเช่น requestId header */
  payload?: unknown;
  execute: (idempotencyKey: string) => Promise<T>;
};

type IntentKeyState = {
  key: string;
  /** หลังสำเร็จเก็บ key สั้น ๆ เพื่อดูด double tap ที่มาช้ากว่า response แรก */
  reuseUntil: number | null;
};

const SUCCESS_REUSE_GRACE_MS = 5_000;
const pendingKeys = new Map<string, IntentKeyState>();

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

function intentFingerprint(scope: string, payload: unknown) {
  return `${scope}:${JSON.stringify(sortValue(payload) ?? null)}`;
}

function shouldKeepKey(error: unknown) {
  if (!(error instanceof ApiError)) return false;

  return (
    error.isNetworkError ||
    error.isTimeout ||
    error.code === 'REQUEST_ABORTED' ||
    error.code === 'IDEMPOTENCY_IN_PROGRESS'
  );
}

function resolveIntentKey(fingerprint: string) {
  const existing = pendingKeys.get(fingerprint);
  const now = Date.now();

  if (
    existing &&
    (existing.reuseUntil === null || existing.reuseUntil > now)
  ) {
    return existing.key;
  }

  if (existing) pendingKeys.delete(fingerprint);

  const key = createRequestId();
  pendingKeys.set(fingerprint, { key, reuseUntil: null });
  return key;
}

/**
 * ใช้ key เดิมกับ retry ของ intent เดิม และให้ Server เป็นผู้ตัดสิน replay
 *
 * หลัง response สำเร็จยังคง key ไว้ 5 วินาทีเพื่อดูด double tap ที่เข้ามาช้ากว่า
 * response แรก จากนั้น intent เดิมสามารถเริ่มรอบใหม่ด้วย key ใหม่ได้ตามปกติ
 */
export async function runIdempotentMutation<T>(
  params: IdempotentMutationParams<T>,
): Promise<T> {
  const fingerprint = intentFingerprint(params.scope, params.payload);
  const key = resolveIntentKey(fingerprint);

  try {
    const result = await params.execute(key);
    pendingKeys.set(fingerprint, {
      key,
      reuseUntil: Date.now() + SUCCESS_REUSE_GRACE_MS,
    });
    return result;
  } catch (error) {
    if (shouldKeepKey(error)) {
      // ผลยังไม่แน่นอน ต้อง retry ด้วย key เดิมจนกว่า Server จะยืนยัน REPLAY/ผลจริง
      pendingKeys.set(fingerprint, { key, reuseUntil: null });
    } else if (pendingKeys.get(fingerprint)?.key === key) {
      pendingKeys.delete(fingerprint);
    }

    throw error;
  }
}

/** เฉพาะ test — ไม่ export state จริงออกไปให้ feature ใช้ */
export function __resetIdempotencyForTests() {
  pendingKeys.clear();
}
