import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AppLoading } from '@/components/feedback/app-loading';
import { AppButton } from '@/components/ui/app-button';
import { AppCard } from '@/components/ui/app-card';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { initializeDatabase } from '@/lib/database/database';
import { useAppTheme } from '@/theme/use-app-theme';

interface DatabaseProviderProps {
  children: ReactNode;
}

type DatabaseState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function getDatabaseErrorMessage(error: unknown): string {
  if (__DEV__ && error instanceof Error) {
    return error.message;
  }

  return 'ไม่สามารถเตรียมพื้นที่จัดเก็บข้อมูลในเครื่องได้';
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const { theme } = useAppTheme();
  const [state, setState] = useState<DatabaseState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    initializeDatabase()
      .then(() => {
        if (!cancelled) {
          setState({ status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: getDatabaseErrorMessage(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const retryDatabase = useCallback(() => {
    setState({ status: 'loading' });

    initializeDatabase()
      .then(() => {
        setState({ status: 'ready' });
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: getDatabaseErrorMessage(error),
        });
      });
  }, []);

  if (state.status === 'loading') {
    return <AppLoading message="กำลังเตรียมข้อมูลในเครื่อง" />;
  }

  if (state.status === 'error') {
    return (
      <Screen contentContainerStyle={{ justifyContent: 'center' }}>
        <AppCard>
          <View style={{ gap: theme.spacing.md }}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: theme.colors.dangerSoft,
                borderRadius: theme.radius.pill,
                height: 52,
                justifyContent: 'center',
                width: 52,
              }}
            >
              <Ionicons color={theme.colors.danger} name="server-outline" size={26} />
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="h2">เปิดพื้นที่จัดเก็บข้อมูลไม่สำเร็จ</AppText>
              <AppText color="muted">
                แอปยังไม่ได้ส่งข้อมูลใดไปยังระบบ กรุณาลองเตรียมฐานข้อมูลอีกครั้ง
              </AppText>
            </View>

            {__DEV__ ? (
              <View
                style={{
                  backgroundColor: theme.colors.surfaceAlt,
                  borderRadius: theme.radius.md,
                  padding: theme.spacing.md,
                }}
              >
                <AppText color="danger" variant="caption">
                  {state.message}
                </AppText>
              </View>
            ) : null}

            <AppButton title="ลองอีกครั้ง" onPress={retryDatabase} />
          </View>
        </AppCard>
      </Screen>
    );
  }

  return children;
}
