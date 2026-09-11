import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { z } from 'zod';

import { Icon, Input, KeyboardAwareScroll, Text, useToast } from '@/design';
import { scaled, useResponsive } from '@/design/responsive';
import { AURORA, PressableScale, Reveal } from '@/design/aurora';
import { getAppConfig } from '@/config/app-config';
import { toAuthErrorView, type AuthErrorView } from '@/features/auth/auth-error';
import { login } from '@/features/auth/auth.service';
import { useAuthStore } from '@/features/auth/auth.store';
import { registerCurrentDevice } from '@/features/devices/device.service';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * เข้าสู่ระบบด้วยรหัสพนักงาน (ผู้ดูแลระบบที่ไม่มีรหัสพนักงานใช้อีเมลในช่องเดียวกัน)
 *
 * จอแรกที่พนักงานเห็น และเป็นจอเดียวที่คนนอกองค์กรก็เปิดถึง — หน้าตาจึงต้อง
 * บอกให้ได้ในสองวินาทีว่านี่คือแอปของบริษัท ไม่ใช่หน้าเข้าสู่ระบบทั่วไป
 * ใช้ผิวออโรราชุดเดียวกับทั้งแอปเพื่อให้จังหวะแรกที่เห็นกับตอนใช้งานจริง
 * เป็นที่เดียวกัน (เดิมจอนี้เป็นระบบสีเก่า สลับเข้าแอปแล้วเหมือนคนละแอป)
 *
 * ## โครงของจอ — สามก้อน น้ำหนักไม่เท่ากัน
 *
 * ตรา (มีแสงหนุน) → ฟอร์ม → ทางออกเมื่อเข้าไม่ได้ (พื้นฟ้าจาง) → เวอร์ชัน
 *
 * ก่อนหน้านี้ทั้งสามก้อนเป็นตัวหนังสือบนขาวล้วนน้ำหนักพอ ๆ กัน จอจึงอ่านเป็น
 * ของกองเรียงลงมาโดยไม่มีอะไรบอกว่าตรงไหนคือหัว ตรงไหนคือหาง — ของที่เติม
 * เข้ามาสองอย่าง (แสงหลังตรา, พื้นจางของแถบท้ายจอ) ทำหน้าที่นั้นโดยไม่เพิ่ม
 * กรอบหรือเส้นให้สายตาต้องข้าม
 *
 * ข้อความผิดพลาดอยู่ **เหนือช่องกรอกในก้อนเดียวกับฟอร์ม** ไม่ใช่แถบลอย —
 * ผู้ใช้ที่พิมพ์ผิดจะได้เห็นเหตุผลกับช่องกรอกพร้อมกันโดยไม่ต้องเงยตาขึ้นไปอ่าน
 */

