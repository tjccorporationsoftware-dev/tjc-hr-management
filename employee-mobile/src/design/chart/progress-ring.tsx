import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '@/theme/use-app-theme';

export interface ProgressRingProps {
  /** 0–1 เกินหนึ่งจะถูกตัดที่เต็มวง */
  value: number;
  size?: number;
  thickness?: number;
  /** สีของส่วนที่เต็ม — ควรสื่อระดับ (ปกติ/เตือน/อันตราย) */
  color?: string;
  /** เนื้อหาตรงกลางวง เช่นตัวเลขกับป้าย */
  children?: ReactNode;
}

/**
 * วงแหวนแสดงความคืบหน้าเทียบเพดาน
 *
 * ใช้เมื่อมี "เพดาน" ที่มีความหมายจริง เช่นสัดส่วนวันที่มาปกติจากวันทำงานทั้งเดือน
 * ถ้าไม่มีเพดาน (เช่นยอดเงิน) ห้ามใช้วงแหวน เพราะจะสื่อว่ามีเป้าหมายทั้งที่ไม่มี
 *
 * รางของวงใช้สีเดียวกันแบบจาง ไม่ใช่สีเทากลาง เพื่อให้อ่านสถานะได้ทั้งวง
 * ตัวเลขจริงอยู่ตรงกลางเสมอ — วงแหวนเป็นตัวช่วยอ่าน ไม่ใช่ตัวเก็บข้อมูล
 */
export function ProgressRing({
  value,
  size = 96,
  thickness = 8,
  color,
  children,
}: ProgressRingProps) {
  const { theme } = useAppTheme();
  const tint = color ?? theme.colors.primary;

  const ratio = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={{ height: size, width: size }}>
      <Svg height={size} width={size}>
        {/* ราง — เฉดจางของสีเดียวกัน */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={tint}
          strokeOpacity={0.16}
          strokeWidth={thickness}
        />

        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={tint}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          strokeLinecap="round"
          strokeWidth={thickness}
          /* เริ่มที่ 12 นาฬิกา ไม่ใช่ 3 นาฬิกา */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View
        style={{
          alignItems: 'center',
          bottom: 0,
          justifyContent: 'center',
          left: 0,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      >
        {children}
      </View>
    </View>
  );
}
