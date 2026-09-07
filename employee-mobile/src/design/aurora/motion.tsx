import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Text, type TextProps } from '@/design';

import { AURORA } from './palette';

/**
 * ชั้นการเคลื่อนไหวของแอป
 *
 * กติกาที่ทุกตัวในไฟล์นี้ยึด:
 *   1. **opacity/transform เท่านั้น** เพื่อให้ useNativeDriver ทำงานได้จริง
 *      อนิเมชันที่วิ่งบน JS thread จะกระตุกทันทีที่ query หลายตัวตอบพร้อมกัน
 *   2. **ของที่วนไม่รู้จบต้องช้าและจาง** (ออโรรา, แสงกวาด, จุดเต้น) —
 *      ของที่วิ่งครั้งเดียวตอนโผล่เร็วได้ แต่ต้องจบใน ~1 วินาที
 *   3. ทุกตัวหยุดอนิเมชันตอน unmount เสมอ ไม่งั้น loop จะค้างกินเฟรม
 *      อยู่เบื้องหลังทั้งที่ผู้ใช้ไปแท็บอื่นแล้ว
 */

/** ค่าที่วิ่งไป-กลับ 0→1→0 ไม่รู้จบ ใช้ทำของที่ "ลอย" หรือ "หายใจ" */
export function useDrift(duration: number, delay = 0) {
  const [value] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [delay, duration, value]);

  return value;
}

