import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import {
  ConfirmDialog,
  Icon,
  Skeleton,
  Text,
  useToast,
  type IconName,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import { AURORA, PressableScale, SectionAction } from '@/design/aurora';
import { ApiError } from '@/lib/api/api-error';

import { evaluateGeofence, formatDistance } from './geofence';
import {
  GEOFENCE_STATUS,
  GeofenceMapSurface,
  OffsiteMapSurface,
} from './geofence-ring';
import { punchQueue } from './punch-queue';
import { resolvePunchGuidance } from './punch-guidance';
import { useCurrentLocation } from './use-current-location';
import { usePunch, usePunchContext } from './use-punch';
import { usePunchQueue } from './use-punch-queue';
import { thaiTime } from '@/lib/date/thai-date';

/**
 * Punch panel — modern / minimal visual
 * คง business rule และ data flow เดิมทั้งหมด
 *
 * กติกาที่ห้ามเปลี่ยน:
 *   - อ่านพิกัดใหม่ตอนกดส่งเสมอ
 *   - network failure เท่านั้นที่เข้าคิว offline
 *   - server rejection ห้ามเข้าคิว
 *   - เตือน clock drift เกินสองนาที
 *   - blocked/warning ต้องบอกเหตุผลและทางออกเสมอ
 */

const timeText = (value: Date) =>
  thaiTime(value);

const stampText = (value: Date | null | undefined) =>
  value
    ? thaiTime(value)
    : '--:--';

export interface PunchPanelStamps {
  afternoonInAt?: Date | null;
  checkOutAt?: Date | null;
  morningInAt?: Date | null;
}

const CLOCK_DRIFT_WARN_SECONDS = 120;

/** นานสุดที่ยอมให้การอ่านพิกัดแบบ "เก็บไว้เป็นหลักฐาน" หน่วงการลงเวลา */
const OPTIONAL_LOCATION_TIMEOUT_MS = 6_000;

/**
 * เพดานของเส้นทางที่ "บังคับตรวจตำแหน่ง" — ยาวกว่าเพราะพิกัดมีผลต่อการตัดสิน
 * จึงควรรอให้ถึงที่สุด แต่ต้องมีเพดาน
 *
 * เดิมเส้นทางนี้ await การอ่านพิกัดแบบไม่มีเพดานเลย ซึ่ง getCurrentPositionAsync
 * ที่ความละเอียดสูงบน Android ในอาคารรอได้เป็นนาทีหรือไม่คืนเลย ผู้ใช้จึงเห็น
 * ว่ากดปุ่มแล้วเงียบไปเฉย ๆ
 */
const REQUIRED_LOCATION_TIMEOUT_MS = 20_000;

/**
 * รอผลไม่เกินเวลาที่กำหนด เกินแล้วถือว่าอ่านไม่ได้
 *
 * ไม่ยกเลิกงานที่ค้างอยู่ เพราะ readLocation ไม่ throw และผลที่มาช้าจะถูก
 * react-query เก็บไว้ให้เองอยู่แล้ว ครั้งหน้าจึงได้พิกัดที่สดกว่าเดิม
 */
function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);

    void task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

function GuidanceNotice({
  blocked,
  icon,
  message,
}: {
  blocked: boolean;
  icon: IconName;
  message: string;
}) {
  const color = blocked ? AURORA.rose : AURORA.amber;

  return (
    <View
      style={{
        alignItems: 'flex-start',
        backgroundColor: `${color}0c`,
        borderLeftColor: color,
        borderLeftWidth: 3,
        borderRadius: 14,
        flexDirection: 'row',
        gap: 9,
        paddingHorizontal: 12,
        paddingVertical: 11,
      }}
    >
      <Icon color={color} name={icon} size={16} />
      <Text
        maxScale={1.2}
        style={{ color, flex: 1, fontSize: 11.5, lineHeight: 17 }}
      >
        {message}
      </Text>
    </View>
  );
}

/** ครึ่งหนึ่งของจังหวะพลิกป้ายตัวเลข กับขนาดของแผ่นป้าย */
const FLIP_DURATION_MS = 330;
const TILE_HEIGHT = 44;
const TILE_WIDTH = 46;
const TILE_HALF = TILE_HEIGHT / 2;

/**
 * ครึ่งบนหรือครึ่งล่างของตัวเลขหนึ่งแผ่น
 *
 * วาดตัวเลขเต็มตัวเสมอแล้วครอบด้วยกรอบสูงครึ่งเดียวที่ `overflow: 'hidden'`
 * ครึ่งล่างเลื่อนตัวเลขขึ้นไปหนึ่งครึ่งแผ่น รอยตัดจึงตรงกลางตัวอักษรพอดี
 * ทั้งสองครึ่ง — ถ้าตัดด้วยการย่อ lineHeight แทน ตัวเลขจะเบี้ยวคนละที่
 */
