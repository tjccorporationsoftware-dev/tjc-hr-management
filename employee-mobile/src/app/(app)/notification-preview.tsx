import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Text, useToast, type IconName } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  NotificationMotif,
  PageHero,
  PageSection,
  Reveal,
} from '@/design/aurora';
import {
  getNotificationLoadError,
  isExpoGo,
  isLocalNotificationSupported,
  loadLocalNotifications,
} from '@/features/notifications/push-runtime';

/**
 * ตัวอย่างการแจ้งเตือนทุกแบบ — จอสำหรับตรวจงานดีไซน์ ไม่ใช่จอของผู้ใช้ทั่วไป
 *
 * รวมของที่กระจายอยู่คนละที่ให้กดดูได้ในจอเดียว:
 *   - แถบลอยในแอป (`useToast`) ทั้งสี่โทน
 *   - แจ้งเตือนของระบบปฏิบัติการที่เด้งขึ้นมาบนมือถือจริง
 *
 * **แจ้งเตือนของระบบที่ยิงจากจอนี้เป็นของ "ในเครื่อง" (local notification)**
 * หน้าตาบนแถบแจ้งเตือนเหมือนกับที่ backend ส่งมาทุกอย่าง ต่างกันแค่ต้นทาง
 * จึงใช้ตรวจดีไซน์ได้โดยไม่ต้องรอให้เกิดเหตุจริงในระบบ
 *
 * Expo Go ตั้งแต่ SDK 53 รับ push จากเซิร์ฟเวอร์ไม่ได้ แต่ยัง**ยิงของในเครื่อง
 * ได้ตามปกติ** — จอนี้จึงยังใช้ตรวจหน้าตาได้แม้รันด้วย Expo Go
 */

/** ตัวอย่างข้อความจริงของแต่ละเรื่องที่ระบบส่งเข้ามือถือ */
const PUSH_SAMPLES: {
  body: string;
  icon: IconName;
  key: string;
  title: string;
}[] = [
  {
    body: 'นางสาว สุภาพร สองเมือง ยื่นใบลากิจ 8–9 ก.ย. รอการอนุมัติของคุณ',
    icon: 'check-square',
    key: 'approval',
    title: 'มีคำขอรออนุมัติ',
  },
  {
    body: 'ใบลาป่วยวันที่ 6 ก.ย. ได้รับการอนุมัติแล้ว',
    icon: 'file-text',
    key: 'request',
    title: 'คำขอของคุณได้รับการอนุมัติ',
  },
  {
    body: 'ตอนนี้ 08:45 น. แล้ว ยังไม่พบการลงเวลาเข้างานของคุณ',
    icon: 'clock',
    key: 'attendance',
    title: 'ยังไม่ได้ลงเวลาเข้างาน',
  },
  {
    body: 'สลิปเงินเดือนงวดสิงหาคม 2569 พร้อมให้ดูแล้ว',
    icon: 'credit-card',
    key: 'payroll',
    title: 'สลิปเงินเดือนออกแล้ว',
  },
  {
    body: 'พรุ่งนี้มีลูกทีมลา 2 คน — สุภาพร (ลากิจ) และ ปิยะ (ลาพักร้อน)',
    icon: 'users',
    key: 'team',
    title: 'พรุ่งนี้มีลูกทีมลา',
  },
];

/**
 * การ์ดจำลองแจ้งเตือนของระบบ — สำหรับตรวจดีไซน์ตอนยิงของจริงไม่ได้
 *
 * Expo Go บน Android โหลดโมดูลแจ้งเตือนไม่ได้เลย (ดู `loadLocalNotifications`)
 * และเว็บก็ไม่มีแถบแจ้งเตือน แต่สิ่งที่ต้องตรวจคือ **ข้อความกับการตัดบรรทัด**
 * ซึ่งวาดเลียนแบบได้ครบ — ไม่ต้องรอ build ก่อนถึงจะรู้ว่าหัวข้อยาวไปหรือยัง
 *
 * ยึดหน้าตาของแถบแจ้งเตือน Android: ไอคอนแอปกับชื่อแอปบรรทัดบน หัวข้อตัวหนา
 * เนื้อความสองบรรทัด ทั้งหมดอยู่บนแผ่นมนสีอ่อน
 */
