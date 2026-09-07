import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from './icon';
import { Sheet } from './sheet';
import { Text } from './text';
import { AURORA } from './aurora';
import { useAppTheme } from '@/theme/use-app-theme';
import { useResponsive } from '@/design/responsive';
import { thaiDate, thaiTime } from '@/lib/date/thai-date';

export type DateFieldMode = 'date' | 'time' | 'datetime';

export interface DateFieldProps {
  appearance?: 'aurora' | 'default';
  label?: string;
  value: Date | null;
  onChange: (value: Date) => void;
  mode?: DateFieldMode;
  error?: string;
  hint?: string;
  required?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  placeholder?: string;
}

const dateText = (value: Date) =>
  thaiDate(value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const timeText = (value: Date) =>
  thaiTime(value);

/** หัวคอลัมน์ปฏิทิน — เริ่มวันอาทิตย์ตามปฏิทินไทย */
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

/** ความสูงของแถวในคอลัมน์เวลา — ต้องเท่ากันทุกแถวเพื่อคำนวณตำแหน่งเลื่อน */
const TIME_ROW_HEIGHT = 40;

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);

  return next;
};

const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

/**
 * ช่องเลือกวันและเวลา — ป๊อปอัพของแอปเอง ไม่ใช่ picker ของระบบ
 *
 * เดิมใช้ `@react-native-community/datetimepicker` ซึ่งเป็นหน้าตาของ iOS/Android
 * คนละแบบกัน (สปินเนอร์ของ iOS กับ dialog ของ Android) ไม่มีปีพุทธศักราช
 * เปลี่ยนสี/ฟอนต์ให้เข้ากับแอปไม่ได้ และโหมด datetime ของ Android ต้องถามสองรอบ
 * เป็นสอง dialog ซ้อนกัน — จอเดียวกันจึงหน้าตาไม่เหมือนกันในสองแพลตฟอร์ม
 *
 * ตัวนี้เป็นปฏิทิน/นาฬิกาที่วาดเอง วางในแผ่น `<Sheet>` ชุดเดียวกับแผ่นอื่น
 * ของแอป ได้ทั้งพุทธศักราช สีของแอป และพฤติกรรมเดียวกันทุกแพลตฟอร์มรวมทั้งเว็บ
 *
 * ยังไม่ให้พิมพ์วันที่เอง — รูปแบบที่คนไทยพิมพ์มีทั้ง 16/8/69, 16-08-2026 และ
 * 2026-08-16 การ parse เองจะเดาผิดจนได้วันผิดโดยผู้ใช้ไม่รู้ตัว
 */