const loginFormSchema = z.object({
  username: z.string().trim().min(1, 'กรุณากรอกรหัสพนักงาน'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

/** เส้นผ่านศูนย์กลางของแสงหลังตรา — กว้างกว่าตราเพื่อให้ขอบจางหายไปก่อนสุดขอบ */
const GLOW_SIZE = 320;

/**
 * แสงฟ้าจาง ๆ หลังตราองค์กร
 *
 * จอนี้ไม่มีการ์ดและไม่มีแถบสีให้ยึดสายตา (ทั้งสองอย่างเคยมีแล้วถูกเอาออก
 * เพราะไปตีกรอบของที่ไม่ต้องการกรอบ) แต่หัวจอก็ยังต้องหนักกว่าท้ายจอ —
 * แสงกลมไล่จางทำงานตรงนั้นได้โดยไม่มีขอบสักเส้น สายตาเห็นเป็น "ที่สว่าง"
 * ไม่ใช่ "ของอีกชิ้น"
 *
 * ใช้ radial gradient ไม่ใช่วงกลมโปร่งแสง — วงกลมทึบต่อให้จางแค่ไหนก็ยังมี
 * ขอบคม พอวางบนขาวจะเห็นเป็นจานสีฟ้า
 *
 * id ต้องไม่ซ้ำข้ามอินสแตนซ์ (กติกาเดียวกับ `AuroraBackground`) — สอง
 * gradient ที่ชื่อชนกันจะแย่งกันนิยามแล้วกลายเป็นสีทึบบนเครื่องจริง
 */
function BrandGlow() {
  const id = `loginGlow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View
      style={{
        /* แสงเป็นฉากหลังล้วน ห้ามกินการแตะของอะไรที่ลอยอยู่ข้างบน */
        pointerEvents: 'none',
        position: 'absolute',
        top: -(GLOW_SIZE - 150) / 2,
      }}
    >
      <Svg height={GLOW_SIZE} width={GLOW_SIZE}>
        <Defs>
          <RadialGradient id={id}>
            <Stop offset="0" stopColor={AURORA.accentEnd} stopOpacity={0.17} />
            <Stop
              offset="0.55"
              stopColor={AURORA.accentEnd}
              stopOpacity={0.055}
            />
            <Stop offset="1" stopColor={AURORA.accentEnd} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle
          cx={GLOW_SIZE / 2}
          cy={GLOW_SIZE / 2}
          fill={`url(#${id})`}
          r={GLOW_SIZE / 2}
        />
      </Svg>
    </View>
  );
}

export default function LoginScreen() {
  const { resolvedMode } = useAppTheme();
  /* จอนี้ไม่มีหัวจอมาคุมระยะให้ จึงต้องหยิบระยะขอบกับมาตราส่วนมาเอง */
  const responsive = useResponsive();
  const config = getAppConfig();
  const sessionError = useAuthStore((state) => state.sessionError);
  const [submitError, setSubmitError] = useState<AuthErrorView | null>(null);

  const auroraStatusBarStyle = useVisibleStatusBarStyle('dark');
  const themeStatusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(auroraStatusBarStyle);

      return () => setStatusBarStyle(themeStatusBarStyle);
    }, [auroraStatusBarStyle, themeStatusBarStyle]),
  );

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<LoginFormValues>({
    defaultValues: { username: '', password: '' },
    resolver: zodResolver(loginFormSchema),
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);

    try {
      const result = await login(values);

      if (result.requiresTwoFactor) {
        router.push('/verify-2fa');
        return;
      }

      await registerCurrentDevice();
      router.replace('/');
    } catch (error) {
      setSubmitError(toAuthErrorView(error));
    }
  }

  /*
   * เหตุผลที่ถูกเด้งออกมา (เซสชันหมดอายุ / ต้องตั้ง PIN ใหม่) เด้งเป็นข้อความ
   * ลอยแล้วหายไป ไม่ใช่แถบค้างอยู่ในฟอร์ม
   *
   * มันเป็นเรื่องที่ "เกิดขึ้นก่อนหน้านี้" ไม่ใช่สิ่งที่ผู้ใช้ต้องแก้ตรงนั้น การ
   * ค้างไว้เหนือช่องกรอกจึงดันฟอร์มลงและบังทางที่เขากำลังจะไปโดยไม่ได้ช่วยอะไร
   *
   * ยิงครั้งเดียวต่อการเข้าจอหนึ่งครั้ง — `sessionError` อยู่ใน store ค้างไว้
   * จนกว่าจะล็อกอินสำเร็จ ถ้าไม่กันไว้ทุกครั้งที่จอ re-render จะเด้งซ้ำ
   */
  const toast = useToast();
  const sessionErrorNotified = useRef(false);

  useEffect(() => {
    if (!sessionError || sessionErrorNotified.current) return;

    sessionErrorNotified.current = true;
    toast.warn(sessionError, 'เซสชันสิ้นสุด');
  }, [sessionError, toast]);

  /* เหลือเฉพาะ error จากการกดส่งฟอร์ม — อันนี้ต้องค้างไว้ให้อ่านระหว่างแก้ */
  const banner: AuthErrorView | null = submitError;

  const versionLabel = `เวอร์ชัน ${config.appVersion}${
    config.appBuild === null ? '' : ` (${config.appBuild})`
  }${config.appEnvironment === 'production' ? '' : ` · ${config.appEnvironment}`}`;

  return (
    /* พื้นขาวชุดเดียวกับจอที่เหลือของแอป ไม่ใช่ฉากแสงฟ้า — จอแรกกับจอที่ใช้
       งานจริงต้องเป็นที่เดียวกัน ไม่ใช่เปลี่ยนบรรยากาศตอนเข้าไปข้างใน */
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <KeyboardAwareScroll
            contentContainerStyle={{
              alignSelf: 'center',
              flexGrow: 1,
              gap: scaled(28, responsive),
              justifyContent: 'center',
              /* ฟอร์มไม่ควรกว้างเกินหนึ่งช่วงสายตา แม้จอจะกว้างกว่านั้นก็ตาม */
              maxWidth: responsive.maxWidth,
              paddingBottom: scaled(28, responsive),
              paddingHorizontal: responsive.gutter,
              paddingTop: scaled(28, responsive),
              width: '100%',
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ------------------------------------------------ ตราองค์กร */}
            <Reveal>
              {/*
                ตรากับคำโปรยลอยอยู่บนแสง ไม่มีพื้นและไม่มีขอบเป็นของตัวเอง —
                จอนี้มีงานเดียวคือกรอกสองช่องแล้วกด ทุกอย่างที่มีกรอบของตัวเอง
                คือของที่มาแย่งสายตากับช่องกรอกโดยไม่ได้ช่วยอะไร

                ขนาดตรายึดอัตราส่วนจริงของไฟล์หลังตัดขอบขาว (1.725)
              */}
              <View style={{ alignItems: 'center', gap: 10 }}>
                <BrandGlow />

                {/*
                  ใช้ตราแนวนอนที่มีชื่อ HR-TJC GROUP อยู่ในตัว ไม่ใช่ไอคอนแอป
                  จัตุรัส — จอนี้มีที่ให้ชื่อเต็มได้ และชื่อเต็มคือสิ่งที่บอกว่า
                  เปิดถูกแอปแล้ว ส่วนไอคอนจัตุรัสทำหน้าที่นั้นบนหน้าจอเครื่อง
                  ไปแล้วก่อนกดเข้ามา
                */}
                <Image
                  accessibilityLabel="HR-TJC GROUP"
                  contentFit="contain"
                  source={require('../../../assets/logo-wordmark.png')}
                  style={{
                    height: scaled(116, responsive),
                    width: scaled(200, responsive),
                  }}
                  transition={220}
                />

                {/*
                  คำโปรยขยับตัวอักษรออกจากกันเล็กน้อยและอยู่ห่างจากตราขึ้น —
                  บรรทัดเดียวสั้น ๆ ที่ระยะปกติจะอ่านเป็นหางของโลโก้ ไม่ใช่
                  ประโยคที่ตั้งใจให้อ่าน
                */}
                <Text
                  maxScale={1.1}
                  numberOfLines={1}
                  style={{
                    color: AURORA.textMuted,
                    fontSize: 12.5,
                    letterSpacing: 0.2,
                    textAlign: 'center',
                  }}
                >
                  เวลาทำงาน คำขอ และข้อมูลในที่เดียว
                </Text>
              </View>
            </Reveal>

            {/* ------------------------------------------------- ฟอร์ม */}
            <Reveal delay={70}>
              {/*
                ไม่มีการ์ดครอบฟอร์ม — จอนี้มีของอยู่ก้อนเดียวอยู่แล้ว กรอบจึง
                ไม่ได้แยกมันออกจากอะไร มีแต่ทำให้ช่องกรอกแคบลงและเกิดขอบซ้อน
                ขอบกับกรอบของช่องกรอกที่อยู่ข้างใน
              */}
              <View style={{ gap: 16 }}>
                {/*
                  หัวฟอร์ม = ไอคอนในแผ่นฟ้าจาง + ชื่อ + คำอธิบาย เรียงเป็นแถว
                  เดียว — โครงเดียวกับหัวจอของทุกแท็บ (`PageHero`) จอนี้จึงอ่าน
                  เป็นแอปเดียวกันตั้งแต่จอแรก

                  ก่อนหน้านี้ตรงนี้เป็นขีดฟ้าสั้น ๆ ลอยเหนือหัวข้อ ซึ่งบนจอจริง
                  อ่านเป็นเศษเส้นที่หลุดมาจากอะไรสักอย่าง ไม่ใช่ของที่ตั้งใจวาง
                  — ของที่ไม่ได้เป็นรูปอะไรเลยต้องพึ่งของรอบข้างมาอธิบายตัวเอง
                  แต่หัวฟอร์มนี้ไม่มีอะไรอยู่ข้าง ๆ ให้พึ่ง

                  แผ่นสี่เหลี่ยมมน ไม่ใช่วงกลม: ช่องกรอกที่อยู่ถัดลงไปเป็น
                  สี่เหลี่ยมมนทั้งคู่ วงกลมจะเป็นรูปทรงเดียวในคอลัมน์ที่ไม่ซ้ำ
                  กับใคร
                */}
                <View
                  style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: AURORA.accentSoft,
                      borderRadius: 14,
                      height: 44,
                      justifyContent: 'center',
                      width: 44,
                    }}
                  >
                    <Icon color={AURORA.accent} name="log-in" size={20} />
                  </View>

                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Text style={{ color: AURORA.text }} variant="h2">
                      เข้าสู่ระบบ
                    </Text>
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 12,
                        lineHeight: 17,
                      }}
                    >
                      ใช้รหัสพนักงานกับรหัสผ่านที่ฝ่ายบุคคลออกให้
                    </Text>
                  </View>
                </View>

                {banner ? (
                  /*
                   * กล่องบอกแค่สิ่งที่เกิดขึ้นหนึ่งบรรทัด แล้วค่อยมีบรรทัดรองถ้าจำเป็น
                   *
                   * เดิมมีสามชั้น (หัวข้อ · ข้อความ · UUID ยาวสองบรรทัด) สำหรับกรณีที่
                   * พบบ่อยสุดคือรหัสผ่านผิด ซึ่งหัวข้อกับข้อความพูดเรื่องเดียวกัน
                   * และรหัสอ้างอิงไม่มีใครต้องใช้ — ผู้ใช้เห็นกล่องรกก่อนเห็นคำตอบ
                   *
                   * พื้นสีจางไม่มีขอบ ตามกติกาแถบเตือนของแอป (AGENTS.md 3.5)
                   */
                  <View
                    accessibilityLiveRegion="polite"
                    accessibilityRole="alert"
                    style={{
                      alignItems: 'flex-start',
                      backgroundColor: 'rgba(168, 15, 52, 0.07)',
                      borderRadius: 14,
                      flexDirection: 'row',
                      gap: 10,
                      paddingHorizontal: 13,
                      paddingVertical: 11,
                    }}
                  >
                    <View style={{ paddingTop: 1 }}>
                      <Icon color={AURORA.rose} name="alert-circle" size={17} />
                    </View>
                    <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                      <Text
                        style={{
                          color: AURORA.rose,
                          fontSize: 13.5,
                          fontWeight: '700',
                          lineHeight: 19,
                        }}
                      >
                        {banner.message}
                      </Text>
                      {banner.hint ? (
                        <Text
                          style={{
                            color: AURORA.textMuted,
                            fontSize: 12,
                            lineHeight: 17,
                          }}
                        >
                          {banner.hint}
                        </Text>
                      ) : null}
                      {banner.reference ? (
                        <Text
                          maxScale={1.1}
                          numberOfLines={1}
                          style={{
                            color: AURORA.textFaint,
                            fontSize: 11,
                            fontVariant: ['tabular-nums'],
                            lineHeight: 15,
                          }}
                        >
                          {`อ้างอิง ${banner.reference}`}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {/* สองช่องกรอกอยู่ชิดกันเป็นคู่ (gap 12) แล้วเว้นห่างจากปุ่ม
                    มากกว่า (18) — ปุ่มคือการกระทำ ไม่ใช่ช่องที่สาม */}
                <View style={{ gap: 12 }}>
                  <Controller
                    control={control}
                    name="username"
                    render={({ field: { onBlur, onChange, value } }) => (
                      <Input
                        appearance="aurora"
                        autoCapitalize="none"
                        autoComplete="username"
                        autoCorrect={false}
                        error={errors.username?.message}
                        icon="id-card-outline"
                        label="รหัสพนักงาน"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        placeholder="เช่น 690034"
                        returnKeyType="next"
                        testID="login-username"
                        value={value}
                      />
                    )}
                  />

                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onBlur, onChange, value } }) => (
                      <Input
                        appearance="aurora"
                        autoCapitalize="none"
                        autoComplete="current-password"
                        error={errors.password?.message}
                        icon="lock-closed-outline"
                        label="รหัสผ่าน"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        onSubmitEditing={handleSubmit(onSubmit)}
                        placeholder="••••••••"
                        returnKeyType="go"
                        secureTextEntry
                        testID="login-password"
                        value={value}
                      />
                    )}
                  />
                </View>

                {/*
                  ลูกศรไปข้างหน้า ไม่ใช่ไอคอนประตูเข้า และอยู่ท้ายข้อความไม่ใช่
                  หน้าข้อความ — ปุ่มนี้พาไปข้างใน สายตาที่อ่านจบคำแล้วเจอลูกศร
                  ต่อท้ายจะได้ทิศทางฟรี ๆ ส่วนไอคอนที่นำหน้าคำเป็นแค่ของประดับ

                  เงาลึกกว่าเดิมเล็กน้อย (y 8 / radius 16) — ปุ่มเป็นของชิ้นเดียว
                  ในจอที่ยกขึ้นจากพื้น ถ้าเงาบางเท่าเดิมมันจะแบนพอ ๆ กับช่องกรอก
                */}
                <PressableScale
                  accessibilityLabel="เข้าสู่ระบบ"
                  disabled={isSubmitting}
                  onPress={handleSubmit(onSubmit)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: AURORA.accent,
                    borderRadius: 16,
                    flexDirection: 'row',
                    gap: 9,
                    justifyContent: 'center',
                    marginTop: 6,
                    minHeight: 54,
                    opacity: isSubmitting ? 0.65 : 1,
                    shadowColor: AURORA.accent,
                    shadowOffset: { height: 8, width: 0 },
                    shadowOpacity: 0.26,
                    shadowRadius: 16,
                  }}
                  testID="login-submit"
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : null}
                  <Text
                    style={{
                      color: '#ffffff',
                      fontSize: 15,
                      fontWeight: '700',
                      letterSpacing: 0.2,
                    }}
                  >
                    {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                  </Text>
                  {isSubmitting ? null : (
                    <Icon color="#ffffff" name="arrow-right" size={18} />
                  )}
                </PressableScale>
              </View>
            </Reveal>

            {/* ---------------------------------------------- ท้ายจอ */}
            <Reveal delay={130}>
              <View style={{ gap: 12 }}>
                {/*
                  ทางออกเมื่อเข้าไม่ได้ — คำถามที่เกิดกับจอนี้บ่อยที่สุด

                  อยู่บนพื้นฟ้าจาง ไม่ใช่ตัวหนังสือเทาลอย ๆ กลางจอ: ของที่ต้อง
                  หาเจอตอนกำลังหงุดหงิดว่าเข้าไม่ได้ ต้องมีรูปทรงให้เล็งถูกโดย
                  ไม่ต้องอ่าน พื้นจางให้รูปทรงนั้นได้โดยไม่ต้องมีขอบสักเส้น
                  (กติกาเดียวกับแถบเตือนใน AGENTS.md — พื้นจางได้ การ์ดไม่ได้)

                  แยกเป็นสองบรรทัด: บรรทัดบนคือ "ปัญหาที่คุณเจอ" บรรทัดล่างคือ
                  "ต้องไปหาใคร" — รวบเป็นประโยคเดียวแบบเดิมต้องอ่านจนจบถึงจะ
                  รู้ว่ามันเกี่ยวกับตัวเองไหม
                */}
                <View
                  style={{
                    alignItems: 'center',
                    backgroundColor: AURORA.accentSoft,
                    borderRadius: 18,
                    flexDirection: 'row',
                    gap: 11,
                    paddingHorizontal: 14,
                    paddingVertical: 13,
                  }}
                >
                  <Icon color={AURORA.accent} name="help-circle" size={19} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: AURORA.text,
                        fontSize: 12.5,
                        fontWeight: '700',
                        lineHeight: 17,
                      }}
                    >
                      ลืมรหัสผ่าน หรือยังไม่มีบัญชี
                    </Text>
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      ติดต่อฝ่ายบุคคลของบริษัทเพื่อขอบัญชีหรือรหัสผ่านใหม่
                    </Text>
                  </View>
                </View>

                <Text
                  maxScale={1.1}
                  style={{
                    color: AURORA.textFaint,
                    fontSize: 10.5,
                    textAlign: 'center',
                  }}
                >
                  {versionLabel}
                </Text>
              </View>
            </Reveal>
          </KeyboardAwareScroll>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
