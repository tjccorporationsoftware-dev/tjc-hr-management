import { View } from 'react-native';

import { Icon } from '@/design/icon';
import { Text } from '@/design/text';

import { PressableScale } from './motion';
import { AURORA } from './palette';

/**
 * แถบเลือกช่วงเวลา — **แถบเดียวสามช่อง** ลูกศรซ้าย · ค่าที่ดูอยู่ · ลูกศรขวา
 *
 * ตัวควบคุมชนิดเดียวกันต้องหน้าตาเหมือนกันทั้งแอป ก่อนมีตัวนี้แต่ละจอทำเอง
 * คนละทรง — บ้างเป็นแคปซูลฟ้าอ่อนที่มีปุ่มกลมขาวลอยสองมุม บ้างเป็นลูกศรเปล่า
 * สองข้างกับข้อความตรงกลาง ซึ่งทั้งคู่อ่านเป็นของสามชิ้นที่บังเอิญอยู่บรรทัด
 * เดียวกัน ไม่ใช่ตัวควบคุมชิ้นเดียว
 *
 * เส้นคั่นในแถบบอกว่าแตะตรงไหนได้อะไร โดยที่ปุ่มไม่ต้องมีพื้นสีของตัวเอง และ
 * พื้นที่แตะเต็มความสูงของแถบอยู่แล้ว จึงไม่ต้องพึ่ง `hitSlop`
 *
 * ปุ่มถัดไปถูกปิดเมื่อถึงช่วงปัจจุบัน — ข้อมูลของอนาคตยังไม่เกิด การให้กดไป
 * ข้างหน้าได้แปลว่าผู้ใช้จะเจอจอว่างแล้วคิดว่าระบบพัง แต่ปุ่มยังต้องอยู่ในแถบ
 * ไม่ใช่หายไปจนแถบเบี้ยวข้างเดียว
 *
 * จอที่ยังไม่ได้ย้ายมาผิวออโรรา (ตารางงาน ทีมของฉัน) ใช้ `MonthSwitcher` จาก
 * `@/design` แทน — ทรงเดียวกันแต่หยิบสีจาก theme เพราะพื้นจอเปลี่ยนตามโหมดมืด
 */
export interface PeriodBarProps {
  /** กดลูกศรขวาได้ไหม — ถึงช่วงปัจจุบันแล้วต้องปิด */
  canGoNext: boolean;
  /** ค่าที่กำลังดูอยู่ เช่น "จ. 7 ก.ย. 2569" หรือ "กันยายน 2569" */
  label: string;
  /** บรรทัดรองใต้ค่า เช่นช่วงวันของงวด */
  sublabel?: string;
  /** ป้ายของปุ่มย้อนกลับสำหรับ screen reader */
  backLabel: string;
  /** ป้ายของปุ่มถัดไปสำหรับ screen reader */
  forwardLabel: string;
  onShift: (delta: number) => void;
  /**
   * แตะตรงกลางเพื่อเลือกจากปฏิทิน/รายการ — ไม่ส่งมาแปลว่าเลื่อนได้ทีละก้าว
   * อย่างเดียว ตรงกลางจะไม่มีลูกศรลงกำกับและกดไม่ได้
   */
  onPick?: () => void;
  /** ป้ายของปุ่มตรงกลางสำหรับ screen reader */
  pickLabel?: string;
}

const ARROW_SIZE = 46;

export function PeriodBar({
  backLabel,
  canGoNext,
  forwardLabel,
  label,
  onPick,
  onShift,
  pickLabel,
  sublabel,
}: PeriodBarProps) {
  const center = (
    <>
      {/* ไอคอนปฏิทินอยู่ในตัวกลาง ไม่ใช่ให้แต่ละจอส่งเข้ามาเอง — ตอนเป็น prop
          จอที่ลืมส่งก็ไม่มีไอคอน แล้วแถบเดียวกันก็หน้าตาไม่ตรงกันทั้งแอป */}
      <Icon color={AURORA.accent} name="calendar" size={14} />
      <View style={{ alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={{ color: AURORA.text, fontSize: 14, fontWeight: '800' }}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text
            maxScale={1.1}
            numberOfLines={1}
            style={{
              color: AURORA.textMuted,
              fontSize: 10.5,
              fontVariant: ['tabular-nums'],
              lineHeight: 14,
            }}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
      {onPick ? (
        <Icon color={AURORA.accent} name="chevron-down" size={14} />
      ) : null}
    </>
  );

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: AURORA.baseDeep,
        borderColor: AURORA.glassBorder,
        /* แคปซูลเต็มโค้ง ไม่ใช่สี่เหลี่ยมมุมมน — ทรงนี้บอกตัวเองว่า "เลื่อนค่า
           ไปมา" ต่างจากมุมมน 14 ที่อ่านเป็นการ์ดใบเล็กที่มีของอยู่ข้างใน */
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        /*
         * ความสูงต้องเป็นค่าจริง ไม่ใช่ minHeight
         *
         * บั๊กที่เคยเกิด: ตอนใช้ minHeight ลูกที่สั่ง height ร้อยเปอร์เซ็นต์ไป
         * อ้างกับความสูงที่ยังไม่ถูกกำหนด Yoga เลยไปหยิบความสูงของ ScrollView
         * ข้างนอกมาแทน แถบเลือกวันจึงยืดเต็มจอทั้งหน้า
         */
        height: sublabel ? 54 : ARROW_SIZE,
        overflow: 'hidden',
      }}
    >
      <PressableScale
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        onPress={() => onShift(-1)}
        style={{
          alignItems: 'center',
          alignSelf: 'stretch',
          borderRightColor: AURORA.glassBorder,
          borderRightWidth: 1,
          /* ใบในของ PressableScale ไม่ได้รับ alignSelf ไปด้วย (ตัวนั้นถูกยกไป
             ไว้ใบนอก) ถ้าไม่สั่งสูงเท่าแถบ ใบในจะสูงเท่าไอคอน เส้นคั่นเลยเป็น
             ขีดสั้น ๆ กลางแถบ และลูกศรลอยไปติดขอบบน */
          height: '100%',
          justifyContent: 'center',
          width: ARROW_SIZE,
        }}
      >
        <Icon color={AURORA.accent} name="chevron-left" size={18} />
      </PressableScale>

      {onPick ? (
        <PressableScale
          accessibilityLabel={pickLabel ?? label}
          accessibilityRole="button"
          onPress={onPick}
          style={{
            alignItems: 'center',
            alignSelf: 'stretch',
            flex: 1,
            flexDirection: 'row',
            gap: 7,
            height: '100%',
            justifyContent: 'center',
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          {center}
        </PressableScale>
      ) : (
        <View
          style={{
            alignItems: 'center',
            alignSelf: 'stretch',
            flex: 1,
            flexDirection: 'row',
            gap: 7,
            height: '100%',
            justifyContent: 'center',
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          {center}
        </View>
      )}

      <PressableScale
        accessibilityLabel={forwardLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canGoNext }}
        disabled={!canGoNext}
        onPress={() => onShift(1)}
        style={{
          alignItems: 'center',
          alignSelf: 'stretch',
          borderLeftColor: AURORA.glassBorder,
          borderLeftWidth: 1,
          height: '100%',
          justifyContent: 'center',
          opacity: canGoNext ? 1 : 0.4,
          width: ARROW_SIZE,
        }}
      >
        <Icon
          color={canGoNext ? AURORA.accent : AURORA.textFaint}
          name="chevron-right"
          size={18}
        />
      </PressableScale>
    </View>
  );
}
