import type { ReactNode } from 'react';
import {
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaView,
  type Edge,
} from 'react-native-safe-area-context';

import {
  KeyboardAware,
  KeyboardAwareScroll,
} from '@/design/keyboard-aware';
import { useAppTheme } from '@/theme/use-app-theme';

interface ScreenProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  padded?: boolean;
  scroll?: boolean;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle'>;
  style?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  contentContainerStyle,
  edges = ['top', 'left', 'right'],
  padded = true,
  scroll = false,
  scrollProps,
  style,
}: ScreenProps) {
  const { theme } = useAppTheme();

  const contentStyle: StyleProp<ViewStyle> = [
    {
      flexGrow: scroll ? 1 : undefined,
      paddingHorizontal: padded ? theme.spacing.lg : 0,
      paddingVertical: padded ? theme.spacing.lg : 0,
    },
    contentContainerStyle,
  ];

  return (
    <SafeAreaView
      edges={edges}
      style={[{ backgroundColor: theme.colors.background, flex: 1 }, style]}
    >
      {/* กันแป้นพิมพ์ทับช่องกรอกให้ทุกจอที่ใช้ Screen โดยไม่ต้องแก้ทีละจอ */}
      <KeyboardAware>
      {scroll ? (
        <KeyboardAwareScroll
          {...scrollProps}
          contentContainerStyle={contentStyle}
        >
          {children}
        </KeyboardAwareScroll>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
      </KeyboardAware>
    </SafeAreaView>
  );
}
