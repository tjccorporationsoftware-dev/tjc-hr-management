/**
 * คำนวณระยะห่างจากจุดที่อนุญาตให้ลงเวลา
 *
 * **ที่นี่ไม่ใช่ผู้ตัดสิน** — backend คำนวณระยะเองอีกครั้งตอนบันทึกและเป็นคนชี้ขาด
 * (พิกัดที่เครื่องส่งมาปลอมได้ ถ้าให้แอปตัดสินเท่ากับเชื่อ client)
 * หน้าที่ของไฟล์นี้คือบอกผู้ใช้ล่วงหน้าว่า "น่าจะกดผ่านไหม" เพื่อไม่ให้กดแล้วเด้ง
 * โดยไม่รู้สาเหตุ และเพื่อให้เดินเข้าไปใกล้ก่อนได้
 */

export type GeofenceStatus =
  /** อยู่ในรัศมีแน่นอน */
  | 'INSIDE'
  /** ความคลาดเคลื่อนของ GPS คร่อมเส้นขอบ ยังบอกไม่ได้ว่าอยู่ในหรือนอก */
  | 'UNCERTAIN'
  /** อยู่นอกรัศมีแน่นอน */
  | 'OUTSIDE'
  /** ยังไม่รู้พิกัด หรือไม่ได้บังคับพิกัด */
  | 'UNKNOWN';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceTarget extends Coordinates {
  radiusMeters: number;
}

export interface GeofenceReading extends Coordinates {
  /** ความคลาดเคลื่อนที่ระบบปฏิบัติการรายงานมา (เมตร) */
  accuracyMeters?: number | null;
}

export interface GeofenceEvaluation {
  status: GeofenceStatus;
  /** ระยะจากจุดกึ่งกลาง เป็นเมตร ปัดเป็นจำนวนเต็ม — null เมื่อคำนวณไม่ได้ */
  distanceMeters: number | null;
  /** ต้องเดินเข้าไปอีกกี่เมตรจึงจะถึงขอบรัศมี — 0 เมื่ออยู่ในแล้ว */
  metersToEdge: number;
}

const EARTH_RADIUS_METERS = 6_371_008.8;

/**
 * ความคลาดเคลื่อนที่ยอมรับได้เมื่อ OS ไม่รายงาน accuracy มา
 *
 * GPS บนมือถือกลางแจ้งอยู่ราว 5–15 เมตร ใช้ 15 เป็นค่ากลางแบบระวังไว้ก่อน
 * เพื่อไม่ให้ประกาศว่า "อยู่นอกพื้นที่" ทั้งที่ยืนอยู่หน้าออฟฟิศพอดี
 */
const ASSUMED_ACCURACY_METERS = 15;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** ระยะทางวงกลมใหญ่ (haversine) หน่วยเมตร */
export function distanceBetween(from: Coordinates, to: Coordinates): number {
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * ทิศจากจุดกึ่งกลางไปยังผู้ใช้ เป็นองศา 0–360 (0 = เหนือ, 90 = ตะวันออก)
 * ใช้วางจุดบนวงกลมแสดงรัศมีให้ตรงทิศจริง ผู้ใช้จะได้รู้ว่าต้องเดินไปทางไหน
 */
export function bearingBetween(from: Coordinates, to: Coordinates): number {
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const hasCoordinates = (point: Coordinates | null | undefined) =>
  Boolean(
    point &&
      isFiniteCoordinate(point.latitude) &&
      isFiniteCoordinate(point.longitude),
  );

/**
 * ประเมินว่าตอนนี้อยู่ในรัศมีหรือยัง
 *
 * เมื่อวงความคลาดเคลื่อนคร่อมเส้นขอบจะตอบ UNCERTAIN ไม่ฟันธงไปทางใดทางหนึ่ง
 * — ฟันธงว่า "อยู่นอก" ทั้งที่ไม่แน่ใจ จะทำให้คนที่ยืนถูกที่ไม่กล้ากดลงเวลา
 * ส่วนฟันธงว่า "อยู่ใน" จะทำให้กดแล้วโดน server ปฏิเสธโดยไม่เข้าใจ
 */
export function evaluateGeofence(
  reading: GeofenceReading | null | undefined,
  target: GeofenceTarget | null | undefined,
): GeofenceEvaluation {
  if (!hasCoordinates(reading) || !hasCoordinates(target)) {
    return { distanceMeters: null, metersToEdge: 0, status: 'UNKNOWN' };
  }

  const radius = isFiniteCoordinate(target!.radiusMeters)
    ? Math.max(target!.radiusMeters, 0)
    : 0;
  const distance = distanceBetween(reading!, target!);
  const accuracy = isFiniteCoordinate(reading!.accuracyMeters)
    ? Math.max(reading!.accuracyMeters, 0)
    : ASSUMED_ACCURACY_METERS;

  const distanceMeters = Math.round(distance);
  const metersToEdge = Math.max(Math.ceil(distance - radius), 0);

  /* วงความคลาดเคลื่อนคร่อมขอบ = ตอบไม่ได้ว่าอยู่ในหรือนอก */
  if (Math.abs(distance - radius) <= accuracy) {
    return { distanceMeters, metersToEdge, status: 'UNCERTAIN' };
  }

  return {
    distanceMeters,
    metersToEdge,
    status: distance <= radius ? 'INSIDE' : 'OUTSIDE',
  };
}

/** ระยะทางแบบอ่านง่าย — เกินหนึ่งกิโลเมตรค่อยเปลี่ยนหน่วย */
export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) {
    return '—';
  }

  if (meters < 1000) {
    return `${Math.round(meters).toLocaleString('th-TH')} ม.`;
  }

  return `${(meters / 1000).toLocaleString('th-TH', {
    maximumFractionDigits: 1,
  })} กม.`;
}
