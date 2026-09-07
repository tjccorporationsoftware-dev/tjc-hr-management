import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { Icon, Text } from '@/design';
import { AURORA } from '@/design/aurora';
import { useAppTheme } from '@/theme/use-app-theme';

import { PIN_LENGTH } from './pin';

/**
 * แป้นตัวเลขสำหรับใส่ PIN
 *
 * ทำแป้นเองแทนการเรียกคีย์บอร์ดของระบบด้วยเหตุผลสองข้อ:
 *   1. คีย์บอร์ดตัวเลขของ Android มีปุ่มอื่นปนและตำแหน่งไม่คงที่ระหว่างรุ่น
 *      ผู้ใช้ที่กดวันละครั้งต้องกดได้โดยไม่ต้องมอง — ตำแหน่งจึงต้องนิ่ง
 *   2. ปุ่มบนแป้นนี้ใหญ่กว่าขนาดนิ้วขั้นต่ำ (56pt เทียบกับ 44pt) เพราะเป็น
 *      สิ่งแรกที่ต้องกดทุกเช้า บ่อยครั้งมือเดียว ตอนเดิน หรือใส่ถุงมือ
 *
 *      เคยเป็น 64pt ซึ่งรวมกับการ์ดด้านบนแล้วกินความสูงจนจอดูอึดอัด
 *      และบนเครื่องจอเตี้ยแป้นถูกดันจนต้องเลื่อน
 */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/**
 * จอที่วางแป้นนี้มีสองแบบ และสีต้องมาจากคนละที่
 *
 * `theme` = จอที่ยังใช้ระบบสีเดิม (ปลดล็อก) ซึ่งเป็นสีเข้มได้ในโหมดมืด
 * `aurora` = จอผิวออโรราที่พื้นเป็นฟ้าอ่อนตลอดทั้งสองโหมด ถ้าใช้สีธีมที่นั่น
 * ผู้ใช้โหมดมืดจะได้ปุ่มสีเข้มบนพื้นฟ้าอ่อน — ดูเป็นคนละแอปทันที
 */
export type PinSurface = 'theme' | 'aurora';

export interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  surface?: PinSurface;
}

export function PinPad({
  value,
  onChange,
  disabled = false,
  surface = 'theme',
}: PinPadProps) {
  const { theme } = useAppTheme();
  const aurora = surface === 'aurora';
  const keyBackground = aurora ? AURORA.baseDeep : theme.colors.surface;
  const keyPressed = aurora ? AURORA.accentSoft : theme.colors.primarySoft;
  /*
   * ขอบปุ่มบนผิวออโรราเข้มกว่า `glassBorder` (13%) ที่ใช้กับการ์ด — ปุ่มเป็น
   * วงขาวเล็ก ๆ บนพื้นฟ้าอ่อน ขอบระดับการ์ดจางจนปุ่มละลายไปกับพื้น
   */
  const keyBorder = aurora ? `${AURORA.accent}26` : theme.colors.border;
  const keyText = aurora ? AURORA.text : theme.colors.text;
  const deleteIcon = aurora ? AURORA.textMuted : theme.colors.textMuted;

  /*
   * เงาใต้ปุ่ม — มีเฉพาะผิวออโรรา ตามกติกา "ขาวคือของที่ลอยขึ้นมาจากพื้นฟ้า"
   * ปุ่มที่ไม่มีเงาบนพื้นฟ้าอ่อนอ่านเป็นรอยด่างบนพื้น ไม่ใช่ของที่กดได้
   */
  const keyLift = aurora
    ? {
        elevation: 2,
        shadowColor: AURORA.accent,
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.14,
        shadowRadius: 5,
      }
    : null;

  const press = (key: string) => {
    if (disabled) return;

    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }

    if (key && value.length < PIN_LENGTH) {
      onChange(value + key);
    }
  };

  return (
    <View
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        flexWrap: 'wrap',
        maxWidth: 264,
      }}
    >
      {KEYS.map((key, index) => (
        <View
          key={key || `blank-${index}`}
          style={{
            alignItems: 'center',
            paddingVertical: theme.spacing.xs,
            width: '33.33%',
          }}
        >
          {key ? (
            <Pressable
              accessibilityLabel={key === 'del' ? 'ลบ' : key}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => press(key)}
              /* E2E ต้องกดปุ่มตัวเลขได้ — ป้ายไทยของปุ่มลบไม่เสถียรพอ */
              testID={`pin-key-${key}`}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor:
                  key === 'del'
                    ? 'transparent'
                    : pressed
                      ? keyPressed
                      : keyBackground,
                borderColor: key === 'del' ? 'transparent' : keyBorder,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                height: 56,
                justifyContent: 'center',
                opacity: disabled ? 0.4 : 1,
                width: 56,
                ...(key === 'del' || pressed ? null : keyLift),
              })}
            >
              {key === 'del' ? (
                <Icon color={deleteIcon} name="delete" size={22} />
              ) : (
                <Text
                  maxScale={1.2}
                  style={{
                    color: keyText,
                    fontSize: 23,
                    fontVariant: ['tabular-nums'],
                    fontWeight: '700',
                  }}
                  variant="h2"
                >
                  {key}
                </Text>
              )}
            </Pressable>
          ) : (
            <View style={{ height: 56, width: 56 }} />
          )}
        </View>
      ))}
    </View>
  );
}

