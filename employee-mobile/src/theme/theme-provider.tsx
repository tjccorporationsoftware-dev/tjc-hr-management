import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from './theme';
import type {
  AppTheme,
  ResolvedThemeMode,
  ThemeMode,
} from './theme.types';

interface AppThemeContextValue {
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: AppTheme;
}

export const AppThemeContext = createContext<AppThemeContextValue | null>(null);

interface AppThemeProviderProps {
  children: ReactNode;
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  const systemMode = useColorScheme();

  /*
   * ค่าเริ่มต้นคือ **สว่าง** ไม่ใช่ตามระบบ
   *
   * จอส่วนใหญ่ของแอปใช้ผิวออโรราซึ่งเป็นฟ้าอ่อนตลอดทั้งสองโหมดอยู่แล้ว
   * (ดู AGENTS.md) ถ้าปล่อยให้ตามเครื่อง คนที่ตั้งมือถือเป็นโหมดมืดจะได้
   * แอปครึ่งสว่างครึ่งมืด — จอหลักเป็นฟ้าอ่อน แต่แผ่นเลื่อน กล่องยืนยัน
   * และจอที่ยังไม่ได้ย้ายกลับเป็นสีเข้ม ซึ่งดูเหมือนแอปพังมากกว่าดูเป็นธีม
   *
   * ผู้ใช้ยังเลือก "ตามระบบ" หรือ "มืด" เองได้จากหน้าตั้งค่า แค่ไม่ใช่ค่าตั้งต้น
   */
  const [mode, setMode] = useState<ThemeMode>('light');

  const resolvedMode: ResolvedThemeMode =
    mode === 'system' ? (systemMode === 'dark' ? 'dark' : 'light') : mode;

  const theme = resolvedMode === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {
      // Web and unsupported runtimes may ignore the native system background.
    });
  }, [theme.colors.background]);

  const value = useMemo<AppThemeContextValue>(
    () => ({ mode, resolvedMode, setMode, theme }),
    [mode, resolvedMode, theme],
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}
