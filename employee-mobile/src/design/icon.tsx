import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * ไอคอนของทั้งแอป — **จุดเดียวที่เลือกชุดไอคอน**
 *
 * ## ทำไมเป็น Feather ไม่ใช่ Ionicons
 *
 * Ionicons ผสมสองบุคลิกอยู่ในชุดเดียว: บางตัวเส้นบางมน บางตัวเส้นหนากว่าและ
 * ปลายตัด พอวางเรียงกันสี่ห้าตัวบนจอเดียว (แถวทางลัด แถบเตือน แถบล่าง) น้ำหนัก
 * เส้นจะไม่เท่ากันจนดูเหมือนหยิบมาจากคนละชุด
 *
 * Feather เป็นเส้น 2px เท่ากันทุกตัว ทรงเรขาคณิต ตารางฐาน 24 เหมือนกันหมด
 * จึงเข้ากับตัวเลขและเส้นคั่นบาง ๆ ของจอนี้มากกว่า
 *
 * ## กติกา
 *
 * - **ห้าม import Feather หรือ Ionicons ตรง ๆ ในหน้าจอ** ให้ผ่าน `<Icon>` เสมอ
 *   วันที่อยากเปลี่ยนชุดอีกครั้งจะได้แก้ไฟล์เดียว
 * - Feather ไม่มีตัวทึบ (filled) — สถานะ "กำลังเลือกอยู่" ต้องบอกด้วย **สี**
 *   ไม่ใช่การสลับเป็นไอคอนทึบ
 * - ขนาดที่ใช้จริงในแอป: 17 (แถวรายการ) · 19–21 (ปุ่มไอคอน) · 23 (ทางลัด)
 */
export type IconName = ComponentProps<typeof Feather>['name'];

export interface IconProps
  extends Omit<ComponentProps<typeof Feather>, 'name' | 'size'> {
  name: IconName;
  /** ค่าเริ่มต้น 20 — ขนาดกลางที่ใช้บ่อยที่สุดในแอป */
  size?: number;
}

export function Icon({ size = 20, ...props }: IconProps) {
  return <Feather size={size} {...props} />;
}

/**
 * ลายนิ้วมือ — **ตัวเดียวในแอปที่วาดเอง เพราะ Feather ไม่มี**
 *
 * ตัวที่ใกล้ที่สุดในชุดคือแม่กุญแจ ซึ่งจอที่ต้องใช้ไอคอนนี้ (ปลดล็อก /
 * ความปลอดภัย) ใช้สื่อ "PIN" ไปแล้ว ปุ่มสองปุ่มที่ทำคนละเรื่องจะกลายเป็น
 * ไอคอนเดียวกัน
 *
 * วาดด้วยเส้นหนา 2 บนตารางฐาน 24 เท่ากับ Feather ทุกตัว วางเรียงข้างกันแล้ว
 * น้ำหนักเส้นจึงเท่ากัน
 */
export function FingerprintMark({
  color,
  size = 20,
}: {
  color: string;
  size?: number;
}) {
  const arcs = [
    'M4,14 C4,7.4 8.9,3 12,3 C15.1,3 20,7.4 20,14',
    'M7.5,15.5 C7.5,10.2 9.8,6.6 12,6.6 C14.2,6.6 16.5,10.2 16.5,15.5',
    'M11,17 C11,13.2 11.4,10.4 12,10.4 C12.6,10.4 13,13.2 13,17',
    'M6.2,18.6 C6.8,20 7.6,21.1 8.6,21.8',
    'M17.8,18.2 C17.4,19.7 16.6,20.9 15.5,21.8',
  ];

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      {arcs.map((d) => (
        <Path
          d={d}
          fill="none"
          key={d}
          stroke={color}
          strokeLinecap="round"
          strokeWidth={2}
        />
      ))}
    </Svg>
  );
}