export interface PinDotsProps {
  filled: number;
  /** สั่นหนึ่งครั้งเมื่อค่านี้เปลี่ยน — ใช้บอกว่ารหัสผิดโดยไม่ต้องอ่านข้อความ */
  shakeKey?: number;
  tone?: 'default' | 'danger';
  surface?: PinSurface;
}

export function PinDots({
  filled,
  shakeKey = 0,
  tone = 'default',
  surface = 'theme',
}: PinDotsProps) {
  const { theme } = useAppTheme();
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (shakeKey === 0) return;

    shake.setValue(0);

    const animation = Animated.timing(shake, {
      duration: 400,
      easing: Easing.linear,
      toValue: 1,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [shake, shakeKey]);

  const aurora = surface === 'aurora';
  const color =
    tone === 'danger'
      ? aurora
        ? AURORA.rose
        : theme.colors.danger
      : aurora
        ? AURORA.accent
        : theme.colors.primary;
  /*
   * วงว่างต้องเข้มกว่าเส้นขอบการ์ด — เม็ดพวกนี้คือตัวบอกว่า "เหลืออีกกี่หลัก"
   * ถ้าจางเท่าขอบการ์ดจะมองไม่เห็นว่ามีกี่ช่องตั้งแต่แรก
   */
  const emptyBorder = aurora ? `${AURORA.accent}3d` : theme.colors.borderStrong;

  return (
    <Animated.View
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        gap: 13,
        transform: [
          {
            translateX: shake.interpolate({
              /* ซ้าย-ขวาสี่จังหวะแล้วกลับเข้าที่ — จบเร็วพอที่จะไม่หน่วงการพิมพ์ต่อ */
              inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
              outputRange: [0, -9, 9, -6, 6, 0],
            }),
          },
        ],
      }}
    >
      {Array.from({ length: PIN_LENGTH }).map((_, index) => (
        <View
          key={index}
          style={{
            backgroundColor: index < filled ? color : 'transparent',
            borderColor: index < filled ? color : emptyBorder,
            borderRadius: 999,
            borderWidth: 2,
            height: 14,
            width: 14,
          }}
        />
      ))}
    </Animated.View>
  );
}

/**
 * ความสูงขั้นต่ำที่แป้นกินจริง ใช้กันจอเด้งตอนสลับข้อความด้านบน
 *
 * สี่แถว แถวละปุ่ม 56 บวกระยะห่างบนล่างแถวละ 8 = 256 เผื่อไว้เป็น 260
 * ค่านี้ต้องขยับตามขนาดปุ่ม ไม่งั้นจะเหลือที่ว่างค้างใต้แป้น
 */
export const PIN_PAD_MIN_HEIGHT = 260;