function TileHalf({ half, value }: { half: 'top' | 'bottom'; value: string }) {
  return (
    <View
      style={{
        alignItems: 'center',
        height: TILE_HALF,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <View
        style={{
          height: TILE_HEIGHT,
          justifyContent: 'center',
          marginTop: half === 'top' ? 0 : -TILE_HALF,
        }}
      >
        <Text
          maxScale={1}
          style={{
            color: AURORA.text,
            fontSize: 28,
            fontVariant: ['tabular-nums'],
            fontWeight: '900',
            lineHeight: 34,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/**
 * แผ่นป้ายตัวเลขของนาฬิกาพลิกป้าย — **พับครึ่งบนลงมาทับครึ่งล่าง**
 *
 * เวอร์ชันก่อนหมุนทั้งแผ่นรอบแกนกลาง ซึ่งไม่ใช่จังหวะของนาฬิกาพลิกป้ายจริง
 * และแผ่นหายไปเฉย ๆ เพราะฟังก์ชันล้างของ effect ไป `stop()` ค่าเดียวกันกับที่
 * อนิเมชันขาขึ้นกำลังใช้อยู่ (RN สั่งหยุด "อนิเมชันที่วิ่งอยู่บนค่านั้น" ไม่ใช่
 * เฉพาะตัวที่เรียก) แผ่นจึงค้างอยู่ที่ 90° คือตะแคงจนมองไม่เห็น
 *
 * ตอนนี้เหลืออนิเมชันเดียวไล่ 0 → 1 แล้วอ่านสองช่วงจากค่าเดียวกัน:
 *   0 → 0.5  ครึ่งบนของ**เลขเก่า**พับลง (0° → -90°) เผยครึ่งบนของเลขใหม่ที่รออยู่
 *   0.5 → 1  ครึ่งล่างของ**เลขใหม่**กางลงมาทับ (90° → 0°)
 *
 * แกนหมุนอยู่ที่ขอบรอยพับ ไม่ใช่กลางแผ่น — RN ไม่มี `transformOrigin` จึงเลื่อน
 * ด้วย `translateY` ก่อนและหลัง `rotateX` เพื่อย้ายจุดหมุนเอง
 */
function ClockTile({ value }: { value: string }) {
  const [previous, setPrevious] = useState(value);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (value === previous) {
      return;
    }

    const flip = Animated.timing(progress, {
      duration: FLIP_DURATION_MS,
      easing: Easing.inOut(Easing.quad),
      toValue: 1,
      useNativeDriver: true,
    });

    flip.start(({ finished }) => {
      if (!finished) {
        return;
      }

      /* จบแล้วค่าเก่ากลายเป็นค่าปัจจุบัน แผ่นทั้งใบจึงกลับไปนิ่งที่ 0 */
      setPrevious(value);
      progress.setValue(0);
    });

    return () => flip.stop();
  }, [previous, progress, value]);

  const topRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '-90deg', '-90deg'],
  });
  const bottomRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['90deg', '90deg', '0deg'],
  });

  return (
    <View
      style={{
        backgroundColor: AURORA.base,
        borderColor: AURORA.glassBorder,
        borderRadius: 9,
        borderWidth: 1,
        height: TILE_HEIGHT,
        overflow: 'hidden',
        width: TILE_WIDTH,
      }}
    >
      {/* ชั้นนิ่ง: บนเป็นเลขใหม่ที่รออยู่ ล่างยังเป็นเลขเก่าจนกว่าแผ่นล่างจะกางมาทับ */}
      <TileHalf half="top" value={value} />
      <TileHalf half="bottom" value={previous} />

      {/* แผ่นบนของเลขเก่า พับลงรอบขอบล่างของตัวเอง */}
      <Animated.View
        style={{
          backfaceVisibility: 'hidden',
          left: 0,
          position: 'absolute',
          right: 0,
          top: 0,
          transform: [
            { perspective: 500 },
            { translateY: TILE_HALF / 2 },
            { rotateX: topRotate },
            { translateY: -TILE_HALF / 2 },
          ],
        }}
      >
        <TileHalf half="top" value={previous} />
      </Animated.View>

      {/* แผ่นล่างของเลขใหม่ กางลงมารอบขอบบนของตัวเอง */}
      <Animated.View
        style={{
          backfaceVisibility: 'hidden',
          bottom: 0,
          left: 0,
          position: 'absolute',
          right: 0,
          transform: [
            { perspective: 500 },
            { translateY: -TILE_HALF / 2 },
            { rotateX: bottomRotate },
            { translateY: TILE_HALF / 2 },
          ],
        }}
      >
        <TileHalf half="bottom" value={value} />
      </Animated.View>

      {/* รอยพับกลางแผ่น อยู่บนสุดเพื่อให้เห็นทั้งตอนนิ่งและตอนพลิก */}
      <View
        style={{
          backgroundColor: AURORA.glassBorder,
          height: 1,
          left: 0,
          position: 'absolute',
          right: 0,
          top: TILE_HALF,
        }}
      />
    </View>
  );
}

