import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { Text, type IconName } from '@/design';
import { AURORA } from '@/design/aurora';

import {
  bearingBetween,
  type Coordinates,
  type GeofenceStatus,
} from './geofence';
import type { GeofenceLocation } from './punch.types';

/**
 * แผนที่จุดลงเวลา — เต็มกล่องสี่เหลี่ยม ตึกบริษัทอยู่กลาง วงรัศมีที่ HR ตั้งไว้
 * ล้อมรอบ และจุดของผู้ใช้วางตามทิศกับระยะจริง
 *
 * เดิมส่วนนี้เป็นแค่วงไอคอนกับข้อความ "ห่าง 32 ม." ซึ่งบอกตัวเลขได้ แต่ไม่ได้
 * บอกสิ่งที่คนยืนอยู่หน้าออฟฟิศอยากรู้จริง ๆ คือ "ต้องเดินไปทางไหนถึงจะกดได้"
 * พอวางจุดตามทิศจริงบนวงรัศมี คำถามนั้นตอบได้จากภาพเดียว
 *
 * **ที่นี่ไม่ใช่ผู้ตัดสิน** — backend คำนวณระยะเองอีกครั้งตอนบันทึกและเป็นคน
 * ชี้ขาด ภาพนี้มีไว้ให้ผู้ใช้เห็นล่วงหน้าเท่านั้น (ดูหมายเหตุใน geofence.ts)
 */

/** สี ป้าย และไอคอนของแต่ละสถานะ — สีหยิบจากจานสีของแอป ไม่ใช่เลขสีดิบ */
export const GEOFENCE_STATUS: Record<
  GeofenceStatus,
  { color: string; icon: IconName; label: string }
> = {
  INSIDE: { color: AURORA.emerald, icon: 'check-circle', label: 'อยู่ในพื้นที่' },
  OUTSIDE: { color: AURORA.rose, icon: 'x-circle', label: 'อยู่นอกพื้นที่' },
  UNCERTAIN: {
    color: AURORA.amber,
    icon: 'navigation',
    label: 'ตำแหน่งยังไม่แม่น',
  },
  UNKNOWN: {
    color: AURORA.textFaint,
    icon: 'map-pin',
    label: 'กำลังหาตำแหน่ง',
  },
};

/** ช่องหน้าต่างของตึก — [x, y] ในระบบพิกัด 24×24 ของ `CompanyMark` */
const MARK_WINDOWS: [number, number][] = [
  [4.2, 10.6],
  [7.4, 10.6],
  [4.2, 13.6],
  [7.4, 13.6],
  [4.2, 16.6],
  [7.4, 16.6],
  [14.2, 6.2],
  [17.6, 6.2],
  [14.2, 9.2],
  [17.6, 9.2],
  [14.2, 12.2],
  [17.6, 12.2],
  [14.2, 15.2],
  [17.6, 15.2],
];

/**
 * ตึกบริษัท — วาดเป็นรูปทรงเอง ไม่ได้หยิบจากชุดไอคอน
 *
 * Feather ไม่มีไอคอนตึกเลย (มีแค่ `home` ที่เป็นบ้านหลังเดียว กับ `briefcase`
 * ที่เป็นกระเป๋า) และ Ionicons ห้ามใช้ในจอที่ย้ายมาผิวออโรราแล้ว จึงวาดเป็น
 * สี่เหลี่ยมไม่กี่ชิ้น: ตึกเตี้ยซ้าย ตึกสูงขวา หน้าต่างเป็นช่องขาว และฐานยาว
 */
export function CompanyMark({ size }: { size: number }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Rect
        fill={AURORA.accent}
        height={12.2}
        rx={1}
        width={8.6}
        x={2.4}
        y={8.4}
      />
      <Rect
        fill={AURORA.accent}
        height={16.6}
        rx={1}
        width={9.2}
        x={12.4}
        y={4}
      />
      <Rect fill={AURORA.accent} height={1.8} rx={0.7} width={22} x={1} y={20.4} />

      {MARK_WINDOWS.map(([x, y]) => (
        <Rect
          key={`${x}-${y}`}
          fill={AURORA.baseDeep}
          height={1.7}
          rx={0.4}
          width={2.2}
          x={x}
          y={y}
        />
      ))}
    </Svg>
  );
}

