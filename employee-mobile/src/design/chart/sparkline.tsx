import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAppTheme } from '@/theme/use-app-theme';

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** สีเส้น — ค่าเริ่มต้นคือสีแบรนด์ */
  color?: string;
  /** แสดงพื้นใต้เส้นแบบจาง ๆ */
  filled?: boolean;
}

/**
 * เส้นแนวโน้มขนาดจิ๋วสำหรับวางในการ์ดตัวเลข
 *
 * ไม่มีแกน ไม่มีป้าย ไม่มีตัวเลข — หน้าที่เดียวคือบอก "ขึ้นหรือลง" ให้เห็นในเสี้ยววินาที
 * ตัวเลขจริงอยู่ข้าง ๆ ในรูปตัวหนังสือแล้ว กราฟนี้จึงเป็นของเสริม ไม่ใช่ทางเดียว
 * ที่จะอ่านค่าได้ (ห้ามให้ข้อมูลอยู่แต่ในกราฟ)
 *
 * เส้นหนา 2px ปลายมน + จุดปลายมีวงแหวนสีพื้น 2px เพื่อให้เห็นชัดตอนทับเส้น
 */
export function Sparkline({
  values,
  width = 72,
  height = 28,
  color,
  filled = true,
}: SparklineProps) {
  const { theme } = useAppTheme();
  const stroke = color ?? theme.colors.primary;

  const clean = values.filter((value) => Number.isFinite(value));

  /* จุดเดียวหรือไม่มีเลย วาดเส้นแนวโน้มไม่ได้ — เว้นที่ไว้ให้ layout ไม่กระตุก */
  if (clean.length < 2) {
    return <View style={{ height, width }} />;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min;

  /* กันหารศูนย์เมื่อทุกค่าเท่ากัน — วาดเป็นเส้นตรงกลาง */
  const padding = 3;
  const usableHeight = height - padding * 2;

  const points = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y =
      span === 0
        ? height / 2
        : padding + usableHeight - ((value - min) / span) * usableHeight;

    return { x, y };
  });

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');

  const last = points[points.length - 1]!;

  return (
    <Svg height={height} width={width}>
      {filled ? (
        <Path
          d={`${line} L${width},${height} L0,${height} Z`}
          fill={stroke}
          /* พื้นเป็นแค่การล้างสีจาง ๆ ไม่ใช่บล็อกทึบ */
          fillOpacity={0.1}
        />
      ) : null}

      <Path
        d={line}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />

      <Circle
        cx={last.x}
        cy={last.y}
        fill={stroke}
        r={3.5}
        stroke={theme.colors.surface}
        strokeWidth={2}
      />
    </Svg>
  );
}