/**
 * นาฬิกาดิจิทัลในแผ่นข้อมูลบนแผนที่
 *
 * เป็นตัวเดียวในจอที่บอกว่า "ตอนนี้กี่โมง" ซึ่งเป็นข้อมูลที่คนกำลังจะกดปุ่ม
 * ต้องรู้ที่สุด วินาทีเดินอยู่ข้าง ๆ เป็นตัวเล็ก ทำให้เห็นด้วยหางตาว่าเวลา
 * เดินจริง ไม่ใช่ตัวเลขที่ค้างอยู่ตั้งแต่ตอนเปิดจอ
 *
 * เป็นเวลาของ **เครื่อง** ไม่ใช่ของเซิร์ฟเวอร์ — เวลาที่ถูกบันทึกจริงใช้ของ
 * เซิร์ฟเวอร์เสมอ และถ้านาฬิกาเครื่องคลาดเคลื่อนเกินสองนาทีจะมี toast เตือน
 * หลังกดส่ง (ดู CLOCK_DRIFT_WARN_SECONDS)
 */
function DigitalClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);

    return () => clearInterval(timer);
  }, []);

  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    <View style={{ alignItems: 'flex-start', gap: 3 }}>
      {/* ป้ายกำกับอยู่ "บน" ค่า เหมือนช่องข้อมูลทั่วไป ไม่ใช่คำบรรยายห้อยท้าย */}
      <Text
        maxScale={1.05}
        style={{
          color: AURORA.textFaint,
          fontSize: 9.5,
          fontWeight: '800',
          letterSpacing: 0.6,
          lineHeight: 12,
        }}
      >
        เวลาตอนนี้
      </Text>

      {/*
        ชั่วโมงกับนาทีอยู่ในแผ่นป้ายของตัวเอง มีเส้นบานพับพาดกลางแผ่น —
        รูปทรงของนาฬิกาตัวเลขแบบพลิกป้าย (flip clock) ที่ทำให้อ่านเป็น
        "นาฬิกา" ตั้งแต่ยังไม่ทันอ่านตัวเลข ไม่ใช่ตัวเลขสองก้อนวางเฉย ๆ
      */}
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
        <ClockTile value={pad(now.getHours())} />

        <Text
          maxScale={1.05}
          style={{
            color: AURORA.accent,
            fontSize: 22,
            fontWeight: '900',
            lineHeight: 28,
          }}
        >
          :
        </Text>

        <ClockTile value={pad(now.getMinutes())} />

        {/* วินาทีเป็นชิปเล็กข้าง ๆ ไม่ใช่ตัวยกลอยที่ดูเหมือนพิมพ์ผิด */}
        <View
          style={{
            backgroundColor: AURORA.accentSoft,
            borderRadius: 6,
            marginLeft: 2,
            paddingHorizontal: 5,
            paddingVertical: 2,
          }}
        >
          <Text
            maxScale={1.05}
            style={{
              color: AURORA.accent,
              fontSize: 10.5,
              fontVariant: ['tabular-nums'],
              fontWeight: '800',
              lineHeight: 13,
            }}
          >
            {pad(now.getSeconds())}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * สามรอบของวันนี้ = ตัวหนังสือล้วน สามคอลัมน์ **ไม่มีอย่างอื่นเลย**
 *
 * ไม่มีไอคอน ไม่มีวงกลม ไม่มีเส้นเชื่อม ไม่มีเส้นคั่น ไม่มีพื้น — ทั้งบล็อกนี้
 * มีหน้าที่เดียวคือบอกว่าวันนี้ลงเวลาไว้กี่โมงบ้าง ซึ่งตัวเลขบอกเองได้หมดแล้ว
 * ของประดับทุกชิ้นที่เคยใส่ (เม็ดบนเส้นเวลา วงไอคอน เส้นตั้ง) เพิ่มแต่สิ่งที่
 * ตาต้องข้าม โดยไม่ได้เพิ่มข้อมูลสักตัว
 *
 * สถานะเหลือบอกด้วยน้ำหนักสีล้วน ๆ: เวลาที่ลงแล้วเป็นสีเข้ม ที่ยังไม่ลงเป็นสีจาง
 * ส่วนรอบที่ถึงคิวตอนนี้ให้ป้ายชื่อเป็นสีฟ้า — สีเดียว ไม่ใช่ของชิ้นใหม่
 */
