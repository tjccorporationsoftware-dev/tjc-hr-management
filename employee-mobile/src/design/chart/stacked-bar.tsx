import { View } from 'react-native';

import { Text } from '@/design/text';
import { useAppTheme } from '@/theme/use-app-theme';

export interface StackSegment {
  label: string;
  value: number;
  color: string;
}

export interface StackedBarProps {
  segments: StackSegment[];
  /** แปลงตัวเลขเป็นข้อความในคำอธิบาย */
  format: (value: number) => string;
  /** ซ่อนคำอธิบายเมื่อจอนั้นมีตัวเลขครบอยู่แล้วที่อื่น */
  legend?: boolean;
  height?: number;
}

/** ช่องว่างสีพื้นคั่นระหว่างช่วง — ใช้ที่ว่างแยก ไม่ใช่ตีเส้นขอบ */
const GAP = 2;

/**
 * แท่งสัดส่วนแนวนอน (ส่วนย่อยเทียบทั้งหมด)
 *
 * เลือกแท่งซ้อนแทนโดนัท เพราะโดนัทอ่านค่าที่ใกล้กันไม่ออก และกินพื้นที่แนวตั้ง
 * มากกว่าบนจอมือถือโดยไม่ได้ให้ข้อมูลเพิ่ม
 *
 * **คำอธิบายมีเสมอเมื่อมีตั้งแต่ 2 ช่วงขึ้นไป และมีตัวเลขกำกับทุกช่วง**
 * เพราะสีบางสล็อตในโหมดสว่าง contrast ต่ำกว่า 3:1 จึงห้ามให้สีเป็นทางเดียว
 * ที่สื่อความหมาย — ตัวหนังสือใช้สีตัวอักษรปกติ จุดสีข้าง ๆ เป็นตัวบอกตัวตน
 */
export function StackedBar({
  segments,
  format,
  legend = true,
  height = 10,
}: StackedBarProps) {
  const { theme } = useAppTheme();

  const usable = segments.filter((segment) => segment.value > 0);
  const total = usable.reduce((sum, segment) => sum + segment.value, 0);

  /*
   * ดึงสัดส่วนออกมาไว้นอก JSX ก่อน — **ห้ามอ่าน `segment.value` ใน inline style**
   *
   * Reanimated เห็น `.value` ในอ็อบเจกต์ style แล้วเข้าใจว่าเป็น shared value
   * (ชื่อ property ของเราดันไปชนกับ convention ของมัน) แล้วเตือนทุกครั้งที่ render
   * ทั้งที่เป็นตัวเลขธรรมดา ชื่อ `value` ยังคงไว้เพราะเป็นชื่อที่ตรงความหมายที่สุด
   * สำหรับกราฟ แค่ต้องไม่แตะมันตรง ๆ ตอนประกอบ style
   */
  const grows = usable.map((segment) => segment.value);

  if (total <= 0) {
    return null;
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        accessibilityLabel={usable
          .map((segment) => `${segment.label} ${format(segment.value)}`)
          .join(', ')}
        accessible
        style={{ flexDirection: 'row', height }}
      >
        {usable.map((segment, index) => (
          <View
            key={segment.label}
            style={{
              backgroundColor: segment.color,
              borderBottomLeftRadius: index === 0 ? height : 0,
              borderBottomRightRadius: index === usable.length - 1 ? height : 0,
              borderTopLeftRadius: index === 0 ? height : 0,
              borderTopRightRadius: index === usable.length - 1 ? height : 0,
              flexGrow: grows[index],
              flexShrink: 1,
              /* ช่องว่างสีพื้นคั่น ไม่ใช่เส้นขอบ */
              marginLeft: index === 0 ? 0 : GAP,
            }}
          />
        ))}
      </View>

      {legend && usable.length >= 2 ? (
        <View style={{ gap: 6 }}>
          {usable.map((segment) => (
            <View
              key={segment.label}
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.xs,
              }}
            >
              <View
                style={{
                  backgroundColor: segment.color,
                  borderRadius: 3,
                  height: 10,
                  width: 10,
                }}
              />
              <Text style={{ flex: 1 }} tone="muted" variant="caption">
                {segment.label}
              </Text>
              <Text variant="caption">{format(segment.value)}</Text>
              <Text
                style={{ minWidth: 38, textAlign: 'right' }}
                tone="subtle"
                variant="caption"
              >
                {Math.round((segment.value / total) * 100)}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
