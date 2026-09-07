import { useId, type ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useDrift } from './motion';
import { AURORA } from './palette';

/**
 * ชั้นพื้นหลังและผิวกระจกของแอป
 *
 * แนวคิด: จอนี้เป็น "กระจกลอยอยู่เหนือแสงเหนือ" ไม่ใช่ "การ์ดวางบนกระดาษ"
 * ทุกอย่างจึงโปร่งบางส่วน มีขอบสว่างบาง ๆ และมีเงาสีเดียวกับแสงที่อยู่ข้างหลัง
 *
 * **id ของ gradient ต้องไม่ซ้ำกันข้ามอินสแตนซ์** — สองตัวที่ใช้ id เดียวกัน
 * จะแย่งกันนิยาม แล้วอันหนึ่งกลายเป็นสีทึบบนเครื่องจริง (ไม่เห็นตอน dev)
 */
function useGradientId(prefix: string) {
  /* useId คืนค่าที่มีอักขระพิเศษ (":r3:") ซึ่งใช้ใน url(#...) ของ svg ไม่ได้ */
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/* ------------------------------------------------------------ พื้นหลัง */

interface BlobProps {
  color: string;
  delay?: number;
  duration: number;
  size: number;
  style: StyleProp<ViewStyle>;
}

/** ก้อนแสงหนึ่งก้อน ลอยช้า ๆ ไม่ซ้ำจังหวะกับก้อนอื่น */
function Blob({ color, delay = 0, duration, size, style }: BlobProps) {
  const drift = useDrift(duration, delay);
  const id = useGradientId('blob');

  return (
    <Animated.View
      style={[
        {
          height: size,
          /* ก้อนแสงเป็นฉากหลังล้วน ห้ามกินการแตะของการ์ดที่ลอยอยู่ข้างบน */
          pointerEvents: 'none',
          position: 'absolute',
          width: size,
        },
        style,
        {
          transform: [
            {
              translateX: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [-28, 28],
              }),
            },
            {
              translateY: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [22, -26],
              }),
            },
            {
              scale: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.2],
              }),
            },
          ],
        },
      ]}
    >
      <Svg height={size} width={size}>
        <Defs>
          <RadialGradient id={id}>
            <Stop offset="0" stopColor={color} stopOpacity={0.34} />
            <Stop offset="0.5" stopColor={color} stopOpacity={0.11} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} fill={`url(#${id})`} r={size / 2} />
      </Svg>
    </Animated.View>
  );
}

/**
 * ผืนแสงเหนือ — อยู่หลังทุกอย่างและ **ไม่เลื่อนตามจอ**
 *
 * ตรึงไว้กับที่โดยตั้งใจ: เนื้อหาเลื่อนผ่านแสงที่นิ่ง ทำให้รู้สึกว่ากระจก
 * ลอยอยู่เหนือฉาก ไม่ใช่ทั้งฉากเลื่อนไปพร้อมกัน และประหยัดกว่าการวาดใหม่ทุกเฟรม
 */
export function AuroraBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: AURORA.base }]}
      />

      <Blob
        color={AURORA.glowIndigo}
        duration={9000}
        size={460}
        style={{ right: -170, top: -140 }}
      />
      <Blob
        color={AURORA.glowBlue}
        delay={600}
        duration={11000}
        size={420}
        style={{ left: -160, top: 90 }}
      />
      <Blob
        color={AURORA.glowSky}
        delay={1400}
        duration={13000}
        size={380}
        style={{ bottom: 120, right: -130 }}
      />
      <Blob
        color={AURORA.glowPale}
        delay={2200}
        duration={15000}
        size={320}
        style={{ bottom: -110, left: -90 }}
      />

      {/*
        เคยมีแผ่นไล่สีขาวทับครึ่งล่างของจอตรงนี้ (ทึบถึง 92% ที่ปลายจอ) ไว้ให้
        ต่อกับแถบล่างสีขาวได้เนียน — **ถอดออกแล้ว**

        มันทำให้ครึ่งล่างของทุกจอกลายเป็นสีขาว ไม่ใช่ฟ้า ซึ่งขัดกับโทนของแอป
        โดยตรง และเป็นสาเหตุที่ตัวหนังสือกับเส้นบาง ๆ ในครึ่งล่างดูซีดจนเหมือน
        จะจางหายไป ทั้งที่สีของตัวอักษรเองผ่านเกณฑ์คอนทราสต์แล้ว

        รอยต่อกับแถบล่างไม่ต้องใช้แผ่นขาวมากลบ เพราะแถบล่างมีเส้นขอบบนของ
        ตัวเองอยู่แล้ว
      */}
    </View>
  );
}