function SessionStrip({
  activeCode,
  stamps,
}: {
  /** รอบที่ระบบกำลังรอให้ลงตอนนี้ — ปุ่มข้างล่างพูดถึงรอบนี้ */
  activeCode?: string | null;
  stamps: PunchPanelStamps;
}) {
  const { gutter } = useResponsive();
  const items: { code: string; label: string; value?: Date | null }[] = [
    { code: 'MORNING_IN', label: 'เข้างานเช้า', value: stamps.morningInAt },
    {
      code: 'AFTERNOON_IN',
      label: 'เข้างานบ่าย',
      value: stamps.afternoonInAt,
    },
    { code: 'CHECK_OUT', label: 'ออกงาน', value: stamps.checkOutAt },
  ];

  return (
    /*
     * แถบข้อมูลที่มีเส้นบนเส้นล่างคร่อมไว้ — เส้นสองเส้นทำให้สามช่องนี้อ่านเป็น
     * "แถบเดียว" ไม่ใช่ตัวหนังสือสามกองลอยอยู่กลางที่ว่าง โดยไม่ต้องทาสีพื้น
     * หรือใส่กล่องให้ตาต้องข้ามขอบเพิ่ม
     */
    <View
      style={{
        borderBottomColor: AURORA.glassBorder,
        borderBottomWidth: 1,
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: 1,
        flexDirection: 'row',
        /*
         * เส้นบน-ล่างลากชนขอบจอทั้งสองข้าง — หักระยะขอบของ ScrollView (18)
         * ออกด้วย margin ติดลบ แล้วใส่กลับเป็น padding ให้ตัวเลขยังเรียงตรง
         * กับเนื้อหาที่เหลือของจอ เส้นที่จบก่อนถึงขอบจะอ่านเป็นกล่อง ไม่ใช่
         * เส้นคั่นของหัวข้อที่อยู่เหนือมัน
         */
        marginHorizontal: -18,
        paddingHorizontal: gutter,
        paddingVertical: 12,
      }}
    >
      {items.map((item, index) => {
        const recorded = Boolean(item.value);
        const active = !recorded && item.code === activeCode;

        return (
          <View
            key={item.code}
            style={{
              alignItems: 'center',
              borderLeftColor: AURORA.glassBorder,
              borderLeftWidth: index === 0 ? 0 : 1,
              flex: 1,
              gap: 4,
              minWidth: 0,
            }}
          >
            {/* จุดกลม + ชื่อรอบ อยู่บรรทัดเดียวกัน จัดกลางทั้งคู่ */}
            <View
              style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}
            >
              <View
                style={{
                  backgroundColor: recorded
                    ? AURORA.emerald
                    : active
                      ? AURORA.accent
                      : AURORA.glassBorder,
                  borderRadius: 999,
                  height: 4,
                  width: 4,
                }}
              />
              <Text
                maxScale={1.05}
                numberOfLines={1}
                style={{
                  color: active ? AURORA.accent : AURORA.textFaint,
                  fontSize: 10,
                  fontWeight: '600',
                  lineHeight: 13,
                }}
              >
                {item.label}
              </Text>
            </View>

            <Text
              maxScale={1.1}
              style={{
                color: recorded ? AURORA.text : AURORA.textFaint,
                fontSize: 20,
                fontVariant: ['tabular-nums'],
                fontWeight: '700',
                lineHeight: 25,
                textAlign: 'center',
              }}
            >
              {stampText(item.value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function PunchPanel({
  canPunch = true,
  stamps,
}: {
  /**
   * HR เปิดให้ลงเวลาผ่านแอปหรือยัง (flags.attendancePunch)
   *
   * ปิดอยู่ก็ยังแสดงแผงเต็มรูปแบบ — แผนที่สาขา รอบของวันนี้ ระยะห่าง ครบเหมือน
   * เดิม เพราะข้อมูลพวกนี้เป็นของพนักงานคนนั้นอยู่แล้วและเขาต้องเห็นว่าระบบ
   * มองที่ทำงานของเขาอย่างไร ต่างแค่ปุ่มกดไม่ได้และมีเหตุผลกำกับ
   */
  canPunch?: boolean;
  stamps: PunchPanelStamps;
}) {
  const { gutter } = useResponsive();
  const toast = useToast();

  const context = usePunchContext();
  const punch = usePunch();
  const queue = usePunchQueue();
  const [confirmVisible, setConfirmVisible] = useState(false);
  /*
   * ครอบตั้งแต่ "เริ่มอ่านพิกัด" ไม่ใช่แค่ตอน mutation วิ่ง
   *
   * punch.isPending เริ่มนับหลังได้พิกัดแล้ว ระหว่างรอ GPS จึงไม่มีอะไรบอก
   * ผู้ใช้ว่าแอปกำลังทำงาน และปุ่มยังกดซ้ำได้
   */
  const [submitting, setSubmitting] = useState(false);

  const target = context.data?.locationPolicy.location ?? null;
  const geofenceRequired = Boolean(context.data?.locationPolicy.required);
  /*
   * อ่านพิกัดเสมอ แม้ตำแหน่งนั้นไม่ได้บังคับตรวจ
   *
   * "ไม่บังคับตรวจ" แปลว่าไม่เอาพิกัดมาห้ามลงเวลา ไม่ได้แปลว่าไม่ต้องเก็บ —
   * คนที่ได้รับอนุญาตให้ลงเวลานอกพื้นที่คือกลุ่มที่ HR ต้องรู้ที่สุดว่าอยู่ไหน
   * ตอนกด ก่อนหน้านี้ hook ถูกปิดไว้ ใบลงเวลาจากแอปจึงไม่มีพิกัดติดมาเลย
   * และหน้าตรวจสอบฝั่งเว็บขึ้นว่า "ไม่มีข้อมูลพิกัด GPS ในวันนี้"
   */
  const location = useCurrentLocation(true);

  const evaluation = useMemo(
    () => evaluateGeofence(location.reading, target),
    [location.reading, target],
  );

  const guidance = useMemo(
    () =>
      resolvePunchGuidance({
        context: context.data ?? null,
        geofenceStatus: evaluation.status,
        locationPermission: location.permission,
        metersToEdge: evaluation.metersToEdge,
      }),
    [context.data, evaluation, location.permission],
  );

  async function send() {
    setConfirmVisible(false);
    setSubmitting(true);

    try {
      await sendPunch();
    } finally {
      setSubmitting(false);
    }
  }

  async function sendPunch() {
    /*
     * อ่านพิกัดใหม่ตอนกดส่งเสมอ — ไม่ใช้ตำแหน่งเก่าจากตอนเปิดหน้า
     *
     * ตำแหน่งที่บังคับตรวจรอนานกว่าเพราะ server จะใช้พิกัดตัดสิน ส่วนที่ไม่
     * บังคับ พิกัดเป็นแค่หลักฐานประกอบ จะปล่อยให้ GPS ที่จับสัญญาณไม่ได้
     * (ในอาคาร ชั้นใต้ดิน) มาหน่วงการลงเวลาไม่ได้
     *
     * ทั้งสองเส้นทางต้องมีเพดาน หมดเวลาแล้วใช้พิกัดที่อ่านไว้ตอนเปิดหน้าแทน
     * ซึ่งเป็นพิกัดเดียวกับที่ผู้ใช้เห็นบนวงตำแหน่งอยู่แล้ว และ server ตรวจซ้ำ
     * ให้อีกชั้น
     */
    const fresh = await withTimeout(
      location.refresh(),
      geofenceRequired
        ? REQUIRED_LOCATION_TIMEOUT_MS
        : OPTIONAL_LOCATION_TIMEOUT_MS,
    );

    const reading = fresh ?? location.reading;

    /* บังคับตรวจแต่ไม่มีพิกัดเลย ส่งไปก็ถูกปฏิเสธ บอกทางออกดีกว่า */
    if (geofenceRequired && !reading) {
      toast.error('ยังอ่านตำแหน่งไม่ได้ ลองออกไปที่โล่งแล้วกดใหม่อีกครั้ง');

      return;
    }

    try {
      const result = await punch.mutateAsync({
        location: reading
          ? {
              accuracyMeters: reading.accuracyMeters ?? undefined,
              isMockedSignal: reading.isMocked,
              latitude: reading.latitude,
              longitude: reading.longitude,
            }
          : undefined,
        punchType: context.data?.currentSession?.sessionCode,
      });

      toast.success(`บันทึกเวลา ${timeText(result.recordedAt)} เรียบร้อย`);

      if (
        result.clockDriftSeconds !== null &&
        result.clockDriftSeconds !== undefined &&
        Math.abs(result.clockDriftSeconds) > CLOCK_DRIFT_WARN_SECONDS
      ) {
        toast.warn('นาฬิกาเครื่องคลาดเคลื่อน ระบบบันทึกด้วยเวลาของเซิร์ฟเวอร์');
      }
    } catch (error) {
      const isNetworkFailure =
        error instanceof ApiError &&
        (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT');

      if (isNetworkFailure) {
        try {
          await punchQueue.enqueue({
            capturedAt: new Date().toISOString(),
            location: reading
              ? {
                  accuracyMeters: reading.accuracyMeters ?? undefined,
                  isMockedSignal: reading.isMocked,
                  latitude: reading.latitude,
                  longitude: reading.longitude,
                }
              : undefined,
            punchType: context.data?.currentSession?.sessionCode,
          });

          void queue.refetch();
          toast.warn(
            'เน็ตไม่ถึงเซิร์ฟเวอร์ เก็บไว้ส่งให้อัตโนมัติเมื่อกลับมาออนไลน์',
          );

          return;
        } catch (queueError) {
          toast.error(
            queueError instanceof Error
              ? queueError.message
              : 'เก็บรายการไว้ส่งภายหลังไม่สำเร็จ',
          );

          return;
        }
      }

      toast.error(
        error instanceof ApiError
          ? error.message
          : 'บันทึกเวลาไม่สำเร็จ กรุณาลองใหม่',
      );
    }
  }

  function handlePress() {
    if (guidance.requiresConfirmation) {
      setConfirmVisible(true);

      return;
    }

    void send();
  }

  if (context.isPending) {
    return (
      <View style={{ paddingVertical: 4 }}>
        <Skeleton height={200} radius={22} />
      </View>
    );
  }

  if (context.isError) {
    return (
      <View style={{ gap: 6, paddingVertical: 12 }}>
        <Text maxScale={1.2} style={{ color: AURORA.textMuted, fontSize: 12 }}>
          {context.error instanceof ApiError
            ? context.error.message
            : 'ยังดูรอบลงเวลาไม่ได้'}
        </Text>
        <SectionAction label="ลองใหม่" onPress={() => void context.refetch()} />
      </View>
    );
  }

  const session = context.data?.currentSession ?? null;
  const alreadyRecorded = Boolean(
    !context.data?.allowed &&
      context.data?.reason?.includes('บันทึกรอบนี้แล้ว'),
  );
  const busy = submitting || punch.isPending;
  const disabled = !canPunch || alreadyRecorded || !guidance.canAttempt || busy;

  /*
   * มี "เขตที่บังคับ" ก็ต่อเมื่อนโยบายทั้งปักจุดไว้และตั้งให้บังคับตรวจ — ขาด
   * อย่างใดอย่างหนึ่งก็ถือว่าลงเวลาได้ทุกที่ ซึ่งเปลี่ยนทั้งภาพและข้อความ
   */
  const enforcedArea = geofenceRequired ? target : null;

  /*
   * สถานะตำแหน่งที่เอาไปแสดง — คนที่ลงเวลาได้ทุกที่ต้องไม่เห็นคำว่า "อยู่นอก
   * พื้นที่" สีแดง เพราะเขาไม่ได้ทำอะไรผิด ระบบแค่เก็บพิกัดไว้เป็นหลักฐาน
   */
  const distanceText =
    evaluation.distanceMeters === null
      ? null
      : formatDistance(evaluation.distanceMeters);

  const locationState = enforcedArea
    ? {
        caption: `พื้นที่อนุญาต ${formatDistance(enforcedArea.radiusMeters)}`,
        color: GEOFENCE_STATUS[evaluation.status].color,
        label: distanceText
          ? `${GEOFENCE_STATUS[evaluation.status].label} · ห่าง ${distanceText}`
          : GEOFENCE_STATUS[evaluation.status].label,
      }
    : {
        /*
         * ระยะห่างจากบริษัทอยู่ในบรรทัดของตัวเอง ไม่ใช่ต่อท้ายสถานะ — คนกลุ่มนี้
         * ไม่มี "สถานะในเขต/นอกเขต" ให้ขยาย ระยะจึงเป็นข้อมูลของมันเอง
         *
         * ถ้านโยบายไม่ได้ปักจุดบริษัทไว้เลย ก็ไม่มีอะไรให้วัดระยะจาก บอกตรง ๆ
         * ว่าเก็บพิกัดไว้เป็นหลักฐาน ดีกว่าโชว์ขีดกลางว่าง ๆ
         */
        caption: distanceText
          ? `ห่างจากบริษัท ${distanceText}`
          : target
            ? `จุดของบริษัทคือ ${target.name}`
            : 'บันทึกพิกัดไว้เป็นหลักฐานเท่านั้น',
        color: AURORA.accent,
        label: 'ลงเวลาได้ทุกที่',
      };

  return (
    /* ไม่มีการ์ดครอบ — วางบนผิวเดียวกับจอ เหมือนทุกหมวดบนหน้าหลัก */
    <View style={{ gap: 14 }}>
      <SessionStrip activeCode={session?.sessionCode} stamps={stamps} />

      {/*
        เครื่องลงเวลา — กล่องสี่เหลี่ยมใบเดียวที่รวมนาฬิกากับแผนที่ไว้ด้วยกัน
        เหมือนเครื่องตอกบัตรจริงที่ติดอยู่หน้าออฟฟิศ

        โครงเป็นสองชั้น: **ตัวเครื่อง**สีน้ำเงินเป็นกรอบ กับ**หน้าจอ**สีขาว
        อยู่ข้างใน ปุ่มอ่านตำแหน่งใหม่อยู่บนตัวเครื่อง ไม่ใช่บนหน้าจอ —
        เหมือนปุ่มจริงที่อยู่บนขอบเครื่อง ไม่ใช่ในจอ

        ขึ้นเสมอ ไม่ว่านโยบายจะปักจุดไว้หรือไม่ — เดิมกล่องนี้หายไปทั้งใบเมื่อ
        บัญชีถูกตั้งให้ลงเวลาได้ทุกที่ (ไม่มี `target`) เหลือแค่นาฬิกาโดด ๆ
        ซึ่งทำให้คนกลุ่มนั้นได้จอที่ว่างกว่าคนอื่นทั้งที่ใช้งานเหมือนกัน
      */}
      {
        <View style={{ gap: 9 }}>
          {/*
            แผนที่กินทั้งกล่องสี่เหลี่ยม ไม่ใช่วงกลมเล็ก ๆ วางอยู่ข้างในอีกที —
            ผิวแผนที่เต็มใบทำให้กล่องนี้อ่านเป็น "ที่ตั้งจุดลงเวลา" ตั้งแต่แวบแรก

            เวลากับสถานะลอยอยู่บนแผนที่เป็นแผ่นขาว เหมือนการ์ดข้อมูลของแอปแผนที่
            ทั่วไป ไม่ได้แย่งพื้นที่ของแผนที่ไปเป็นคอลัมน์ของตัวเอง
          */}
          <View
            style={{
              borderColor: AURORA.glassBorder,
              borderRadius: 22,
              borderWidth: 1,
              height: 250,
              overflow: 'hidden',
            }}
          >
            {/*
              คนที่ลงเวลาได้ทุกที่ได้ภาพคนละแบบ — ถนนกับรถ ไม่ใช่วงเขต เพราะ
              วงเขตจะขึ้นจุดแดง "อยู่นอกพื้นที่" ให้เขาทั้งที่ไม่ได้ทำอะไรผิด
            */}
            {enforcedArea ? (
              <GeofenceMapSurface
                distanceMeters={evaluation.distanceMeters}
                reading={location.reading}
                status={evaluation.status}
                target={enforcedArea}
              />
            ) : (
              <OffsiteMapSurface />
            )}

            <View
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                borderColor: AURORA.glassBorder,
                borderRadius: 16,
                borderWidth: 1,
                bottom: 10,
                elevation: 3,
                gap: 7,
                left: 10,
                paddingHorizontal: 13,
                paddingVertical: 11,
                position: 'absolute',
                right: 10,
                shadowColor: AURORA.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 10,
              }}
            >
              {/*
                สองฝั่งคั่นด้วยเส้นตั้ง: ซ้ายคือ "เมื่อไร" ขวาคือ "ที่ไหน"

                เดิมเรียงเป็นสามชั้นซ้อนกัน (เวลา+สถานะ / เส้นคั่นเต็มความกว้าง /
                ชื่อสถานที่) ทำให้แผ่นสูงและตาต้องกวาดขึ้นลง แบ่งซ้าย-ขวาแล้ว
                แต่ละฝั่งตอบคนละคำถาม อ่านจบในกวาดเดียว
              */}
              <View style={{ flexDirection: 'row', gap: 13 }}>
                <DigitalClock />

                <View
                  style={{
                    borderLeftColor: AURORA.glassBorder,
                    borderLeftWidth: 1,
                    flex: 1,
                    gap: 3,
                    justifyContent: 'center',
                    minWidth: 0,
                    paddingLeft: 13,
                  }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: 5,
                    }}
                  >
                    <Icon color={AURORA.accent} name="map-pin" size={13} />
                    <Text
                      maxScale={1.1}
                      numberOfLines={1}
                      style={{
                        color: AURORA.text,
                        flex: 1,
                        fontSize: 12.5,
                        fontWeight: '800',
                        lineHeight: 17,
                      }}
                    >
                      {target?.name ?? 'ทำงานนอกสถานที่'}
                    </Text>
                  </View>

                  {/* ป้ายสถานะ = จุดกลม + ข้อความสีเดียวกัน ตามกติกาของแอป */}
                  <View
                    style={{
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: 5,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: locationState.color,
                        borderRadius: 999,
                        height: 5,
                        width: 5,
                      }}
                    />
                    <Text
                      maxScale={1.1}
                      numberOfLines={1}
                      style={{
                        color: locationState.color,
                        flex: 1,
                        fontSize: 11.5,
                        fontWeight: '800',
                        lineHeight: 15,
                      }}
                    >
                      {locationState.label}
                    </Text>
                  </View>

                  <Text
                    maxScale={1.15}
                    numberOfLines={1}
                    style={{
                      color: AURORA.textFaint,
                      fontSize: 10.5,
                      lineHeight: 14,
                    }}
                  >
                    {locationState.caption}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ปุ่มอยู่นอกกล่อง วางบนผิวของจอ เหมือนลิงก์ของหมวดอื่น ๆ */}
          <PressableScale
            accessibilityLabel="อ่านตำแหน่งใหม่"
            accessibilityRole="button"
            disabled={location.isReading}
            onPress={() => void location.refresh()}
            style={{
              alignItems: 'center',
              alignSelf: 'center',
              flexDirection: 'row',
              gap: 5,
              opacity: location.isReading ? 0.5 : 1,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Icon
              color={AURORA.accent}
              name={location.isReading ? 'loader' : 'refresh-cw'}
              size={13}
            />
            <Text
              maxScale={1.15}
              style={{
                color: AURORA.accent,
                fontSize: 10.5,
                fontWeight: '800',
              }}
            >
              {location.isReading ? 'กำลังอ่านตำแหน่ง…' : 'อัปเดตตำแหน่ง'}
            </Text>
          </PressableScale>
        </View>
      }

      {/*
        ลงครบรอบนี้แล้วไม่ต้องขึ้นแถบ "ลงเวลาเรียบร้อยแล้ว" อีก — เวลาที่บันทึก
        โชว์อยู่ในแถวสามรอบข้างบนแล้ว และปุ่มข้างล่างก็เปลี่ยนเป็นสีเขียวพร้อม
        ข้อความเดียวกัน แถบนี้จึงเป็นการพูดเรื่องเดิมซ้ำเป็นครั้งที่สาม
      */}
      {/*
        ไม่มีสิทธิ์กด = เหตุผลเดียวที่ต้องบอก ข้อความเรื่องพื้นที่/ตำแหน่งของ
        guidance ไม่มีประโยชน์กับเขา เพราะแก้อย่างไรก็ยังกดไม่ได้อยู่ดี
      */}
      {!canPunch ? (
        <GuidanceNotice
          blocked
          icon="lock"
          message="บัญชีนี้ยังไม่ได้เปิดให้ลงเวลาผ่านมือถือ ติดต่อฝ่ายบุคคลหากต้องการใช้งาน"
        />
      ) : !alreadyRecorded && guidance.message ? (
        <GuidanceNotice
          blocked={guidance.level === 'BLOCKED'}
          icon={guidance.level === 'BLOCKED' ? 'x-circle' : 'alert-triangle'}
          message={guidance.message}
        />
      ) : null}

      {location.reading?.isMocked ? (
        <GuidanceNotice
          blocked
          icon="alert-triangle"
          message="ตรวจพบสัญญาณการปลอมตำแหน่งบนเครื่องนี้ ระบบจะบันทึกไว้ให้ HR ตรวจสอบ"
        />
      ) : null}

      {/*
        ปุ่มหลัก — ฟ้าทึบตอนยังต้องกด และกลายเป็นแถบฟ้าจางตอนลงครบรอบนี้แล้ว

        เดิมตอนลงเสร็จปุ่มเปลี่ยนเป็นแผ่นเขียวเข้มเต็มความกว้าง ซึ่งเป็นก้อนสี
        ที่ใหญ่ที่สุดในจอทั้งที่มันไม่ใช่ของที่ต้องทำอะไรต่อ และเขียวก้อนขนาดนั้น
        ก็ทำให้จอนี้หลุดจากโทนฟ้า–ขาวของหน้าหลักไปเลย ตอนนี้ "เสร็จแล้ว" เป็น
        แถบฟ้าจางตัวหนังสือเขียว — เขียวเหลือแค่ขนาดของ "ป้ายสถานะ" เท่านั้น
      */}
      <PressableScale
        accessibilityLabel={guidance.actionLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={handlePress}
        /* ป้ายปุ่มเปลี่ยนตามรอบและสถานะ E2E จึงต้องอ้างด้วย testID */
        testID="punch-primary-action"
        style={{
          alignItems: 'center',
          alignSelf: 'stretch',
          /*
           * ลงเสร็จแล้วเป็นปุ่มเขียวทึบเต็มใบ ทรงเดียวกับตอนยังไม่ได้กด —
           * ต่างกันแค่สี ไม่ใช่คนละรูปแบบ (เคยทำเป็นพื้นจางขอบเขียวแล้วมันดู
           * เป็นปุ่มที่กดไม่ได้มากกว่าจะเป็นปุ่มที่ทำงานเสร็จแล้ว)
           */
          backgroundColor: alreadyRecorded ? AURORA.emerald : AURORA.accent,
          borderRadius: 18,
          elevation: 3,
          flexDirection: 'row',
          gap: 9,
          justifyContent: 'center',
          minHeight: 56,
          opacity: disabled && !alreadyRecorded ? 0.42 : 1,
          paddingHorizontal: gutter,
          shadowColor: alreadyRecorded ? AURORA.emerald : AURORA.accent,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.22,
          shadowRadius: 12,
        }}
      >
        <Icon
          color="#ffffff"
          name={alreadyRecorded ? 'check-circle' : 'clock'}
          size={20}
        />
        <Text
          maxScale={1.15}
          style={{
            color: '#ffffff',
            fontSize: 14.5,
            fontWeight: '900',
          }}
        >
          {alreadyRecorded
            ? 'ลงเวลาเรียบร้อยแล้ว'
            : punch.isPending
              ? 'กำลังบันทึก…'
              : submitting
                ? 'กำลังอ่านตำแหน่ง…'
                : guidance.actionLabel}
        </Text>
      </PressableScale>

      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 5,
          justifyContent: 'center',
        }}
      >
        <Icon color={AURORA.textFaint} name="shield" size={11} />
        <Text maxScale={1.2} style={{ color: AURORA.textFaint, fontSize: 9.5 }}>
          ระบบบันทึกด้วยเวลาเซิร์ฟเวอร์
        </Text>
      </View>

      <ConfirmDialog
        confirmLabel="ลงเวลาต่อไป"
        loading={busy}
        message={guidance.message ?? undefined}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => void send()}
        title="ยืนยันการลงเวลา"
        visible={confirmVisible}
      />
    </View>
  );
}