function MockNotification({
  body,
  title,
}: {
  body: string;
  title: string;
}) {
  return (
    <View
      style={{
        backgroundColor: '#f1f3f7',
        borderRadius: 20,
        gap: 6,
        padding: 14,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: AURORA.accent,
            borderRadius: 6,
            height: 16,
            justifyContent: 'center',
            width: 16,
          }}
        >
          <Text maxScale={1} style={{ color: '#ffffff', fontSize: 7.5, fontWeight: '800' }}>
            HR
          </Text>
        </View>
        <Text
          maxScale={1.05}
          style={{ color: '#5b6474', fontSize: 11, lineHeight: 15 }}
        >
          HR-TJC · ตอนนี้
        </Text>
      </View>

      <Text
        style={{
          color: '#14181f',
          fontSize: 13.5,
          fontWeight: '700',
          lineHeight: 19,
        }}
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        style={{ color: '#3d4553', fontSize: 12.5, lineHeight: 18 }}
      >
        {body}
      </Text>
    </View>
  );
}

/** แถวปุ่มกดในจอนี้ — ไอคอนในวงสี ชื่อ คำอธิบาย แล้วลูกศร */
function ActionRow({
  color,
  divider,
  icon,
  onPress,
  subtitle,
  title,
}: {
  color: string;
  divider: boolean;
  icon: IconName;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        marginHorizontal: -4,
        paddingHorizontal: 4,
        paddingVertical: 11,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${color}1a`,
          borderRadius: 12,
          height: 38,
          justifyContent: 'center',
          width: 38,
        }}
      >
        <Icon color={color} name={icon} size={17} />
      </View>

      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            color: AURORA.text,
            fontSize: 13.5,
            fontWeight: '700',
            lineHeight: 19,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 16 }}
        >
          {subtitle}
        </Text>
      </View>

      <Icon color={AURORA.textFaint} name="chevron-right" size={17} />
    </Pressable>
  );
}

export default function NotificationPreviewScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const toast = useToast();
  const [pushNote, setPushNote] = useState<string | null>(null);
  /* ตัวอย่างที่กำลังดูอยู่ตอนยิงของจริงไม่ได้ — วาดเป็นการ์ดจำลองแทน */
  const [mock, setMock] = useState<(typeof PUSH_SAMPLES)[number] | null>(
    null,
  );

  /**
   * ยิงแจ้งเตือนของระบบในอีกสองวินาที
   *
   * หน่วงไว้เพื่อให้ผู้ตรวจมีเวลาย่อแอปลงไปดูบนแถบแจ้งเตือนจริง — ถ้ายิงทันที
   * ระบบจะแสดงเป็นแบนเนอร์ทับแอปที่เปิดอยู่ ซึ่งเป็นคนละหน้าตากับที่ผู้ใช้เห็น
   * ตอนแอปปิดอยู่ ซึ่งเป็นเคสที่ต้องตรวจจริง ๆ
   */
  async function firePush(sample: (typeof PUSH_SAMPLES)[number]) {
    /*
     * ห่อทั้งก้อนด้วย try/catch — จอนี้เรียกโมดูลเนทีฟที่ "มี/ไม่มี" ต่างกัน
     * ตามสภาพแวดล้อม (เว็บ · Expo Go · dev build · แอปจริง) อะไรที่หายไปสัก
     * ฟังก์ชันจะกลายเป็น unhandled promise rejection แล้วขึ้นจอแดงทับทั้งแอป
     * ทั้งที่ควรเป็นแค่บรรทัดบอกว่าตรงนี้ทำไม่ได้
     */
    try {
      /*
       * ยิงของจริงไม่ได้ ≠ ตรวจดีไซน์ไม่ได้ — วาดการ์ดจำลองให้ดูข้อความกับ
       * การตัดบรรทัดแทน ซึ่งเป็นสิ่งที่ต้องตรวจจริง ๆ ในจอนี้
       */
      if (!isLocalNotificationSupported) {
        setMock(sample);
        setPushNote(
          isExpoGo
            ? 'Expo Go โหลดโมดูลแจ้งเตือนไม่ได้ตั้งแต่ SDK 53 — ด้านล่างเป็นภาพจำลอง ยิงของจริงต้องใช้ development build'
            : 'เว็บไม่มีแถบแจ้งเตือนของระบบ — ด้านล่างเป็นภาพจำลอง',
        );

        return;
      }

      /*
       * ใช้ตัวโหลดของ "แจ้งเตือนในเครื่อง" ไม่ใช่ตัวของ push จากเซิร์ฟเวอร์ —
       * Expo Go ถอดเฉพาะ remote push ออก การตั้งเวลาให้แอปเด้งเองยังทำได้
       */
      const notifications = await loadLocalNotifications();

      if (!notifications?.scheduleNotificationAsync) {
        /*
         * บอกสาเหตุจริงจากตัวโหลด ไม่ใช่เดาให้ผู้ใช้ไปงมเอง — "โหลดไม่ได้"
         * มีได้หลายสาเหตุที่แก้คนละทาง และเขียนสภาพแวดล้อมที่ตรวจได้ลงไปด้วย
         * (แพลตฟอร์ม · Expo Go หรือไม่ · โมดูลโหลดผ่านไหม) เพราะข้อความว่า
         * "สภาพแวดล้อมนี้ไม่รองรับ" ลอย ๆ ไม่ได้บอกว่าต้องไปทำอะไรต่อ
         */
        const reason =
          getNotificationLoadError() ??
          (notifications
            ? 'โมดูลโหลดผ่าน แต่ไม่มีฟังก์ชัน scheduleNotificationAsync'
            : 'โมดูลโหลดไม่ผ่าน โดยไม่มีข้อความ error');

        setPushNote(
          `ยิงไม่ได้ · ${Platform.OS}${isExpoGo ? ' · Expo Go' : ''}
${reason}`,
        );
        toast.warn(reason);

        return;
      }

      const permission = await notifications.getPermissionsAsync();
      const granted =
        permission.granted ||
        (await notifications.requestPermissionsAsync()).granted;

      if (!granted) {
        setPushNote('ยังไม่ได้อนุญาตให้แอปแจ้งเตือน — เปิดได้ที่ตั้งค่าเครื่อง');
        toast.error('ไม่ได้รับสิทธิ์แจ้งเตือน');

        return;
      }

      await notifications.scheduleNotificationAsync({
        content: {
          body: sample.body,
          data: { preview: true },
          title: sample.title,
        },
        trigger: {
          seconds: 2,
            /* บางรุ่นของโมดูลไม่ได้ re-export enum นี้ออกมา — ถอยไปใช้ค่าสตริง
             ที่ enum นั้นถืออยู่ ('timeInterval') แทนที่จะพังทั้งฟังก์ชัน */
          type:
            notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ??
            ('timeInterval' as never),
        },
      });

      setPushNote('ยิงแล้ว — ย่อแอปลงภายใน 2 วินาทีเพื่อดูบนแถบแจ้งเตือนจริง');
      toast.success('ส่งแจ้งเตือนทดสอบแล้ว');
    } catch (error) {
      setPushNote(
        `ยิงแจ้งเตือนไม่สำเร็จ: ${
          error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'
        }`,
      );
      toast.error('ยิงแจ้งเตือนไม่สำเร็จ');
    }
  }

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<NotificationMotif />}
              icon="arrow-left"
              iconLabel="ย้อนกลับ"
              onIconPress={() => router.back()}
              subtitle="กดเพื่อดูหน้าตาแจ้งเตือนแต่ละแบบ"
              title="ตัวอย่างแจ้งเตือน"
            />
          </Reveal>

          <View style={{ gap: 26, paddingHorizontal: gutter, paddingTop: 22 }}>
            <Reveal delay={40}>
              <PageSection title="แถบลอยในแอป">
                <View>
                  <ActionRow
                    color={AURORA.emerald}
                    divider={false}
                    icon="check"
                    onPress={() => toast.success('ตั้งรหัส PIN เรียบร้อย')}
                    subtitle="ใช้ตอนทำสำเร็จ เช่น บันทึกหรือส่งคำขอแล้ว"
                    title="สำเร็จ"
                  />
                  <ActionRow
                    color={AURORA.accent}
                    divider
                    icon="info"
                    onPress={() =>
                      toast.info('ระบบกำลังประมวลผล อาจใช้เวลาสักครู่')
                    }
                    subtitle="บอกข้อมูลเฉย ๆ ไม่ได้บอกว่าดีหรือแย่"
                    title="ข้อมูล"
                  />
                  <ActionRow
                    color={AURORA.amber}
                    divider
                    icon="alert-triangle"
                    onPress={() =>
                      toast.warn(
                        'กรุณาเข้าสู่ระบบใหม่เพื่อใช้งานต่อ',
                        'เซสชันสิ้นสุด',
                      )
                    }
                    subtitle="เตือนให้รู้ตัว แต่ยังทำงานต่อได้"
                    title="เตือน"
                  />
                  <ActionRow
                    color={AURORA.rose}
                    divider
                    icon="alert-circle"
                    onPress={() =>
                      toast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
                    }
                    subtitle="ทำไม่สำเร็จ ต้องแก้แล้วลองใหม่"
                    title="ผิดพลาด"
                  />
                </View>
              </PageSection>
            </Reveal>

            <Reveal delay={80}>
              <PageSection
                title="แจ้งเตือนที่เด้งบนมือถือ"
                trailing={
                  <Text
                    style={{
                      color: isLocalNotificationSupported
                        ? AURORA.emerald
                        : AURORA.amber,
                      fontSize: 11.5,
                      fontWeight: '700',
                      lineHeight: 16,
                    }}
                  >
                    {isLocalNotificationSupported ? 'พร้อมใช้' : 'เปิดบนมือถือ'}
                  </Text>
                }
              >
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      color: AURORA.textMuted,
                      fontSize: 11.5,
                      lineHeight: 17,
                    }}
                  >
                    กดแล้วระบบจะเด้งแจ้งเตือนในอีก 2 วินาที ย่อแอปลงเพื่อดูหน้าตา
                    จริงบนแถบแจ้งเตือนของเครื่อง — ข้อความชุดนี้คือข้อความเดียว
                    กับที่ระบบส่งจริง
                    {Platform.OS === 'web'
                      ? ' เว็บไม่มีแถบแจ้งเตือนของระบบ ต้องเปิดบนมือถือ'
                      : isExpoGo
                        ? ' (Expo Go ยิงแบบนี้ได้ ส่วนที่ใช้ไม่ได้คือ push จากเซิร์ฟเวอร์)'
                        : ''}
                  </Text>

                  <View>
                    {PUSH_SAMPLES.map((sample, index) => (
                      <ActionRow
                        color={AURORA.accent}
                        divider={index > 0}
                        icon={sample.icon}
                        key={sample.key}
                        onPress={() => void firePush(sample)}
                        subtitle={sample.body}
                        title={sample.title}
                      />
                    ))}
                  </View>

                  {mock ? (
                    <View style={{ gap: 7 }}>
                      <Text
                        maxScale={1.15}
                        style={{
                          color: AURORA.textFaint,
                          fontSize: 10.5,
                          lineHeight: 15,
                        }}
                      >
                        ภาพจำลองแถบแจ้งเตือนบนเครื่อง
                      </Text>
                      <MockNotification body={mock.body} title={mock.title} />
                    </View>
                  ) : null}

                  {pushNote ? (
                    <View
                      style={{
                        alignItems: 'flex-start',
                        backgroundColor: AURORA.accentSoft,
                        borderRadius: 14,
                        flexDirection: 'row',
                        gap: 9,
                        padding: 12,
                      }}
                    >
                      <Icon color={AURORA.accent} name="info" size={15} />
                      <Text
                        style={{
                          color: AURORA.text,
                          flex: 1,
                          fontSize: 11.5,
                          lineHeight: 17,
                        }}
                      >
                        {pushNote}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </PageSection>
            </Reveal>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
