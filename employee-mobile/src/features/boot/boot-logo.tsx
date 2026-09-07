import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { AURORA } from '@/design/aurora';

/**
 * ตราองค์กรที่ประกอบตัวเองขึ้นมา — ใช้ตอนรอโหลด
 *
 * ## ทำไมต้องหั่นเป็นสามชิ้น
 *
 * จอ splash ของระบบเป็นภาพนิ่ง ขยับไม่ได้ เพราะ OS วาดมันก่อน JS จะเริ่มทำงาน
 * อนิเมชันจึงต้องเป็นจอในแอปที่ขึ้นต่อจาก splash แล้ววาดตราเดิมซ้ำในตำแหน่ง
 * เดียวกันเป๊ะ ตาจะได้อ่านเป็นภาพเดียวที่เริ่มขยับ ไม่ใช่สองจอที่สลับกัน
 *
 * ตัว T J C ในโลโก้เกี่ยวกันอยู่ ตัดตามตัวอักษรไม่ได้ (ลองแล้ว คอลัมน์ว่าง
 * ระหว่างตัวอักษรไม่มีเลยสักคอลัมน์) แต่ตัดตามแนวนอนได้สะอาดสามท่อน:
 * จุดของตัว J · ตัวอักษร · บรรทัดชื่อเต็ม
 *
 * ## สี่จังหวะ
 *
 *   1. จุดของตัว J ร่วงลงมาแล้วเด้ง พร้อมยุบตัวตอนกระแทกเหมือนของมีน้ำหนัก
 *   2. ตัวอักษร TJC จางขึ้นพร้อมขยายจาก 92%
 *   3. แสงกวาดผ่านตัวอักษร — ใช้ตัวอักษรก๊อปสีขาวเลื่อนผ่านช่องแคบ ๆ แสงจึง
 *      วิ่งไปตามรูปตัวอักษรจริง ไม่ใช่แถบสี่เหลี่ยมพาดทับ
 *   4. บรรทัดชื่อเต็มถูกเปิดออกจากซ้ายไปขวา ด้วยแผ่นขาวที่เลื่อนหนี — พื้นจอ
 *      เป็นขาวอยู่แล้ว แผ่นขาวจึงมองไม่เห็นและอ่านเป็นตัวอักษรค่อย ๆ โผล่
 *
 * ไม่มีวงกลมหรือพื้นอะไรข้างหลังตรา — ตราบนพื้นขาวล้วนคือสิ่งที่ผู้ใช้เห็น
 * ตอน splash ของระบบอยู่แล้ว มีวงเพิ่มเข้ามาเมื่อไรก็กลายเป็นคนละภาพกัน
 *
 * แล้วจบด้วยลมหายใจช้า ๆ กับจุดสามจุดที่ไล่กะพริบ บอกว่ายังโหลดอยู่
 *
 * ## ตำแหน่งเป็นสัดส่วน ไม่ใช่พิกเซล
 *
 * ทุกชิ้นวางด้วยเปอร์เซ็นต์ของกรอบ ค่าที่ใช้มาจากตำแหน่งจริงในไฟล์ต้นฉบับ
 * (900×522) จึงย่อขยายไปขนาดไหนก็ยังประกอบกลับเป็นตราเดิมพอดี
 *
 * ทุกค่าที่ขยับเป็น opacity/transform ล้วน จึงวิ่งบนเธรด UI ได้ทั้งหมด
 * (`useNativeDriver`) ไม่กระตุกตอน query หลายตัวตอบพร้อมกันตอนเปิดแอป
 */

/** อัตราส่วนของตราเต็ม — กว้าง 900 สูง 522 ในไฟล์ต้นฉบับ */
const ASPECT = 900 / 522;

/* สัดส่วนของแต่ละชิ้นในกรอบ วัดจากไฟล์จริงตอนหั่น */
const DOT = { height: 0.2395, left: 0.4611, top: 0, width: 0.1489 };
const LETTERS = { height: 0.5958, left: 0, top: 0.2433, width: 1 };
const SUBTITLE = { height: 0.1034, left: 0.1467, top: 0.8966, width: 0.71 };

/** ความกว้างของลำแสงที่กวาดผ่านตัวอักษร เป็นสัดส่วนของความกว้างตรา */
const SHINE_WIDTH = 0.22;

export interface BootLogoProps {
  /** ความกว้างของตราเป็นพิกเซล ความสูงคำนวณจากอัตราส่วนจริง */
  width?: number;
}