/** รัศมีที่วาดขอบเขตที่อนุญาต — คงที่เสมอ ไม่ว่านโยบายจะตั้งกี่เมตร */
const ALLOWED_RADIUS_PX = 44;

/** กรอบของวงกลมทั้งชุด เผื่อที่ให้จุดที่อยู่นอกเขตยังวาดได้ */
const CIRCLE_BOX = ALLOWED_RADIUS_PX * 2 + 40;

/**
 * ทองของตราบริษัท — **สีเดียวในไฟล์นี้ที่ไม่ได้มาจาก `AURORA`**
 *
 * จานสีของแอปเป็นฟ้า–ขาวล้วน ไม่มีทองอยู่ในนั้นและไม่ควรมี เพราะทองที่นี่ไม่ใช่
 * สีของระบบ แต่เป็นสีของ "ตราบริษัท" เหมือนไฟล์โลโก้ใน assets ซึ่งอยู่นอกจานสี
 * เช่นกัน หยิบมาจากตัวอักษรของตราองค์กร (`assets/logo-wordmark.png`)
 */
const BRAND_GOLD = '#cf9a2e';

/** ความสูงของถนนกับความกว้างของรถบรรทุกบนแผนที่แบบลงเวลาได้ทุกที่ */
const ROAD_HEIGHT = 44;
const TRUCK_WIDTH = 116;
const TRUCK_HEIGHT = 54;

/**
 * อาคารรายรอบ — [ซ้าย%, บน%, กว้าง, สูง]
 *
 * เกาะอยู่ตามริมแผนที่ ไม่มีหลังไหนอยู่กลาง เพราะกลางเป็นที่ของวงเขตกับตึก
 * บริษัท และครึ่งล่างมีแผ่นข้อมูลทับ — อาคารมีหน้าที่ทำให้รอบ ๆ ไม่ว่างเปล่า
 * ไม่ใช่มาแย่งอ่านกับของจริง
 */
const BLOCKS: [`${number}%`, `${number}%`, number, number][] = [
  ['3%', '7%', 20, 15],
  ['3%', '33%', 24, 18],
  ['4%', '58%', 18, 13],
  ['30%', '4%', 23, 12],
  ['57%', '3%', 17, 14],
  ['81%', '9%', 20, 23],
  ['88%', '43%', 16, 19],
  ['70%', '56%', 24, 14],
  ['34%', '60%', 19, 12],
];

/** ต้นไม้ — [ซ้าย%, บน%] แทรกตามช่องว่างระหว่างอาคาร */
const TREES: [`${number}%`, `${number}%`][] = [
  ['24%', '24%'],
  ['62%', '20%'],
  ['93%', '25%'],
  ['15%', '50%'],
  ['48%', '6%'],
  ['78%', '36%'],
  ['27%', '48%'],
  ['85%', '65%'],
];

export interface GeofenceMapSurfaceProps {
  distanceMeters: number | null;
  reading: Coordinates | null;
  status: GeofenceStatus;
  target: GeofenceLocation;
}

/**
 * ผิวแผนที่ที่กินพื้นที่พ่อแม่ทั้งใบ — ใช้กับกล่องสี่เหลี่ยมที่ `overflow: 'hidden'`
 *
 * ถนน อาคาร และต้นไม้วางด้วยตำแหน่งเป็นเปอร์เซ็นต์ จึงไม่ต้องวัดความกว้างของ
 * กล่องเลย ส่วนวงกลมทุกวงอยู่ใน SVG ขนาดคงที่ที่ยึดกลางกล่องด้วย `translate`
 * — ถ้าเอาไปวาดใน SVG ที่ยืดเต็มกล่อง วงกลมจะกลายเป็นวงรีทันที
 */
