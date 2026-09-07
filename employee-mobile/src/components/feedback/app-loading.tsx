import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useAppTheme } from '@/theme/use-app-theme';

interface AppLoadingProps {
  message?: string;
}

export function AppLoading({ message = 'กำลังเตรียมแอป...' }: AppLoadingProps) {
  const { theme } = useAppTheme();

  return (
    <Screen>
      <View
        style={{
          alignItems: 'center',
          flex: 1,
          gap: theme.spacing.md,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <AppText color="muted">{message}</AppText>
      </View>
    </Screen>
  );
}