export function BootLogo({ width = 240 }: BootLogoProps) {
  const height = width / ASPECT;

  /* ค่าเดียวต่อหนึ่งจังหวะ 0 = ยังไม่มา, 1 = เข้าที่แล้ว */
  const [dot] = useState(() => new Animated.Value(0));
  const [letters] = useState(() => new Animated.Value(0));
  const [wipe] = useState(() => new Animated.Value(0));
  const [shine] = useState(() => new Animated.Value(0));
  const [breath] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const entrance = Animated.sequence([
      /* หน่วงสั้น ๆ ก่อนของชิ้นแรกจะมา ให้จอนิ่งก่อนหนึ่งจังหวะ */
      Animated.delay(260),
      /* จุดร่วงลงมาเกาะหัว J — สปริงหน่วงพอให้เด้งครั้งเดียว ไม่ใช่สั่นรัว */
      Animated.spring(dot, {
        bounciness: 11,
        speed: 6,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(letters, {
        duration: 620,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(wipe, {
        duration: 760,
        easing: Easing.inOut(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);

    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, {
          duration: 1150,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        /* พักก่อนกวาดรอบถัดไป ไม่งั้นมันวิ่งรัวจนกลายเป็นไฟกะพริบ */
        Animated.delay(1700),
        Animated.timing(shine, {
          duration: 0,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.timing(pulse, {
        duration: 1500,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );

    entrance.start(({ finished }) => {
      if (!finished) return;

      shineLoop.start();
      breathLoop.start();
    });
    pulseLoop.start();

    return () => {
      entrance.stop();
      shineLoop.stop();
      breathLoop.stop();
      pulseLoop.stop();
    };
  }, [breath, dot, letters, pulse, shine, wipe]);

  /* แสงกวาด: ช่องแคบเลื่อนไปทางขวา ส่วนตัวอักษรข้างในเลื่อนสวนทางเท่ากัน
     ภาพที่เห็นจึงเป็นแสงวิ่งผ่านตัวอักษรที่อยู่นิ่ง */
  const shineTravel = width * (1 + SHINE_WIDTH);
  const shineX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * SHINE_WIDTH, shineTravel],
  });
  const shineInnerX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [width * SHINE_WIDTH, -shineTravel],
  });

  return (
    <View style={{ alignItems: 'center', gap: height * 0.16 }}>
      <Animated.View
        style={{
          alignItems: 'center',
          height,
          justifyContent: 'center',
          transform: [
            {
              scale: breath.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.02],
              }),
            },
          ],
          width,
        }}
      >
        {/* ตัวอักษร — จางขึ้นพร้อมขยายจาก 92% ไม่ใช่โผล่มาเฉย ๆ */}
        <Animated.View
          style={{
            height: height * LETTERS.height,
            left: width * LETTERS.left,
            opacity: letters,
            overflow: 'hidden',
            position: 'absolute',
            top: height * LETTERS.top,
            transform: [
              {
                scale: letters.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
            width: width * LETTERS.width,
          }}
        >
          <Image
            contentFit="contain"
            source={require('../../../assets/logo-part-letters.png')}
            style={{ height: '100%', width: '100%' }}
          />

          <Animated.View
            style={{
              height: '100%',
              left: 0,
              overflow: 'hidden',
              position: 'absolute',
              top: 0,
              transform: [{ translateX: shineX }],
              width: width * SHINE_WIDTH,
            }}
          >
            <Animated.View
              style={{
                height: '100%',
                position: 'absolute',
                transform: [{ translateX: shineInnerX }],
                width,
              }}
            >
              <Image
                contentFit="contain"
                source={require('../../../assets/logo-part-letters.png')}
                style={{ height: '100%', opacity: 0.75, width: '100%' }}
                tintColor="#ffffff"
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>

        {/* จุดของตัว J — ร่วงลงมาจากเหนือกรอบแล้วยุบตัวตอนกระแทก */}
        <Animated.View
          style={{
            height: height * DOT.height,
            left: width * DOT.left,
            opacity: dot.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [0, 1, 1],
            }),
            position: 'absolute',
            top: height * DOT.top,
            transform: [
              {
                translateY: dot.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-height * 0.5, 0],
                }),
              },
              {
                scaleY: dot.interpolate({
                  inputRange: [0, 0.82, 0.93, 1],
                  outputRange: [1, 1, 0.82, 1],
                }),
              },
              {
                scaleX: dot.interpolate({
                  inputRange: [0, 0.82, 0.93, 1],
                  outputRange: [1, 1, 1.14, 1],
                }),
              },
            ],
            width: width * DOT.width,
          }}
        >
          <Image
            contentFit="contain"
            source={require('../../../assets/logo-part-dot.png')}
            style={{ height: '100%', width: '100%' }}
          />
        </Animated.View>

        {/* ชื่อเต็ม — เปิดออกจากซ้ายไปขวาด้วยแผ่นขาวที่เลื่อนหนี */}
        <View
          style={{
            height: height * SUBTITLE.height,
            left: width * SUBTITLE.left,
            overflow: 'hidden',
            position: 'absolute',
            top: height * SUBTITLE.top,
            width: width * SUBTITLE.width,
          }}
        >
          <Image
            contentFit="contain"
            source={require('../../../assets/logo-part-subtitle.png')}
            style={{ height: '100%', width: '100%' }}
          />
          <Animated.View
            style={{
              backgroundColor: '#ffffff',
              bottom: 0,
              left: 0,
              position: 'absolute',
              right: 0,
              top: 0,
              transform: [
                {
                  translateX: wipe.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, width * SUBTITLE.width],
                  }),
                },
              ],
            }}
          />
        </View>
      </Animated.View>

      {/* สามจุดไล่กะพริบ — ตัวเดียวในจอที่บอกว่า "ยังทำงานอยู่" ไม่ใช่ค้าง */}
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {[0, 1, 2].map((index) => (
          <Animated.View
            key={index}
            style={{
              backgroundColor: AURORA.accent,
              borderRadius: 999,
              height: 6,
              opacity: pulse.interpolate({
                /* จุดที่ i สว่างตอนเข็มนาฬิกาผ่านช่วงของมัน แล้วหรี่ลงต่อ */
                inputRange: [
                  0,
                  index * 0.22,
                  index * 0.22 + 0.14,
                  index * 0.22 + 0.42,
                  1,
                ],
                outputRange: [0.22, 0.22, 1, 0.22, 0.22],
              }),
              width: 6,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * จอโหลดเต็มจอ — ตราอยู่กลางจอตำแหน่งเดียวกับ splash ของระบบ
 *
 * ## จะหายเมื่อไร
 *
 * ต้องครบทั้งสองเงื่อนไข: แอปพร้อมจริง (`ready`) **และ** อนิเมชันได้เล่นครบ
 * จังหวะแล้ว (`minimumMs`) — ที่ต้องรอครบจังหวะเพราะแอปที่บูตเร็วจะทำให้ตรา
 * แวบเดียวแล้วหาย ซึ่งอ่านเป็นจอกระพริบ ไม่ใช่การเปิดแอป
 *
 * `maximumMs` เป็นตาข่ายกันเหนียว: ถ้าสัญญาณ `ready` ไม่มาสักที (อ่านเซสชัน
 * จากที่เก็บค้าง สิทธิ์ถูกถอน ฯลฯ) จอนี้ต้องยอมหลบไปให้จอข้างหลังได้บอกปัญหา
 * ของมันเอง ไม่ใช่ค้างเป็นโลโก้หายใจอยู่อย่างนั้น
 */
export function BootSplash({
  maximumMs = 6000,
  minimumMs = 3200,
  onFinish,
  ready = true,
}: {
  /** นานสุดที่ยอมรอ `ready` — เกินนี้หลบไปเลย */
  maximumMs?: number;
  /** เร็วสุดที่ยอมให้จอนี้หาย นับจากตอนโผล่ */
  minimumMs?: number;
  onFinish?: () => void;
  /** แอปพร้อมพาผู้ใช้ไปจอถัดไปแล้วหรือยัง */
  ready?: boolean;
}) {
  const [fade] = useState(() => new Animated.Value(1));
  const [minimumPassed, setMinimumPassed] = useState(false);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const closing = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumPassed(true), minimumMs);

    return () => clearTimeout(timer);
  }, [minimumMs]);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedTooLong(true), maximumMs);

    return () => clearTimeout(timer);
  }, [maximumMs]);

  useEffect(() => {
    if (closing.current) return;
    if (!waitedTooLong && !(ready && minimumPassed)) return;

    closing.current = true;
    Animated.timing(fade, {
      duration: 420,
      easing: Easing.out(Easing.quad),
      toValue: 0,
      useNativeDriver: true,
    }).start(() => onFinish?.());
  }, [fade, minimumPassed, onFinish, ready, waitedTooLong]);

  return (
    <Animated.View
      /* ไม่รับการแตะเลย เผื่อจังหวะจางออกคาบเกี่ยวกับจอข้างหลังที่พร้อมแล้ว */
      pointerEvents="none"
      style={{
        alignItems: 'center',
        backgroundColor: '#ffffff',
        bottom: 0,
        justifyContent: 'center',
        left: 0,
        opacity: fade,
        position: 'absolute',
        right: 0,
        top: 0,
        transform: [
          {
            /* ตราถอยลึกลงนิดหนึ่งตอนจาง ทำให้รู้สึกว่าจอข้างหลังเข้ามาแทน
               ไม่ใช่ตราหายไปเฉย ๆ */
            scale: fade.interpolate({
              inputRange: [0, 1],
              outputRange: [1.06, 1],
            }),
          },
        ],
      }}
    >
      <BootLogo width={250} />
    </Animated.View>
  );
}
