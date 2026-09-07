import {
  IBMPlexSansThai_400Regular,
  IBMPlexSansThai_500Medium,
  IBMPlexSansThai_600SemiBold,
  IBMPlexSansThai_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-thai';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/feedback/error-boundary';
import { AURORA } from '@/design/aurora';
import { BootSplash } from '@/features/boot/boot-logo';
import { useAuthStore } from '@/features/auth/auth.store';
import { AppProviders } from '@/providers/app-providers';
import { AppThemeProvider } from '@/theme/theme-provider';
import { useAppTheme } from '@/theme/use-app-theme';
import {
  useSystemStatusBarBackground,
  useVisibleStatusBarStyle,
} from '@/theme/use-status-bar-style';

export { AppErrorBoundary as ErrorBoundary };

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { resolvedMode, theme } = useAppTheme();
  const statusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  /*
   * พื้นหลังแถบนาฬิกา/แบต — ขาวเท่าพื้นหัวจอ ไม่ใช่ดำที่ระบบให้มา
   *
   * ตั้งที่ราก ไม่ใช่รายจอ เพราะบนเครื่องที่ระบบเป็นเจ้าของแถบนี้ แถบไม่ได้
   * เปลี่ยนตามจอที่เปิดอยู่ — สีเดียวทั้งแอปคือคำตอบที่ตรงกับสิ่งที่เห็นจริง
   */
  useSystemStatusBarBackground(AURORA.baseDeep);

  return (
    <>
      {/*
        ไม่คุมความกว้างที่ราก — แท็บเล็ตต้องเต็มขอบจอเหมือนมือถือ
        -----------------------------------------------------
        เคยลองจัดกลางไว้ที่ความกว้างอ่านสบายแล้วเว้นข้างเป็นพื้นขาว ผลคือหัวจอ
        กับแถบล่างลอยไม่ชนขอบเครื่อง ซึ่งอ่านเป็นแอปมือถือที่ถูกยัดใส่กรอบ
        มากกว่าจะเป็นแอปของแท็บเล็ต

        ความกว้างที่อ่านสบายยังมีอยู่ใน `useResponsive().maxWidth` ให้จอที่เป็น
        ฟอร์ม (เช่นเข้าสู่ระบบ) หยิบไปใช้เอง — ฟอร์มที่ยืดเต็มจอ 1,024 จุดคือ
        ของที่ควรคุม ส่วนรายการกับแดชบอร์ดใช้พื้นที่เต็มได้จริง
      */}
      <Stack
        screenOptions={{
          animation: 'fade',
          contentStyle: { backgroundColor: theme.colors.background },
          headerShown: false,
        }}
      />
      <StatusBar style={statusBarStyle} />
    </>
  );
}

export default function RootLayout() {
  /* จอโหลดถอดตัวเองออกเมื่อเล่นจบ — เก็บไว้ที่นี่เพราะเป็นของครั้งเดียวต่อการเปิดแอป */
  const [bootVisible, setBootVisible] = useState(true);
  /*
   * "พร้อม" ของแอปนี้คือ **อ่านเซสชันจากเครื่องเสร็จ** ไม่ใช่โหลดข้อมูลจาก
   * เซิร์ฟเวอร์เสร็จ — ตราบใดที่ยัง `restoring` อยู่ ตัว router ยังไม่รู้ว่าจะ
   * พาไปจอเข้าสู่ระบบ จอ PIN หรือหน้าหลัก จอที่อยู่ข้างหลังจึงเป็นจอ "กำลัง
   * ตรวจสอบเซสชัน" ซึ่งไม่ควรให้ผู้ใช้เห็นแวบหนึ่งก่อนของจริง
   *
   * ไม่ผูกกับ `useBootstrap` เพราะนั่นเป็นการยิงเน็ต — เน็ตช้าจะกลายเป็นค้าง
   * อยู่ที่โลโก้นานเป็นสิบวินาที ทั้งที่แอปพร้อมพาไปจอถัดไปแล้ว
   */
  const authRestoring = useAuthStore((state) => state.status === 'restoring');
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansThai_400Regular,
    IBMPlexSansThai_500Medium,
    IBMPlexSansThai_600SemiBold,
    IBMPlexSansThai_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <AppProviders>
          <RootNavigator />
          {/*
            จอโหลดที่มีตราขยับ — วางทับทุกอย่างแล้วจางหายเอง
            ------------------------------------------------
            splash ของระบบเป็นภาพนิ่งที่ OS วาดก่อน JS เริ่มทำงาน ขยับไม่ได้
            ตัวนี้จึงขึ้นต่อจากมันด้วยตราเดิมในตำแหน่งเดิม แล้วค่อยเล่นจังหวะ
            ประกอบตัวเอง ตาจะอ่านเป็นภาพเดียวที่เริ่มขยับ ไม่ใช่สองจอสลับกัน

            อยู่ใน `AppProviders` เพราะต้องอยู่ชั้นเดียวกับ navigator ถึงจะทับ
            ได้ทั้งจอ และถูก unmount ทิ้งหลังจางจบ ไม่ค้างกินเฟรม
          */}
          {bootVisible ? (
            <BootSplash
              onFinish={() => setBootVisible(false)}
              ready={!authRestoring}
            />
          ) : null}
        </AppProviders>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
