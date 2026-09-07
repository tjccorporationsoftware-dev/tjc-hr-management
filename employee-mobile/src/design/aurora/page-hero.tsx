import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Icon, Text, hitSlop, type IconName } from '@/design';

import { PressableScale } from './motion';
import { useResponsive } from '@/design/responsive';

import { AURORA } from './palette';

/**
 * หัวข้อหน้าของแท็บ — แถบเต็มความกว้างจอ น้ำเงินโค้งริมซ้าย ที่เหลือเป็นพื้นขาว
 *
 * ใช้โครงเดียวกับการ์ดตัวตนบนหน้าหลัก (`<Path>` เบซิเยร์สองชั้น: ฟ้าสด
 * `accentEnd` กว้างกว่าอยู่หลัง น้ำเงิน `accent` แคบกว่าอยู่หน้า) เพื่อให้
 * สลับแท็บแล้วรู้สึกเป็นแอปเดียวกัน
 *
 * อยู่ในชั้นดีไซน์ ไม่ใช่ในฟีเจอร์ใดฟีเจอร์หนึ่ง เพราะทุกแท็บใช้ตัวเดียวกัน —
 * ก่อนหน้านี้มีแค่จอลงเวลาที่มีหัวจอแบบนี้ พอจอคำขอจะใช้ตามก็ต้องคัดลอก SVG
 * ทั้งก้อนไปอีกไฟล์ แล้วสองที่จะเพี้ยนจากกันในการแก้ครั้งถัดไป
 */
/**
 * ความสูงของหัวจอ — **ตายตัวทุกหน้า ไม่ยืดตามของที่ใส่เข้ามา**
 *
 * ก่อนหน้านี้ความสูงมาจากลูกที่สูงที่สุดในแถว จอที่วางปุ่มกลมใบใหญ่ไว้ท้าย
 * บรรทัด (จอคำขอ) จึงมีหัวจอสูงกว่าจอที่วางแค่ป้ายข้อความ (จอลงเวลา) เห็นได้
 * ชัดตอนสลับแท็บ ทั้งที่เป็นหัวจอตัวเดียวกัน
 *
 * ตรึงไว้ที่นี่ที่เดียว ของที่ใส่ผ่าน `right` จึงต้องไม่สูงเกิน 44pt
 * (ที่เหลือเป็นระยะหายใจบนล่าง) เกินกว่านั้นจะโดน `overflow: 'hidden'` ตัด
 */
const HERO_HEIGHT = 60;

export interface PageHeroProps {
  /**
   * ลายประจำจอที่วางทับพื้นหลัง — อยู่ "หลัง" ตัวหนังสือเสมอ
   *
   * มีไว้ให้แต่ละแท็บใส่ของของตัวเอง (จอลงเวลาใส่หน้าปัดนาฬิกาจาง ๆ) โดยที่
   * โครงหัวจอยังเป็นตัวเดียวกันทั้งแอป
   */
  decoration?: ReactNode;
  /** ไอคอนในวงขาวทางซ้าย — วางทับแถบน้ำเงินพอดี */
  icon: IconName;
  /** ป้ายเรียกของวงไอคอนตอนกดได้ เช่น "ย้อนกลับ" */
  iconLabel?: string;
  /**
   * ทำให้วงไอคอนกดได้ — จอลูก (เช่นรายละเอียดคำขอ) ใช้วงนี้เป็นปุ่มย้อนกลับ
   * แทนที่จะมีปุ่มกลมอีกใบมาเบียดหน้าไอคอนจนหัวจอมีของกลม ๆ สองใบติดกัน
   */
  onIconPress?: () => void;
  /** ของที่ไปอยู่ท้ายบรรทัด เช่น ป้ายสถานะหรือปุ่มกลม — สูงได้ไม่เกิน 44pt */
  right?: ReactNode;
  /** คำอธิบายบรรทัดเดียวใต้ชื่อจอ */
  subtitle?: string;
  title: string;
}

