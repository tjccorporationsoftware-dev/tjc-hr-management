import { Pressable, SafeAreaView, Text, View } from 'react-native';

interface AppErrorBoundaryProps {
  error: Error;
  retry: () => Promise<void>;
}

export function AppErrorBoundary({ error, retry }: AppErrorBoundaryProps) {
  return (
    <SafeAreaView
      style={{
        backgroundColor: '#F3F6FB',
        flex: 1,
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: '#E3E8F1',
          borderRadius: 24,
          borderWidth: 1,
          gap: 16,
          padding: 20,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            backgroundColor: '#FDE9EC',
            borderRadius: 999,
            height: 48,
            justifyContent: 'center',
            width: 48,
          }}
        >
          <Text style={{ color: '#D43D4F', fontSize: 22, fontWeight: '700' }}>!</Text>
        </View>
        <Text style={{ color: '#172033', fontSize: 22, fontWeight: '700' }}>
          เกิดข้อผิดพลาด
        </Text>
        <Text style={{ color: '#5D687C', fontSize: 16, lineHeight: 24 }}>
          แอปไม่สามารถเปิดหน้านี้ได้ กรุณาลองใหม่อีกครั้ง
        </Text>
        {__DEV__ ? (
          <Text selectable style={{ color: '#8B95A7', fontSize: 13, lineHeight: 19 }}>
            {error.message}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void retry();
          }}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: pressed ? '#2445B5' : '#3157D5',
            borderRadius: 18,
            justifyContent: 'center',
            minHeight: 52,
            paddingHorizontal: 20,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
            ลองใหม่
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