/** ค่าที่วิ่งจาก 0 ไป 1 ครั้งเดียวตอนโผล่ ใช้กับแท่ง/วงที่ต้อง "โต" ขึ้นมา */
export function useGrow(delay = 0, duration = 850) {
  const [value] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(value, {
      delay,
      duration,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [delay, duration, value]);

  return value;
}

export interface RevealProps {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

/** จาง + เลื่อนขึ้น + ขยายนิดหน่อยตอนโผล่ ไล่ทีละบล็อกเพื่อบอกลำดับการอ่าน */
export function Reveal({ children, delay = 0, style }: RevealProps) {
  const progress = useGrow(delay, 520);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [22, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.97, 1],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * การ์ดยุบลงตอนกด — บนพื้นกระจกการเปลี่ยนสีพื้นแทบไม่เห็นผล แต่การยุบเห็นชัด
 *
 * ตั้ง `accessibilityRole="button"` เป็นค่าตั้งต้นให้เลย เพราะทุกที่ที่ใช้ตัวนี้
 * คือของที่กดได้จริงอยู่แล้ว — เดิมต้องใส่เองทุกจุดแล้วก็ลืมเป็นประจำ
 * screen reader จึงอ่านปุ่มพวกนั้นเป็นข้อความเปล่า ผู้ใช้ตาบอดไม่รู้ว่ากดได้
 * (ผู้เรียกยังทับด้วย role อื่นได้ เช่น `"link"` เพราะ props กระจายทีหลัง)
 */
export function PressableScale({
  children,
  style,
  ...props
}: PressableScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));

  const springTo = (toValue: number) => {
    Animated.spring(scale, {
      bounciness: 0,
      speed: 40,
      toValue,
      useNativeDriver: true,
    }).start();
  };

  /*
   * ตัวจริงในสายตาพ่อแม่คือ Animated.View ข้างนอก ไม่ใช่ Pressable ข้างใน —
   * prop ที่บอก "ฉันควรกว้างเท่าไรในแถวนี้" จึงต้องยกออกมาไว้ใบนอก
   *
   * บั๊กที่เคยเกิดจริง: ปุ่มทางลัดสี่ปุ่มส่ง flex: 1 มาเพื่อแบ่งความกว้างเท่ากัน
   * แต่ flex ไปตกอยู่ที่ Pressable ข้างใน ส่วนใบนอกยังกว้างตามเนื้อหา ปุ่มทั้งสี่
   * จึงหดเหลือเท่าตัวหนังสือแล้วกระจุกอยู่ชิดซ้าย โดยไม่มี error อะไรเลย
   *
   * ที่เหลือ (พื้น ขอบ เงา ระยะขอบใน การจัดวางลูก) อยู่กับ Pressable ตามเดิม
   * เพราะนั่นคือใบที่วาดตัวปุ่มจริงและเป็นพื้นที่แตะ
   *
   * **กับดักที่ตามมา**: `height` ไม่ได้ถูกยกออกไป ใบในจึงสูงเท่าเนื้อหาเสมอ
   * ถ้าอยากให้ปุ่มสูงเท่าแถวที่มันอยู่ ต้องส่งทั้ง `alignSelf: 'stretch'`
   * (ไปที่ใบนอก) และ `height: '100%'` (อยู่กับใบใน) — และแถวแม่ต้องมีความสูง
   * เป็นค่าจริง ไม่ใช่ `minHeight` ไม่งั้นเปอร์เซ็นต์จะไปอ้างกับความสูงของตัว
   * ที่เลื่อนได้ข้างนอก แล้วปุ่มยืดเต็มจอ (เคยเกิดกับแถบเลือกวันมาแล้ว)
   */
  const flat = StyleSheet.flatten(style) ?? {};
  const {
    alignSelf,
    flex,
    flexBasis,
    flexGrow,
    flexShrink,
    maxWidth,
    minWidth,
    width,
    ...innerStyle
  } = flat;

  return (
    <Animated.View
      style={{
        alignSelf,
        flex,
        flexBasis,
        flexGrow,
        flexShrink,
        maxWidth,
        minWidth,
        transform: [{ scale }],
        width,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPressIn={() => springTo(0.97)}
        onPressOut={() => springTo(1)}
        {...props}
        style={innerStyle}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/**
 * ตัวเลขที่ไล่ขึ้นจากศูนย์
 *
 * แยกเป็นคอมโพเนนต์เพราะ hook ข้างในนี้ setState ทุกเฟรม — ถ้าเรียกในจอหลัก
 * ทั้งจอจะ render ใหม่ 60 ครั้งต่อวินาที ที่นี่กระทบแค่ตัวอักษรก้อนเดียว
 */
function useCountUp(target: number, duration: number): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let frame = 0;
    let startedAt = 0;

    const step = (timestamp: number) => {
      if (!startedAt) {
        startedAt = timestamp;
      }

      const ratio = Math.min((timestamp - startedAt) / duration, 1);

      /* ease-out — พุ่งตอนต้นแล้วค่อย ๆ เข้าเส้นชัย อ่านค่าสุดท้ายได้ชัด */
      setShown(safeTarget * (1 - Math.pow(1 - ratio, 3)));

      if (ratio < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [duration, safeTarget]);

  return shown;
}

export interface CountUpProps extends Omit<TextProps, 'children' | 'style'> {
  value: number;
  /** แปลงค่าระหว่างวิ่งเป็นข้อความ — ต้องคุมทศนิยมเอง ไม่งั้นเลขจะสั่น */
  format: (value: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
}

export function CountUp({
  value,
  format,
  duration = 900,
  style,
  ...props
}: CountUpProps) {
  const shown = useCountUp(value, duration);

  return (
    <Text {...props} style={style}>
      {format(shown)}
    </Text>
  );
}

/** จุดที่มีคลื่นกระจายออก — ใช้กับสถานะที่กำลังเกิดขึ้นจริงตอนนี้เท่านั้น */
export function PulseDot({
  color = AURORA.accent,
  size = 8,
}: {
  color?: string;
  size?: number;
}) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 1500,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.delay(300),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [pulse]);

  return (
    <View
      style={{
        alignItems: 'center',
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Animated.View
        style={{
          backgroundColor: color,
          borderRadius: 999,
          height: size,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.55, 0],
          }),
          position: 'absolute',
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 3],
              }),
            },
          ],
          width: size,
        }}
      />
      <View
        style={{
          backgroundColor: color,
          borderRadius: 999,
          height: size,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 3,
          width: size,
        }}
      />
    </View>
  );
}

/**
 * แสงกวาดผ่านการ์ดช้า ๆ
 *
 * ใช้ใบเดียวบนจอ — สองใบขึ้นไปสายตาจะเริ่มไล่ตามแสงแทนที่จะอ่านตัวเลข
 * ต้องวางในกล่องที่ overflow: 'hidden' ไม่งั้นแถบจะโผล่ออกนอกการ์ด
 */
export function Shimmer({ height = 260 }: { height?: number }) {
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        /* พักยาวกว่าตัวกวาดเยอะ ให้รู้สึกเป็นประกายนาน ๆ ที ไม่ใช่ไฟวิ่ง */
        Animated.delay(4200),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [sweep]);

  return (
    <Animated.View
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        height,
        /* แสงกวาดเป็นของตกแต่ง ห้ามบังการกดการ์ดที่อยู่ข้างล่าง */
        pointerEvents: 'none',
        position: 'absolute',
        top: -height / 4,
        transform: [
          { rotate: '18deg' },
          {
            translateX: sweep.interpolate({
              inputRange: [0, 1],
              outputRange: [-160, 460],
            }),
          },
        ],
        width: 60,
      }}
    />
  );
}