export function PageHero({
  decoration,
  icon,
  iconLabel,
  onIconPress,
  right,
  subtitle,
  title,
}: PageHeroProps) {
  const { gutter } = useResponsive();
  /*
   * วงขาวทึบ ไม่ใช่ `accentSoft` — ตรงนี้พื้นเป็นน้ำเงินแล้ว ฟ้าจาง 8%
   * บนน้ำเงินคือมองไม่เห็น (กติกาเดียวกับที่เขียนไว้ที่ AURORA.accentSoft)
   */
  const circleStyle: ViewStyle = {
    alignItems: 'center',
    backgroundColor: AURORA.baseDeep,
    borderRadius: 999,
    elevation: 2,
    height: 38,
    justifyContent: 'center',
    shadowColor: AURORA.accent,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    width: 38,
  };

  const iconMark = <Icon color={AURORA.accent} name={icon} size={19} />;

  return (
    /*
     * กินเต็มความกว้างจอและติดขอบบนสุด — ผู้เรียกเป็นคนหักระยะขอบของ
     * ScrollView/FlatList ออกด้วย margin ติดลบ ไม่ใช่ตัวคอมโพเนนต์นี้
     */
    <View
      style={{
        alignItems: 'center',
        /*
          มุมฉากเต็มความกว้าง ไม่ใช่แคปซูล และไม่มีเส้นคั่นสักด้าน — ตัวแถบมี
          พื้นกับลายของตัวเองอยู่แล้ว เส้นบนล่างเลยกลายเป็นขีดซ้อนบนของที่
          แยกตัวจากพื้นได้อยู่แล้ว ทำให้หัวจออ่านเป็นแถบที่ถูกขีดคร่อมไว้
        */
        flexDirection: 'row',
        /*
          เว้นที่เหนือแถบไว้ 8 — จอทุกจอดึงหัวจอขึ้นไปชนขอบบนด้วย margin
          ติดลบ พอชนพอดีเป๊ะ เส้นบนจะไปแนบกับขอบจอจนแยกไม่ออกว่ามีเส้น
          ค่านี้เผื่อที่ให้เส้นได้ยืนอยู่บนพื้นของตัวเอง
        */
        marginTop: 8,
        gap: 11,
        height: HERO_HEIGHT,
        /* ลายประจำจอกับผืนน้ำเงินล้นกรอบได้ ต้องถูกตัดที่ขอบแถบ */
        overflow: 'hidden',
        /* ระยะขอบเท่ากับเนื้อหาข้างล่างเสมอ ไม่ว่าจอกว้างเท่าไร */
        paddingHorizontal: gutter,
      }}
    >
      <View style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}>
        <Svg
          height="100%"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
          width="100%"
        >
          <Rect fill={AURORA.baseDeep} height={100} width={100} x={0} y={0} />

          {/*
            **กว้างสุด 13.5%** — คอลัมน์ตัวหนังสือเริ่มที่ 18 + 38 + 11 = 67pt
            ซึ่งบนจอกว้างสุดที่รองรับ (~430pt) คือ ~15.5% ของความกว้าง
            เกินเส้นนี้เมื่อไรสีน้ำเงินจะไปทับชื่อจอทันที

            ผูกกับวงไอคอนเสมอ — วงเล็กลงรอบไหน คอลัมน์ตัวหนังสือก็ขยับเข้ามา
            ผืนน้ำเงินต้องแคบตามในสัดส่วนเดียวกัน ไม่งั้นแถบที่เตี้ยลงแล้วจะ
            กลับดูหนักไปทางซ้ายแทน
          */}
          <Path
            d="M0,0 L13.5,0 C13.5,42 12.9,74 10.8,100 L0,100 Z"
            fill={AURORA.accentEnd}
          />
          <Path
            d="M0,0 L10.2,0 C10.2,42 9.5,74 8.1,100 L0,100 Z"
            fill={AURORA.accent}
          />
        </Svg>
      </View>

      {decoration}

      {onIconPress ? (
        <PressableScale
          accessibilityLabel={iconLabel}
          accessibilityRole="button"
          hitSlop={hitSlop}
          onPress={onIconPress}
          style={circleStyle}
        >
          {iconMark}
        </PressableScale>
      ) : (
        <View style={circleStyle}>{iconMark}</View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        {/*
          16 ไม่ใช่ h1 (28) ของเดิม — ชื่อจอยาว ๆ อย่าง "ลากิจไม่ได้รับค่าจ้าง"
          ที่ 28 กินความกว้างเกือบเต็มบรรทัดจนแถบดูเทอะทะ และจอที่ชื่อยาวกว่า
          นั้นตกบรรทัดสอง ทำให้ความสูงของหัวจอไม่เท่ากันทั้งแอป

          ตัดบรรทัดเดียวและบีบ `lineHeight` ให้ชิดตัวอักษร — แถบแคบขนาดนี้
          ความสูงมาจากกล่องตัวหนังสือ ไม่ใช่วงไอคอนแล้ว ระยะหายใจของบรรทัด
          จึงเป็นตัวที่กินความสูงมากที่สุดถ้าปล่อยไว้ตามค่ามาตรฐาน
        */}
        <Text
          numberOfLines={1}
          style={{ color: AURORA.text, fontSize: 18, lineHeight: 23 }}
          variant="h3"
        >
          {title}
        </Text>

        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: AURORA.textMuted, fontSize: 12, lineHeight: 15 }}
            variant="caption"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}
