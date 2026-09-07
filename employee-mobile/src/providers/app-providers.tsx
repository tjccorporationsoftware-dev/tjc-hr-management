import { useEffect, type ReactNode } from 'react';

import { AppStartupError } from '@/components/feedback/app-startup-error';
import { ToastProvider } from '@/design';
import { getEnvironmentResult } from '@/config/env';
import { AuthSessionProvider } from '@/features/auth/auth-session.provider';
import { useAuthStore } from '@/features/auth/auth.store';
import { PrivacyOverlay } from '@/features/auth/screen-privacy';
import { initSentry, sendToSentry } from '@/lib/monitoring/sentry';
import { installTelemetryTransport } from '@/lib/monitoring/telemetry-transport';

import { DatabaseProvider } from './database-provider';
import { QueryProvider } from './query-provider';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const environment = getEnvironmentResult();

  // MOB-005 — ต่อชั้น monitoring ครั้งเดียวตลอดอายุแอป
  useEffect(() => {
    /*
     * Sentry ต้อง init ก่อนต่อ sink ไม่งั้น event แรก ๆ จะหลุด
     * ไม่มี DSN = ไม่เปิดใช้ และ sendToSentry จะไม่ทำอะไร แอปทำงานเหมือนเดิม
     */
    initSentry();

    installTelemetryTransport(
      () => useAuthStore.getState().status === 'authenticated',
      [sendToSentry],
    );
  }, []);

  if (!environment.success) {
    return <AppStartupError issues={environment.issues} />;
  }

  return (
    <QueryProvider>
      <DatabaseProvider>
        {/* ToastProvider อยู่ในสุดก่อน children เพื่อให้ทุกจอเรียก useToast ได้ */}
        <AuthSessionProvider>
          <ToastProvider>
            {children}
            {/*
              แผ่นบังตอนสลับแอปต้องอยู่หลัง children เพื่อให้ทับได้ทุกจอ
              รวมถึงแผ่นเลื่อนที่เปิดค้างอยู่ (ดู screen-privacy.tsx)
            */}
            <PrivacyOverlay />
          </ToastProvider>
        </AuthSessionProvider>
      </DatabaseProvider>
    </QueryProvider>
  );
}
