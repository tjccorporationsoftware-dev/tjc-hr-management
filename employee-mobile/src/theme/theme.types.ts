import type { ThemeColors } from './colors';
import type { radius } from './radius';
import type { spacing } from './spacing';
import type { typography } from './typography';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export interface AppTheme {
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}
