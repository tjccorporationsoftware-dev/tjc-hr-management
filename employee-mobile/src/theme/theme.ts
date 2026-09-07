import { darkColors, lightColors } from './colors';
import { radius } from './radius';
import { spacing } from './spacing';
import type { AppTheme } from './theme.types';
import { typography } from './typography';

export const lightTheme: AppTheme = {
  dark: false,
  colors: lightColors,
  spacing,
  radius,
  typography,
};

export const darkTheme: AppTheme = {
  dark: true,
  colors: darkColors,
  spacing,
  radius,
  typography,
};
