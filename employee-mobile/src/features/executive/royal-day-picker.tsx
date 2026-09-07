import { View } from 'react-native';

import {
  WEEKDAY_LABELS,
  buildCalendar,
  formatMonthLabel,
  monthOf,
  shiftMonth,
  todayKey,
} from '@/features/attendance/calendar';
import { ROYAL, TABULAR } from '@/features/executive/royal';
import { PressableScale } from '@/design/aurora';
import { Icon, Sheet, Text, hitSlop } from '@/design';

/* ------------------------------------------------------------ ตัวเลือกวัน */

/**
 * ปฏิทินเลือกวัน — ใช้ตัวสร้างตารางตัวเดียวกับแท็บลงเวลาของพนักงาน
 * (`buildCalendar`) แต่ส่งรายการวันเป็นอาเรย์ว่าง เพราะที่นี่ต้องการแค่โครง
 * ตาราง ไม่ได้ระบายสถานะการลงเวลาลงในช่อง
 *
 * วันอนาคตกดไม่ได้ — ยังไม่มีข้อมูล การปล่อยให้กดแล้วเจอจอว่างทำให้ผู้ใช้
 * เข้าใจผิดว่าระบบไม่บันทึก
 */
export function DayPickerSheet({
  month,
  onClose,
  onMonthChange,
  onSelect,
  selected,
  visible,
}: {
  /*
   * เดือนที่กำลังเปิดดูถือไว้ที่จอแม่ ไม่ใช่ในแผ่นนี้ — เพราะแผ่นถูก mount
   * ค้างไว้ตลอด (สลับแค่ `visible`) ถ้าเก็บสเตตไว้เองมันจะค้างเดือนเก่า
   * เมื่อผู้ใช้เลื่อนวันข้ามเดือนด้วยลูกศรบนหัวจอแล้วเปิดปฏิทินอีกครั้ง
   */
  month: string;
  onClose: () => void;
  onMonthChange: (month: string) => void;
  onSelect: (dateKey: string) => void;
  selected: string;
  visible: boolean;
}) {
  const today = todayKey();
  const weeks = buildCalendar(month, [], today);
  const atCurrentMonth = month >= monthOf(today);

  return (
    <Sheet onClose={onClose} title="เลือกวัน" visible={visible}>
      <View style={{ gap: 14, paddingBottom: 8 }}>
        {/* สลับเดือนในตัวเลือก — คนละเรื่องกับการเลื่อนวันบนหัวจอ */}
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
          <PressableScale
            accessibilityLabel="เดือนก่อนหน้า"
            hitSlop={hitSlop}
            onPress={() => onMonthChange(shiftMonth(month, -1))}
            style={{
              alignItems: 'center',
              backgroundColor: ROYAL.track,
              borderRadius: 999,
              height: 34,
              justifyContent: 'center',
              width: 34,
            }}
          >
            <Icon color={ROYAL.accent} name="chevron-left" size={18} />
          </PressableScale>

          <Text
            maxScale={1.1}
            numberOfLines={1}
            style={{
              color: ROYAL.text,
              flex: 1,
              fontSize: 14,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {formatMonthLabel(month)}
          </Text>

          <PressableScale
            accessibilityLabel="เดือนถัดไป"
            disabled={atCurrentMonth}
            hitSlop={hitSlop}
            onPress={() => onMonthChange(shiftMonth(month, 1))}
            style={{
              alignItems: 'center',
              backgroundColor: atCurrentMonth ? 'transparent' : ROYAL.track,
              borderRadius: 999,
              height: 34,
              justifyContent: 'center',
              width: 34,
            }}
          >
            <Icon
              color={atCurrentMonth ? ROYAL.textMuted : ROYAL.accent}
              name="chevron-right"
              size={18}
            />
          </PressableScale>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {WEEKDAY_LABELS.map((label) => (
            <Text
              key={label}
              maxScale={1}
              style={{
                color: ROYAL.textMuted,
                flex: 1,
                fontSize: 10.5,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {label}
            </Text>
          ))}
        </View>

        <View style={{ gap: 6 }}>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={{ flexDirection: 'row', gap: 4 }}>
              {week.map((cell, cellIndex) => {
                if (!cell.dateKey) {
                  return <View key={cellIndex} style={{ flex: 1, height: 40 }} />;
                }

                const isSelected = cell.dateKey === selected;
                const isFuture = cell.dateKey > today;

                return (
                  <PressableScale
                    accessibilityLabel={cell.dateKey}
                    accessibilityState={{ disabled: isFuture, selected: isSelected }}
                    disabled={isFuture}
                    key={cell.dateKey}
                    onPress={() => {
                      onSelect(cell.dateKey!);
                      onClose();
                    }}
                    style={{
                      alignItems: 'center',
                      backgroundColor: isSelected ? ROYAL.accent : 'transparent',
                      borderColor: cell.isToday && !isSelected ? ROYAL.accent : 'transparent',
                      borderRadius: 12,
                      borderWidth: 1,
                      flex: 1,
                      height: 40,
                      justifyContent: 'center',
                      opacity: isFuture ? 0.32 : 1,
                    }}
                  >
                    <Text
                      maxScale={1}
                      style={[
                        TABULAR,
                        {
                          color: isSelected ? ROYAL.onAccent : ROYAL.text,
                          fontSize: 13,
                          fontWeight: isSelected || cell.isToday ? '800' : '500',
                        },
                      ]}
                    >
                      {cell.dayOfMonth}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
