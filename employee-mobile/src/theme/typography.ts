import type { TextStyle } from 'react-native';

export const fontFamily = {
  bold: 'IBMPlexSansThai_700Bold',
  medium: 'IBMPlexSansThai_500Medium',
  regular: 'IBMPlexSansThai_400Regular',
  semibold: 'IBMPlexSansThai_600SemiBold',
} as const;

export function fontFamilyForWeight(weight: TextStyle['fontWeight']) {
  if (weight === 'bold') return fontFamily.bold;
  if (weight === 'normal' || weight == null) return fontFamily.regular;

  const numeric = Number(weight);
  if (numeric >= 700) return fontFamily.bold;
  if (numeric >= 600) return fontFamily.semibold;
  if (numeric >= 500) return fontFamily.medium;

  return fontFamily.regular;
}

export const typography = {
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.8,
  },
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    lineHeight: 35,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 29,
    letterSpacing: -0.25,
  },
  h3: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 25,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
  },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