/* -------------------------------------------------------------- กระจก */

export interface GlassProps {
  children: ReactNode;
  /** สีผิวแบบกำหนดเอง — ใช้เฉพาะการ์ดพระเอกที่ต้องตัดจากผิวขาว */
  fill?: string;
  /** สีเงาเรือง — ใช้สีเดียวกับของที่อยู่ในการ์ด ไม่ใช่สีสุ่ม */
  glow?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * แผ่นกระจกหนึ่งใบ — ให้ดู "นูนขึ้นมาจากพื้น" ไม่ใช่สี่เหลี่ยมโปร่งแปะไว้เฉย ๆ
 *
 * ความรู้สึกนูนมาจากสี่ชั้นที่ทำงานร่วมกัน ขาดชั้นใดชั้นหนึ่งจะแบนทันที:
 *   1. **เงาสั้น ๆ ชั้นเดียว** — บอกแค่ว่าลอยอยู่เหนือพื้น ไม่ใช่ฟุ้งจนกลายเป็นหมอก
 *   2. **แสงตกบนผิวบน** — ไล่เฉดขาวจากขอบบนลงมาราวครึ่งใบ เหมือนแสงจากฟ้า
 *      ตกกระทบผิวโค้ง เป็นชั้นที่ทำให้ตาอ่านว่า "โค้งนูน" ไม่ใช่ "แบน"
 *   3. **เส้นไฮไลต์ที่ขอบบนสุด** — คมและสว่างกว่าชั้นแสง ทำหน้าที่เป็น "สันของขอบ"
 *   4. **ขอบสีฟ้าจาง** — ตรึงรูปทรงไว้บนพื้นฟ้าอ่อน ไม่ให้ขอบขาวจมหายไปกับพื้น
 */
export function Glass({ children, fill, glow, style }: GlassProps) {
  const sheenId = useGradientId('sheen');

  /*
   * กระจกใบเดียวในสายตาผู้ใช้ แต่เป็น View สองชั้นในโค้ด (RN ใส่เงาได้ชั้นเดียว
   * ต่อ View) — style ที่ผู้เรียกส่งมาจึงต้องแยกไปให้ถูกใบ:
   *   ระยะขอบใน/การจัดวางลูก → ใบใน (ไม่งั้น padding จะไปดันให้ผิวกระจกหดเข้า
   *   แล้วเหลือขอบโปร่งรอบใบ)
   *   ขนาด/ตำแหน่ง/flex → ใบนอก เพื่อให้เงาและกรอบขยายตามจริง
   */
  const flat = StyleSheet.flatten(style) ?? {};
  const {
    alignItems,
    columnGap,
    flexDirection,
    gap,
    justifyContent,
    padding,
    paddingBottom,
    paddingHorizontal,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingVertical,
    rowGap,
    ...outerStyle
  } = flat;

  return (
    <View
      style={[
        {
          borderRadius: 28,
          /*
           * เงาชั้นเดียว สั้นและจาง — เคยใส่สองชั้นแล้วทั้งจอฟุ้งจนอ่านยาก
           * ความรู้สึกนูนมาจากแสงบนผิวกับสันขอบเป็นหลักอยู่แล้ว เงามีหน้าที่
           * แค่บอกว่าแผ่นนี้ "ไม่ได้แปะติดพื้น" เท่านั้น
           */
          elevation: 3,
          shadowColor: glow ?? AURORA.glowBlue,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 14,
        },
        outerStyle,
      ]}
    >
      <View
        style={{
          alignItems,
          backgroundColor: fill ?? AURORA.glass,
          borderColor: AURORA.glassBorder,
          borderRadius: 28,
          borderWidth: 1,
          columnGap,
          flexDirection,
          gap,
          justifyContent,
          overflow: 'hidden',
          padding,
          paddingBottom,
          paddingHorizontal,
          paddingLeft,
          paddingRight,
          paddingTop,
          paddingVertical,
          rowGap,
        }}
      >
        {/* แสงตกบนผิวบน */}
        <View
          style={{
            height: '55%',
            left: 0,
            pointerEvents: 'none',
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        >
          <Svg height="100%" width="100%">
            <Defs>
              <LinearGradient id={sheenId} x1="0" x2="0.35" y1="0" y2="1">
                <Stop
                  offset="0"
                  stopColor={AURORA.glassSheen}
                  stopOpacity={0.9}
                />
                <Stop
                  offset="1"
                  stopColor={AURORA.glassSheen}
                  stopOpacity={0}
                />
              </LinearGradient>
            </Defs>
            <Rect fill={`url(#${sheenId})`} height="100%" width="100%" />
          </Svg>
        </View>

        {/* สันของขอบบน — สว่างตรงกลางแล้วจางไปทางมุม */}
        <View
          style={{
            height: 1,
            left: 0,
            pointerEvents: 'none',
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        >
          <Svg height={1} width="100%">
            <Defs>
              <LinearGradient id="glassEdge" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor={AURORA.glassEdge} stopOpacity={0} />
                <Stop offset="0.5" stopColor={AURORA.glassEdge} stopOpacity={1} />
                <Stop offset="1" stopColor={AURORA.glassEdge} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect fill="url(#glassEdge)" height={1} width="100%" />
          </Svg>
        </View>

        {children}
      </View>
    </View>
  );
}

/* ------------------------------------------------------- การ์ดแบบรายการ */

/**
 * ขอบของแถวที่ต่อกันเป็น "การ์ดใบเดียว" ใน `FlatList`
 *
 * `<Glass>` ครอบลูกทั้งก้อนได้ก็ต่อเมื่อเรนเดอร์ลูกครบทุกตัว ซึ่งขัดกับ
 * การ virtualize — รายการยาว ๆ จึงต้องให้ **แต่ละแถววาดขอบของตัวเอง** แล้ว
 * ประกอบกันเป็นใบเดียวในสายตา: แถวแรกมนด้านบน แถวสุดท้ายมนด้านล่าง
 * ตรงกลางไม่มีเส้นบนซ้ำกับเส้นล่างของแถวก่อนหน้า
 *
 * ใช้สีและรัศมีชุดเดียวกับ `<Glass>` เป๊ะ ๆ ต่างกันแค่ไม่มีแสงตกบนผิวกับเงา
 * ซึ่งเป็นของที่มองไม่เห็นอยู่แล้วเมื่อการ์ดยาวเกินหนึ่งจอ
 */
export function listCardEdge(index: number, total: number): ViewStyle {
  const first = index === 0;
  const last = index === total - 1;

  return {
    backgroundColor: AURORA.glass,
    borderColor: AURORA.glassBorder,
    borderBottomLeftRadius: last ? 28 : 0,
    borderBottomRightRadius: last ? 28 : 0,
    borderBottomWidth: last ? 1 : 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: first ? 28 : 0,
    borderTopRightRadius: first ? 28 : 0,
    borderTopWidth: 1,
    overflow: 'hidden',
  };
}

/* ------------------------------------------------------------ ตัวอักษร */

/**
 * สีของตัวเลขที่เป็นพระเอกของการ์ด
 *
 * บนโทนฟ้า–ขาว **ไม่ใส่เงาเรือง** — เงาสีเดียวกับตัวอักษรบนพื้นสว่างทำให้
 * ตัวเลขดูเบลอเหมือนพิมพ์เหลื่อม ไม่ได้ดูเรืองแสง ความเด่นมาจากสีเข้ม
 * กับน้ำหนักตัวอักษรแทน (รับพารามิเตอร์ radius ไว้เพื่อไม่ต้องแก้ผู้เรียกทุกที่)
 */
export function glowText(color: string, _radius = 0): TextStyle {
  return { color };
}
