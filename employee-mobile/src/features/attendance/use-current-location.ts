import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useCallback } from 'react';

import { captureEvent } from '@/lib/monitoring/monitoring';

import type { LocationPermission } from './punch-guidance';

export interface LocationReading {
  accuracyMeters: number | null;
  /** Android รายงานได้ว่าพิกัดมาจากแอปปลอมตำแหน่ง — ส่งต่อให้ backend เป็น risk signal */
  isMocked: boolean;
  latitude: number;
  longitude: number;
}

interface LocationSnapshot {
  permission: LocationPermission;
  reading: LocationReading | null;
}

export interface CurrentLocation {
  permission: LocationPermission;
  reading: LocationReading | null;
  isReading: boolean;
  /** ขอตำแหน่งใหม่ (ผู้ใช้กดปุ่มลองใหม่ หรือก่อนกดส่ง) */
  refresh: () => Promise<LocationReading | null>;
}

const PENDING: LocationSnapshot = { permission: 'PENDING', reading: null };

/**
 * อ่านพิกัดหนึ่งครั้ง
 *
 * ตั้งใจอ่านเป็นครั้ง ๆ ไม่ subscribe ต่อเนื่อง เพราะหน้าลงเวลาเปิดอยู่ไม่กี่วินาที
 * การ watch ตำแหน่งค้างไว้กิน battery และทำให้ไอคอน GPS ค้างบน status bar
 * ซึ่งดูเหมือนแอปตามตำแหน่งตลอดเวลาทั้งที่ไม่ได้ตาม
 *
 * ขอเฉพาะสิทธิ์ foreground — การลงเวลาเกิดจากผู้ใช้กดเอง ไม่ต้องใช้ background
 *
 * ฟังก์ชันนี้ **ไม่ throw** ทุกความล้มเหลวถูกแปลงเป็นสถานะ เพราะพิกัดอ่านไม่ได้
 * ไม่ควรทำให้จอลงเวลาเปิดไม่ขึ้น — server ตรวจพิกัดเองอีกรอบอยู่แล้ว
 */
async function readLocation(): Promise<LocationSnapshot> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { permission: 'DISABLED', reading: null };
    }

    const granted = await Location.requestForegroundPermissionsAsync();

    if (!granted.granted) {
      return { permission: 'DENIED', reading: null };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      permission: 'GRANTED',
      reading: {
        accuracyMeters: position.coords.accuracy ?? null,
        isMocked: Boolean(position.mocked),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      },
    };
  } catch (error) {
    captureEvent({
      /* redactContext ย่อ Error ให้เหลือ name/message ให้เอง */
      context: { error, scope: 'attendance.location' },
      level: 'warning',
      message: 'อ่านตำแหน่งไม่สำเร็จ',
    });

    /* มีสิทธิ์แต่จับสัญญาณไม่ได้ — จอจะบอกว่า "ยังอ่านตำแหน่งไม่ได้" */
    return { permission: 'GRANTED', reading: null };
  }
}

/**
 * ใช้ react-query แทน useState/useEffect เอง
 *
 * ได้ทั้งการยกเลิกเมื่อออกจากจอ, กันยิงซ้ำเมื่อหลายคอมโพเนนต์เรียกพร้อมกัน
 * และไม่ต้อง setState ภายใน effect ซึ่งทำให้ render ซ้อนกันโดยไม่จำเป็น
 */
export function useCurrentLocation(enabled: boolean): CurrentLocation {
  const query = useQuery({
    enabled,
    /* พิกัดเก่าตอนเปิดจอครั้งหน้าไม่มีประโยชน์ ต้องอ่านใหม่เสมอ */
    gcTime: 0,
    queryFn: readLocation,
    queryKey: ['attendance', 'current-location'],
    refetchOnMount: 'always',
    /* readLocation ไม่ throw อยู่แล้ว ลองใหม่อัตโนมัติมีแต่จะหน่วงจอ */
    retry: false,
    staleTime: 0,
  });

  const { refetch } = query;

  const refresh = useCallback(async () => {
    const result = await refetch();

    return result.data?.reading ?? null;
  }, [refetch]);

  const snapshot = enabled ? (query.data ?? PENDING) : PENDING;

  return {
    isReading: enabled && query.isFetching,
    permission: snapshot.permission,
    reading: snapshot.reading,
    refresh,
  };
}
