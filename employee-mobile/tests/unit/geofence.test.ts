import {
  bearingBetween,
  distanceBetween,
  evaluateGeofence,
  formatDistance,
} from '@/features/attendance/geofence';

/**
 * เลขพวกนี้ผิดแล้วผู้ใช้เห็นว่า "อยู่นอกพื้นที่" ทั้งที่ยืนอยู่หน้าออฟฟิศ
 * แล้วจะไม่กล้ากดลงเวลา — ต้องมีเทสคุมทั้งค่าและทิศ
 */

/* สำนักงานสมมติกลางกรุงเทพ */
const OFFICE = { latitude: 13.7563, longitude: 100.5018 };

describe('distanceBetween', () => {
  it('จุดเดียวกันต้องได้ศูนย์', () => {
    expect(distanceBetween(OFFICE, OFFICE)).toBe(0);
  });

  /* 0.001 องศาละติจูด ≈ 111 เมตร ที่ทุกละติจูด */
  it('ระยะตามแนวเหนือใต้ต้องใกล้เคียง 111 เมตรต่อ 0.001 องศา', () => {
    const north = { latitude: 13.7573, longitude: 100.5018 };

    expect(distanceBetween(OFFICE, north)).toBeCloseTo(111, 0);
  });

  it('สลับต้นทางปลายทางต้องได้ระยะเท่ากัน', () => {
    const other = { latitude: 13.76, longitude: 100.51 };

    expect(distanceBetween(OFFICE, other)).toBeCloseTo(
      distanceBetween(other, OFFICE),
      6,
    );
  });
});

describe('bearingBetween', () => {
  it('ชี้ทิศได้ถูกทั้งสี่ทาง', () => {
    expect(
      bearingBetween(OFFICE, { latitude: 13.7663, longitude: 100.5018 }),
    ).toBeCloseTo(0, 0);
    expect(
      bearingBetween(OFFICE, { latitude: 13.7563, longitude: 100.5118 }),
    ).toBeCloseTo(90, 0);
    expect(
      bearingBetween(OFFICE, { latitude: 13.7463, longitude: 100.5018 }),
    ).toBeCloseTo(180, 0);
    expect(
      bearingBetween(OFFICE, { latitude: 13.7563, longitude: 100.4918 }),
    ).toBeCloseTo(270, 0);
  });
});

describe('evaluateGeofence', () => {
  const target = { ...OFFICE, radiusMeters: 100 };

  it('ยืนตรงกลางพอดีและ GPS แม่น ต้องได้ INSIDE', () => {
    const result = evaluateGeofence({ ...OFFICE, accuracyMeters: 5 }, target);

    expect(result.status).toBe('INSIDE');
    expect(result.distanceMeters).toBe(0);
    expect(result.metersToEdge).toBe(0);
  });

  it('อยู่ไกลเกินรัศมีชัดเจน ต้องได้ OUTSIDE พร้อมระยะที่ต้องเดินเพิ่ม', () => {
    /* ห่างไปทางเหนือราว 555 เมตร */
    const result = evaluateGeofence(
      { accuracyMeters: 5, latitude: 13.7613, longitude: 100.5018 },
      target,
    );

    expect(result.status).toBe('OUTSIDE');
    expect(result.distanceMeters).toBeGreaterThan(500);
    expect(result.metersToEdge).toBeGreaterThan(400);
  });

  /*
   * หัวใจของฟังก์ชันนี้ — ยืนคร่อมขอบพอดีต้องไม่ฟันธง
   * ฟันธงผิดทางไหนก็ทำให้ผู้ใช้เสียประโยชน์
   */
  it('ความคลาดเคลื่อนคร่อมเส้นขอบ ต้องได้ UNCERTAIN ไม่ใช่ OUTSIDE', () => {
    /* ห่าง ~111 เมตร รัศมี 100 ความคลาดเคลื่อน 30 → คร่อมขอบ */
    const result = evaluateGeofence(
      { accuracyMeters: 30, latitude: 13.7573, longitude: 100.5018 },
      target,
    );

    expect(result.status).toBe('UNCERTAIN');
  });

  it('อยู่ในรัศมีแต่ GPS หยาบมากจนคร่อมขอบ ก็ต้องได้ UNCERTAIN', () => {
    const result = evaluateGeofence(
      { accuracyMeters: 80, latitude: 13.75665, longitude: 100.5018 },
      target,
    );

    expect(result.status).toBe('UNCERTAIN');
  });

  it('ไม่ส่ง accuracy มาต้องเดาแบบระวังไว้ก่อน ไม่ใช่ถือว่าแม่นยำ', () => {
    /* ห่าง ~111 เมตร รัศมี 100 → ต่างกัน 11 เมตร ซึ่งน้อยกว่าค่าเดา 15 */
    const result = evaluateGeofence(
      { latitude: 13.7573, longitude: 100.5018 },
      target,
    );

    expect(result.status).toBe('UNCERTAIN');
  });

  it('ไม่รู้พิกัดหรือไม่มีจุดอ้างอิง ต้องได้ UNKNOWN ไม่ใช่ OUTSIDE', () => {
    expect(evaluateGeofence(null, target).status).toBe('UNKNOWN');
    expect(evaluateGeofence({ ...OFFICE }, null).status).toBe('UNKNOWN');
  });

  it('พิกัดที่ไม่ใช่ตัวเลขต้องไม่ทำให้คำนวณเพี้ยน', () => {
    const result = evaluateGeofence(
      { latitude: Number.NaN, longitude: 100.5018 },
      target,
    );

    expect(result.status).toBe('UNKNOWN');
    expect(result.distanceMeters).toBeNull();
  });
});

describe('formatDistance', () => {
  it('ต่ำกว่าหนึ่งกิโลเมตรใช้หน่วยเมตร', () => {
    expect(formatDistance(0)).toBe('0 ม.');
    expect(formatDistance(742.4)).toBe('742 ม.');
  });

  it('ตั้งแต่หนึ่งกิโลเมตรขึ้นไปเปลี่ยนหน่วย', () => {
    expect(formatDistance(1500)).toBe('1.5 กม.');
  });

  it('ไม่มีค่าต้องไม่แสดงเลขมั่ว', () => {
    expect(formatDistance(null)).toBe('—');
    expect(formatDistance(Number.NaN)).toBe('—');
  });
});