export function DateField({
  appearance = 'default',
  label,
  value,
  onChange,
  mode = 'date',
  error,
  hint,
  required,
  minimumDate,
  maximumDate,
  placeholder = 'เลือก',
}: DateFieldProps) {
  const { gutter } = useResponsive();
  const { theme } = useAppTheme();
  const isAurora = appearance === 'aurora';

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'date' | 'time'>('date');
  /** ค่าที่กำลังเลือกอยู่ในแผ่น — ยังไม่ส่งออกจนกว่าจะกดยืนยัน */
  const [draft, setDraft] = useState<Date>(() => value ?? new Date());
  /** เดือนที่ปฏิทินกำลังเปิดอยู่ (วันที่ 1 ของเดือนนั้น) */
  const [month, setMonth] = useState<Date>(() => {
    const base = value ?? new Date();

    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const display =
    value === null
      ? placeholder
      : mode === 'time'
        ? timeText(value)
        : mode === 'datetime'
          ? `${dateText(value)} ${timeText(value)}`
          : dateText(value);

  function openPicker() {
    const base = value ?? new Date();

    setDraft(new Date(base));
    setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setStep(mode === 'time' ? 'time' : 'date');
    setOpen(true);
  }

  function commit(next: Date) {
    onChange(next);
    setOpen(false);
  }

  function pickDay(day: Date) {
    const next = new Date(draft);

    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setDraft(next);

    /* โหมดวันอย่างเดียวจบตรงนี้เลย ไม่ต้องให้กดยืนยันซ้ำอีกปุ่ม */
    if (mode === 'date') {
      commit(next);

      return;
    }

    setStep('time');
  }

  function pickTime(part: 'hour' | 'minute', figure: number) {
    const next = new Date(draft);

    if (part === 'hour') next.setHours(figure, next.getMinutes(), 0, 0);
    else next.setMinutes(figure, 0, 0);

    setDraft(next);
  }

  const minDay = minimumDate ? startOfDay(minimumDate) : null;
  const maxDay = maximumDate ? startOfDay(maximumDate) : null;

  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const leading = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1),
    ),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  const rows = Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );

  const today = new Date();

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text
          style={isAurora ? { color: AURORA.textMuted } : undefined}
          tone="muted"
          variant="label"
        >
          {label}
          {required ? (
            <Text
              style={isAurora ? { color: AURORA.rose } : undefined}
              tone="danger"
              variant="label"
            >
              {' '}
              *
            </Text>
          ) : null}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityValue={{ text: value ? display : 'ยังไม่ได้เลือก' }}
        onPress={openPicker}
        style={{
          alignItems: 'center',
          backgroundColor: isAurora ? AURORA.glassStrong : theme.colors.surface,
          borderColor: error
            ? isAurora
              ? AURORA.rose
              : theme.colors.danger
            : isAurora
              ? AURORA.glassBorder
              : theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: error ? 1.5 : 1,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          minHeight: 48,
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        <Icon
          color={isAurora ? AURORA.accent : theme.colors.textSubtle}
          name={mode === 'time' ? 'clock' : 'calendar'}
          size={17}
        />
        <Text
          style={{
            color: isAurora
              ? value
                ? AURORA.text
                : AURORA.textFaint
              : undefined,
            flex: 1,
          }}
          tone={value ? 'default' : 'subtle'}
        >
          {display}
        </Text>
      </Pressable>

      {error ? (
        <Text
          style={isAurora ? { color: AURORA.rose } : undefined}
          tone="danger"
          variant="caption"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text
          style={isAurora ? { color: AURORA.textFaint } : undefined}
          tone="subtle"
          variant="caption"
        >
          {hint}
        </Text>
      ) : null}

      <Sheet
        footer={
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {/* ปุ่มลัด — ค่าที่คนเลือกบ่อยที่สุดคือ "วันนี้" กับ "ตอนนี้" */}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const now = new Date();

                if (step === 'date') {
                  setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  pickDay(now);

                  return;
                }

                const next = new Date(draft);

                next.setHours(now.getHours(), now.getMinutes(), 0, 0);
                setDraft(next);
              }}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed
                  ? 'rgba(37, 99, 235, 0.12)'
                  : AURORA.accentSoft,
                borderRadius: 16,
                justifyContent: 'center',
                minHeight: 50,
                paddingHorizontal: gutter,
              })}
            >
              <Text
                style={{
                  color: AURORA.accent,
                  fontSize: 13.5,
                  fontWeight: '700',
                  lineHeight: 18,
                }}
              >
                {step === 'date' ? 'วันนี้' : 'ตอนนี้'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => commit(draft)}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed ? AURORA.accentEnd : AURORA.accent,
                borderRadius: 16,
                flex: 1,
                justifyContent: 'center',
                minHeight: 50,
              })}
            >
              <Text
                style={{
                  color: AURORA.baseDeep,
                  fontSize: 14,
                  fontWeight: '700',
                  lineHeight: 19,
                }}
              >
                ยืนยัน
              </Text>
            </Pressable>
          </View>
        }
        onClose={() => setOpen(false)}
        title={label ?? (mode === 'time' ? 'เลือกเวลา' : 'เลือกวันที่')}
        visible={open}
      >
        <View style={{ gap: 14 }}>
          {/* ค่าที่กำลังจะได้ — เห็นตลอดเวลาว่ากดแล้วได้อะไร */}
          <View
            style={{
              alignItems: 'center',
              backgroundColor: AURORA.accentSoft,
              borderRadius: 14,
              flexDirection: 'row',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Icon
              color={AURORA.accent}
              name={step === 'time' ? 'clock' : 'calendar'}
              size={16}
            />
            <Text
              style={{
                color: AURORA.accent,
                flex: 1,
                fontSize: 14,
                fontVariant: ['tabular-nums'],
                fontWeight: '700',
                lineHeight: 19,
              }}
            >
              {mode === 'time'
                ? timeText(draft)
                : mode === 'datetime'
                  ? `${dateText(draft)} · ${timeText(draft)}`
                  : dateText(draft)}
            </Text>

            {/* โหมดวัน+เวลาสลับกลับไปแก้วันได้โดยไม่ต้องปิดแผ่น */}
            {mode === 'datetime' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setStep(step === 'date' ? 'time' : 'date')}
                style={{
                  backgroundColor: AURORA.baseDeep,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    color: AURORA.accent,
                    fontSize: 11,
                    fontWeight: '700',
                    lineHeight: 15,
                  }}
                >
                  {step === 'date' ? 'ไปเลือกเวลา' : 'กลับไปเลือกวัน'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {step === 'date' ? (
            <View style={{ gap: 8 }}>
              {/* แถบเลื่อนเดือน */}
              <View
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: 10,
                }}
              >
                <Pressable
                  accessibilityLabel="เดือนก่อนหน้า"
                  accessibilityRole="button"
                  onPress={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed
                      ? AURORA.accentSoft
                      : 'transparent',
                    borderRadius: 999,
                    height: 36,
                    justifyContent: 'center',
                    width: 36,
                  })}
                >
                  <Icon color={AURORA.accent} name="chevron-left" size={18} />
                </Pressable>

                <Text
                  style={{
                    color: AURORA.text,
                    flex: 1,
                    fontSize: 15,
                    fontWeight: '700',
                    lineHeight: 21,
                    textAlign: 'center',
                  }}
                >
                  {thaiDate(month, {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>

                <Pressable
                  accessibilityLabel="เดือนถัดไป"
                  accessibilityRole="button"
                  onPress={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed
                      ? AURORA.accentSoft
                      : 'transparent',
                    borderRadius: 999,
                    height: 36,
                    justifyContent: 'center',
                    width: 36,
                  })}
                >
                  <Icon color={AURORA.accent} name="chevron-right" size={18} />
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: 4 }}>
                {WEEKDAYS.map((weekday) => (
                  <Text
                    key={weekday}
                    style={{
                      color: AURORA.textFaint,
                      flex: 1,
                      fontSize: 10.5,
                      lineHeight: 15,
                      textAlign: 'center',
                    }}
                  >
                    {weekday}
                  </Text>
                ))}
              </View>

              {rows.map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', gap: 4 }}>
                  {row.map((day, columnIndex) => {
                    if (!day) {
                      return (
                        <View
                          key={`empty-${rowIndex}-${columnIndex}`}
                          style={{ flex: 1, height: 40 }}
                        />
                      );
                    }

                    const disabled =
                      (minDay !== null && day < minDay) ||
                      (maxDay !== null && day > maxDay);
                    const selected = sameDay(day, draft);
                    const isToday = sameDay(day, today);

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled, selected }}
                        disabled={disabled}
                        key={day.toISOString()}
                        onPress={() => pickDay(day)}
                        style={({ pressed }) => ({
                          alignItems: 'center',
                          backgroundColor: selected
                            ? AURORA.accent
                            : pressed
                              ? AURORA.accentSoft
                              : 'transparent',
                          borderColor: AURORA.accent,
                          borderRadius: 12,
                          borderWidth: !selected && isToday ? 1.5 : 0,
                          flex: 1,
                          height: 40,
                          justifyContent: 'center',
                          opacity: disabled ? 0.3 : 1,
                        })}
                      >
                        <Text
                          style={{
                            color: selected ? AURORA.baseDeep : AURORA.text,
                            fontSize: 13.5,
                            fontVariant: ['tabular-nums'],
                            fontWeight: selected || isToday ? '700' : '500',
                            lineHeight: 18,
                          }}
                        >
                          {day.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : (
            /*
              เวลาเป็นสองคอลัมน์เลื่อนได้ ไม่ใช่วงล้อจำลอง — วงล้อที่เขียนเอง
              ต้องคำนวณ snap เองและเพี้ยนง่ายบนเว็บ ส่วนคอลัมน์รายการเลื่อนแม่น
              ทุกแพลตฟอร์มและแตะเลือกทีเดียวจบ
            */
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(
                [
                  { data: HOURS, part: 'hour' as const, title: 'ชั่วโมง' },
                  { data: MINUTES, part: 'minute' as const, title: 'นาที' },
                ] satisfies {
                  data: number[];
                  part: 'hour' | 'minute';
                  title: string;
                }[]
              ).map((column) => {
                const current =
                  column.part === 'hour'
                    ? draft.getHours()
                    : draft.getMinutes();

                return (
                  <View key={column.part} style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11,
                        lineHeight: 15,
                        textAlign: 'center',
                      }}
                    >
                      {column.title}
                    </Text>

                    <View
                      style={{
                        borderColor: AURORA.glassBorder,
                        borderRadius: 14,
                        borderWidth: 1,
                        height: TIME_ROW_HEIGHT * 5,
                        overflow: 'hidden',
                      }}
                    >
                      <ScrollView
                        contentContainerStyle={{ paddingVertical: 4 }}
                        contentOffset={{
                          x: 0,
                          y: Math.max(current - 2, 0) * TIME_ROW_HEIGHT,
                        }}
                        showsVerticalScrollIndicator={false}
                      >
                        {column.data.map((figure) => {
                          const active = figure === current;

                          return (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              key={figure}
                              onPress={() => pickTime(column.part, figure)}
                              style={({ pressed }) => ({
                                alignItems: 'center',
                                backgroundColor: active
                                  ? AURORA.accent
                                  : pressed
                                    ? AURORA.accentSoft
                                    : 'transparent',
                                borderRadius: 10,
                                height: TIME_ROW_HEIGHT - 4,
                                justifyContent: 'center',
                                marginHorizontal: 6,
                                marginVertical: 2,
                              })}
                            >
                              <Text
                                style={{
                                  color: active
                                    ? AURORA.baseDeep
                                    : AURORA.text,
                                  fontSize: 15,
                                  fontVariant: ['tabular-nums'],
                                  fontWeight: active ? '800' : '500',
                                  lineHeight: 20,
                                }}
                              >
                                {String(figure).padStart(2, '0')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </Sheet>
    </View>
  );
}