export function GeofenceMapSurface({
  distanceMeters,
  reading,
  status,
  target,
}: GeofenceMapSurfaceProps) {
  const center = CIRCLE_BOX / 2;

  /*
   * สเกลผูกกับรัศมีที่ตั้งไว้ ไม่ใช่ระยะคงที่ — วงประจึงอยู่ที่เดิมเสมอไม่ว่า
   * นโยบายจะตั้งไว้ 50 หรือ 500 เมตร และผู้ใช้อ่าน "ใน/นอก" ได้จากตำแหน่งจุด
   * เทียบวงประอย่างเดียว
   */
  const scale = ALLOWED_RADIUS_PX / Math.max(target.radiusMeters, 1);

  /* ทิศจริงจากจุดลงเวลาไปหาผู้ใช้ 0 = เหนือ แล้วเดินตามเข็ม */
  const bearing = reading ? bearingBetween(target, reading) : null;
  const radians = ((bearing ?? 0) * Math.PI) / 180;

  /* ไกลเกินกรอบก็หนีบไว้ที่ขอบ ดีกว่าวาดจุดหลุดออกไปนอกกรอบ */
  const dotRadius =
    distanceMeters === null
      ? null
      : Math.min(distanceMeters * scale, ALLOWED_RADIUS_PX + 16);

  const dot =
    dotRadius === null
      ? null
      : {
          x: center + dotRadius * Math.sin(radians),
          y: center - dotRadius * Math.cos(radians),
        };

  const color = GEOFENCE_STATUS[status].color;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: AURORA.base }]}
      />

      {/*
        ถนนสองสายตัดกัน — เหลือไว้แค่สองสาย ไม่ใช่ตารางถี่ ๆ แบบเดิม ตารางทำให้
        ทั้งแผ่นอ่านเป็นกระดาษกราฟ ส่วนถนนสองสายพอบอกว่านี่คือแผนที่แล้ว
      */}
      <View
        style={{
          backgroundColor: AURORA.baseDeep,
          bottom: 0,
          left: '17%',
          position: 'absolute',
          top: 0,
          width: 16,
        }}
      />
      <View
        style={{
          backgroundColor: AURORA.baseDeep,
          height: 16,
          left: 0,
          position: 'absolute',
          right: 0,
          top: '20%',
        }}
      />

      {/* อาคารรายรอบ — ฟ้าทึบพอให้เห็นเป็นก้อน มีขอบบนเข้มกว่าเป็นหลังคา */}
      {BLOCKS.map(([left, top, width, height]) => (
        <View
          key={`${left}-${top}`}
          style={{
            backgroundColor: `${AURORA.accent}33`,
            borderRadius: 4,
            borderTopColor: `${AURORA.accent}59`,
            borderTopWidth: 2,
            height,
            left,
            position: 'absolute',
            top,
            width,
          }}
        />
      ))}

      {/* ต้นไม้ — พุ่มกลมเขียวสดกับลำต้นสั้น ๆ */}
      {TREES.map(([left, top]) => (
        <View
          key={`${left}-${top}`}
          style={{ alignItems: 'center', left, position: 'absolute', top }}
        >
          <View
            style={{
              backgroundColor: `${AURORA.emerald}80`,
              borderRadius: 999,
              height: 9,
              width: 9,
            }}
          />
          <View
            style={{
              backgroundColor: `${AURORA.emerald}80`,
              height: 3,
              width: 2,
            }}
          />
        </View>
      ))}

      {/*
        จุดกึ่งกลางของแผนที่อยู่ที่ 42% ของความสูง ไม่ใช่ 50% — ครึ่งล่างของกล่อง
        มีแผ่นข้อมูลทับอยู่ ถ้ายึดกลางจริงตึกจะไปจมอยู่ใต้แผ่นนั้น
      */}
      <View
        style={{
          alignItems: 'center',
          height: CIRCLE_BOX,
          justifyContent: 'center',
          left: '50%',
          position: 'absolute',
          top: '42%',
          transform: [
            { translateX: -CIRCLE_BOX / 2 },
            { translateY: -CIRCLE_BOX / 2 },
          ],
          width: CIRCLE_BOX,
        }}
      >
        <Svg
          height={CIRCLE_BOX}
          style={{ position: 'absolute' }}
          width={CIRCLE_BOX}
        >
          {/*
            เขตที่อนุญาต — พื้นฟ้าทึบพอให้เห็นเป็นก้อนสี ขอบเป็นเส้นทึบหนา
            ไม่ใช่เส้นประ เส้นประอ่านเป็น "เส้นร่าง" ซึ่งดูไม่จบงาน
          */}
          <Circle
            cx={center}
            cy={center}
            fill={`${AURORA.accent}1f`}
            r={ALLOWED_RADIUS_PX}
            stroke={AURORA.accent}
            strokeWidth={2.5}
          />

        </Svg>

        {/* ตึกอยู่ในวงขาวกลางแผนที่ = จุดที่ HR ปักไว้ให้ลงเวลา */}
        <View
          style={{
            alignItems: 'center',
            backgroundColor: AURORA.baseDeep,
            borderRadius: 999,
            elevation: 3,
            height: 38,
            justifyContent: 'center',
            shadowColor: AURORA.accent,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.22,
            shadowRadius: 7,
            width: 38,
          }}
        >
          <CompanyMark size={21} />
        </View>

        {/*
          จุดของผู้ใช้อยู่ชั้นบนสุด — วาดใน SVG ของตัวเองที่ซ้อนทับทั้งวงเขต
          และตึกบริษัท

          ตอนอยู่ในเขตพอดี จุดกับตึกทับกันเกือบสนิท ถ้าจุดอยู่ชั้นล่างมันจะ
          หายไปใต้วงขาวของตึกทั้งดวง แล้วภาพจะกลายเป็น "ไม่รู้ว่าเราอยู่ไหน"
          ในจังหวะที่สำคัญที่สุดคือตอนกำลังจะกดลงเวลา

          `pointerEvents: 'none'` เพราะเป็นภาพล้วน ห้ามไปกินการแตะของแผ่น
          ข้อมูลที่วางทับอยู่
        */}
        {dot ? (
          <Svg
            height={CIRCLE_BOX}
            pointerEvents="none"
            style={{ position: 'absolute' }}
            width={CIRCLE_BOX}
          >
            <Circle cx={dot.x} cy={dot.y} fill={`${color}2e`} r={13} />
            <Circle
              cx={dot.x}
              cy={dot.y}
              fill={color}
              r={5.5}
              stroke={AURORA.baseDeep}
              strokeWidth={2.5}
            />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/**
 * ผิวแผนที่สำหรับคนที่ลงเวลาได้ทุกที่ — **ถนนกับรถ ไม่ใช่วงเขต**
 *
 * พนักงานกลุ่มนี้ไม่มีเขตให้เข้าหรือออก การเอาแผนที่วงเขตมาใช้ซ้ำจึงสื่อผิด
 * ตั้งแต่ภาพแรก (จุดสีแดงอยู่นอกวง ทั้งที่ไม่ได้ทำอะไรผิด) ภาพนี้เล่าเรื่อง
 * ของเขาแทน: ออกไปทำงานข้างนอก แล้วกดลงเวลาจากตรงนั้นได้เลย
 *
 * ไม่รับ props เลยเพราะไม่มีอะไรต้องคำนวณ — ตำแหน่งจริงของคนกลุ่มนี้ไม่มีผล
 * ต่อการลงเวลา (เก็บไว้เป็นหลักฐานอย่างเดียว) ภาพจึงเป็นภาพประกอบล้วน ๆ
 */
export function OffsiteMapSurface() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: AURORA.base }]}
      />

      {/* อาคารกับต้นไม้ริมทาง ใช้ชุดเดียวกับแผนที่อีกแบบ แต่เอาเฉพาะครึ่งบน */}
      {BLOCKS.slice(0, 6).map(([left, top, width, height]) => (
        <View
          key={`${left}-${top}`}
          style={{
            backgroundColor: `${AURORA.accent}33`,
            borderRadius: 4,
            borderTopColor: `${AURORA.accent}59`,
            borderTopWidth: 2,
            height,
            left,
            position: 'absolute',
            top,
            width,
          }}
        />
      ))}
      {TREES.slice(0, 5).map(([left, top]) => (
        <View
          key={`${left}-${top}`}
          style={{ alignItems: 'center', left, position: 'absolute', top }}
        >
          <View
            style={{
              backgroundColor: `${AURORA.emerald}80`,
              borderRadius: 999,
              height: 9,
              width: 9,
            }}
          />
          <View
            style={{ backgroundColor: `${AURORA.emerald}80`, height: 3, width: 2 }}
          />
        </View>
      ))}

      {/* ถนนพาดขวางทั้งแผ่น พร้อมเส้นแบ่งเลนประตรงกลาง */}
      <View
        style={{
          backgroundColor: AURORA.baseDeep,
          height: ROAD_HEIGHT,
          left: 0,
          position: 'absolute',
          right: 0,
          top: '44%',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 11,
            left: 0,
            position: 'absolute',
            right: 0,
            top: ROAD_HEIGHT / 2 - 1,
          }}
        >
          {Array.from({ length: 16 }, (_, index) => (
            <View
              key={index}
              style={{
                backgroundColor: AURORA.textFaint,
                height: 2,
                opacity: 0.45,
                width: 15,
              }}
            />
          ))}
        </View>
      </View>

      {/*
        รถบรรทุกวิ่งอยู่กลางถนน — ยึดกลางด้วย `translateX` จึงไม่ต้องวัดความกว้างจอ

        เงาใต้รถวาดเป็นวงรีจาง ๆ ไม่ใช่ `shadow` ของ RN เพราะ `shadow` บน
        Android ต้องพึ่ง `elevation` ซึ่งจะยกทั้งกล่องขึ้นมาทับแผ่นข้อมูลด้วย
      */}
      <View
        style={{
          left: '50%',
          position: 'absolute',
          top: '44%',
          transform: [{ translateX: -TRUCK_WIDTH / 2 }, { translateY: 2 }],
        }}
      >
        {/*
          `scaleX: -1` กลับด้านทั้งคันให้หัวรถอยู่ทางซ้าย — ง่ายและปลอดภัยกว่า
          การไปสลับพิกัดทุกชิ้นในภาพ ซึ่งต้องคำนวณใหม่หมดและพลาดง่าย

          ตัวกลับด้านอยู่ชั้นในสุด **เฉพาะรูปรถ** ไม่ครอบชื่อบนตู้ ไม่งั้น
          ตัวอักษรจะกลับด้านตามไปด้วยจนอ่านไม่ออก
        */}
        <View style={{ transform: [{ scaleX: -1 }] }}>
        {/*
          รถบรรทุกตู้ทึบแบบในภาพอ้างอิง — **ตัวรถสีฟ้า ขอบน้ำเงินเข้ม กระจกกับ
          รายละเอียดเป็นสีขาว** ตัวถังขาวรอบก่อนกลืนไปกับแผ่นข้อมูลสีขาวที่วาง
          ทับอยู่ใต้แผนที่ พอถมสีฟ้าของแบรนด์ทั้งคัน รถกลายเป็นของชิ้นเดียวที่
          เด่นบนถนน และยังอยู่ในโทนฟ้า–ขาวของแอปเหมือนเดิม

          สัดส่วนหลักที่ทำให้ดูเป็นรถบรรทุก: ตู้ยาวเกินครึ่งคัน หัวเก๋งสั้นและ
          เตี้ยกว่าตู้เล็กน้อย กระจกหน้าลาดไปข้างหน้า และคานแชสซีเชื่อมตู้กับ
          หัวเก๋งเป็นเส้นเดียวกันตลอดคัน
        */}
        <Svg height={TRUCK_HEIGHT} viewBox="0 0 120 56" width={TRUCK_WIDTH}>
          <Ellipse
            cx={60}
            cy={49.5}
            fill={AURORA.text}
            opacity={0.09}
            rx={52}
            ry={3}
          />

          {/* ตู้บรรทุก — ฟ้าทึบขอบน้ำเงินเข้ม มีเส้นแบ่งบานประตูสองเส้น */}
          <Rect
            fill={AURORA.accentEnd}
            height={32}
            rx={2}
            stroke={AURORA.accent}
            strokeWidth={2}
            width={62}
            x={4}
            y={6}
          />
          <Path
            d="M25,8 L25,36 M46,8 L46,36"
            stroke={AURORA.baseDeep}
            strokeOpacity={0.45}
            strokeWidth={1.4}
          />
          {/*
            แถบขาวข้างตู้ที่รองชื่อบริษัท — ทองบนฟ้าคอนทราสต์ต่ำเกินจะอ่านออก
            พอมีแถบขาวรอง ตัวอักษรกลับมาชัดและยังอ่านเป็นสติกเกอร์ข้างรถจริง

            พิกัด x=38 คือกึ่งกลางของแถบ *ก่อน* กลับด้าน ซึ่งตรงกับ 82 ที่ตัว
            อักษรใช้หลังกลับด้านแล้ว (120 − 82)
          */}
          <Rect
            fill={AURORA.baseDeep}
            height={17}
            rx={2}
            width={44}
            x={16}
            y={13.5}
          />

          {/*
            หัวเก๋ง — ชนตู้พอดีที่ x=66 ไม่มีช่องว่างคั่น และหลังคาต่ำกว่าตู้
            แค่ 3 หน่วย (เดิม 6) สองอย่างนี้คือสิ่งที่ทำให้ก่อนหน้านี้ดูเหมือน
            เอาหัวรถมาต่อไว้ห่าง ๆ แทนที่จะเป็นรถคันเดียวกัน
          */}
          <Path
            d="M66,38 L66,13 C66,10.8 67.8,9 70,9 L92,9 L104,20 L110,20 C112.2,20 114,21.8 114,24 L114,38 Z"
            fill={AURORA.accentEnd}
            stroke={AURORA.accent}
            strokeWidth={2}
          />
          {/*
            กระจกหน้าลาดไปข้างหน้า กับกระจกข้างของประตูคนขับ — สลับมาเป็นสีขาว
            เพราะบนตัวถังสีฟ้า กระจกสีฟ้าเดิมจะจมหายไปกับตัวรถทั้งบาน
          */}
          <Path d="M93,11 L103,20.5 L93,20.5 Z" fill={AURORA.baseDeep} />
          <Rect
            fill={AURORA.baseDeep}
            fillOpacity={0.85}
            height={9}
            rx={1.5}
            width={13}
            x={72}
            y={12}
          />
          {/* กันชนกับไฟหน้า */}
          <Rect
            fill={AURORA.accent}
            height={7}
            rx={2}
            width={16}
            x={98}
            y={30}
          />
          <Circle cx={110} cy={27} fill={AURORA.baseDeep} r={2} />

          {/* คานแชสซีเชื่อมตลอดคัน — เส้นเดียวที่ทำให้ตู้กับหัวเก๋งเป็นคันเดียวกัน */}
          <Rect
            fill={AURORA.accent}
            height={4}
            rx={1}
            width={104}
            x={6}
            y={37}
          />

          {/* ล้อคู่หลังกับล้อหน้า — สามล้อคืออัตราส่วนที่อ่านเป็นรถบรรทุก */}
          <Circle cx={22} cy={40} fill={AURORA.text} r={7} />
          <Circle cx={22} cy={40} fill={AURORA.baseDeep} r={2.8} />
          <Circle cx={44} cy={40} fill={AURORA.text} r={7} />
          <Circle cx={44} cy={40} fill={AURORA.baseDeep} r={2.8} />
          <Circle cx={99} cy={40} fill={AURORA.text} r={7} />
          <Circle cx={99} cy={40} fill={AURORA.baseDeep} r={2.8} />
          </Svg>
        </View>

        {/*
          ชื่อบริษัทบนข้างตู้ — อยู่นอกชั้นที่กลับด้าน ตัวอักษรจึงอ่านได้ปกติ

          ตำแหน่งคิดจากพิกัดในภาพหลังกลับด้าน: ตู้กินช่วง x 4–66 ของกรอบ 120
          พอกลับด้านแล้วไปอยู่ 54–116 กึ่งกลางจึงตกที่ ~82 หน่วย คูณอัตราส่วน
          ของจอ (TRUCK_WIDTH / 120) ได้เป็นพิกเซลจริง
        */}
        <Text
          maxScale={1}
          style={{
            color: BRAND_GOLD,
            fontSize: 14,
            fontWeight: '900',
            left: (82 * TRUCK_WIDTH) / 120 - 19,
            letterSpacing: 1,
            lineHeight: 18,
            position: 'absolute',
            textAlign: 'center',
            /*
             * เงาสีเดียวกันรัศมีสั้น ๆ ใช้ "อ้วน" เส้นอักษรขึ้นอีกนิด — น้ำหนัก
             * ฟอนต์ตันที่ 900 แล้ว จะหนากว่านี้ด้วย fontWeight ไม่ได้
             */
            textShadowColor: BRAND_GOLD,
            textShadowOffset: { height: 0, width: 0 },
            textShadowRadius: 0.8,
            top: (22 * TRUCK_HEIGHT) / 56 - 9,
            width: 38,
          }}
        >
          TJC
        </Text>
      </View>
    </View>
  );
}
