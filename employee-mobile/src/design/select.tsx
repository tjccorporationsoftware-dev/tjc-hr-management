import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';

import { Sheet } from './sheet';
import { Text } from './text';
import { hitSlop } from './tokens';
import { AURORA } from './aurora';
import { useAppTheme } from '@/theme/use-app-theme';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** บรรทัดรองในตัวเลือก เช่น โควตาคงเหลือของประเภทลา */
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  appearance?: 'aurora' | 'default';
  label?: string;
  /**
   * `sheet` = เปิดแผ่นเลื่อนขึ้นจากด้านล่าง (ค่าเริ่มต้น)
   * `inline` = ป๊อปอัพลอยทับตรงตำแหน่งช่อง
   *
   * ใช้ `inline` เมื่อตัว Select อยู่ใน `<Sheet>` อีกทีหนึ่ง — แผ่นซ้อนแผ่น
   * ทำให้ผู้ใช้เห็นของเด้งขึ้นมาทับแผ่นเดิม แล้วงงว่าปิดอันไหนกลับไปอันไหน
   */
  mode?: 'inline' | 'sheet';
  placeholder?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  error?: string;
  /** ข้อความช่วยใต้ช่อง แสดงเมื่อยังไม่มี error — เหมือน Input */
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * ความสูงสูงสุดของป๊อปอัพ — ประมาณหกบรรทัด
 *
 * เกินกว่านี้ให้เลื่อนในรายการเอง ไม่ใช่ยืดจนล้นออกนอกจอ
 */
const POPOVER_MAX_HEIGHT = 288;
/** ระยะห่างระหว่างช่องกับป๊อปอัพ — ต้องเห็นเป็นช่องว่าง ไม่ใช่ต่อกันเป็นชิ้นเดียว */
const POPOVER_GAP = 10;
/** กันไม่ให้ป๊อปอัพชนขอบจอบน/ล่าง */
const POPOVER_SCREEN_MARGIN = 16;
/** ที่ว่างต่ำกว่านี้ถือว่าไม่พอ ให้ไปกางขึ้นแทน */
const POPOVER_MIN_HEIGHT = 168;

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ตัวเลือกแบบเปิดแผ่นล่าง หรือป๊อปอัพลอยทับตรงช่อง (`mode="inline"`) ไม่ใช้
 * Picker ของแต่ละแพลตฟอร์ม
 *
 * เหตุผล: Picker ของ iOS กับ Android หน้าตาและพฤติกรรมต่างกันมาก
 * และแสดงบรรทัดรอง (โควตาคงเหลือ) ไม่ได้ ซึ่งเป็นข้อมูลที่ผู้ใช้ต้องเห็น
 * ก่อนเลือกประเภทลา
 */
export function Select<T extends string = string>({
  appearance = 'default',
  label,
  mode = 'sheet',
  placeholder = 'เลือก',
  value,
  options,
  onChange,
  error,
  hint,
  required,
  disabled,
}: SelectProps<T>) {
  const { theme } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  /*
   * ตำแหน่งจริงของช่องบนจอ วัดตอนกดเปิด (ไม่ใช่ตอน render — ตอนนั้นยังไม่รู้ว่า
   * ผู้ใช้เลื่อนจอมาถึงไหน) ใช้วางป๊อปอัพให้ตรงช่องและเลือกทิศกาง
   *
   * ## ทำไมต้องเป็น Modal ไม่ใช่กล่อง `absolute` ใต้ช่อง
   *
   * กล่องที่กางอยู่ในแผ่นเดิมมีพื้นขาวเหมือนแผ่น เงาก็ถูกแผ่นบังจนแทบไม่เห็น
   * ผลคืออ่านเป็น "ช่องเดียวยาว ๆ" กลืนไปกับตัวกรองอื่น แถมตัวเลือกท้าย ๆ
   * ยังตกนอกแผ่นเวลาช่องอยู่ค่อนไปทางล่าง — ป๊อปอัพบน Modal มีฉากมืดคั่น
   * จึงแยกชั้นออกจากแผ่นชัดเจน และวางได้ทุกที่บนจอโดยไม่ถูกแผ่นตัดขอบ
   */
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const fieldRef = useRef<View>(null);
  const isAurora = appearance === 'aurora';

  const selected = options.find((option) => option.value === value) ?? null;
  const inline = mode === 'inline';

  /** เปิดป๊อปอัพหลังวัดตำแหน่งช่องได้แล้ว — วัดไม่ได้ก็ไม่เปิดค้างไว้ลอย ๆ */
  const openInline = () => {
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ height, width, x, y });
      setOpen(true);
    });
  };

  /* ที่ว่างจริงรอบช่อง → กางลงหรือกางขึ้น และสูงได้แค่ไหน */
  const placement = (() => {
    if (!anchor) {
      return null;
    }

    const spaceBelow =
      windowHeight -
      (anchor.y + anchor.height) -
      POPOVER_GAP -
      POPOVER_SCREEN_MARGIN;
    const spaceAbove = anchor.y - POPOVER_GAP - POPOVER_SCREEN_MARGIN;
    const dropUp = spaceBelow < POPOVER_MIN_HEIGHT && spaceAbove > spaceBelow;
    const room = dropUp ? spaceAbove : spaceBelow;

    return {
      dropUp,
      maxHeight: Math.max(
        POPOVER_MIN_HEIGHT,
        Math.min(POPOVER_MAX_HEIGHT, room),
      ),
    };
  })();

  /*
   * ตัวเลือกหนึ่งบรรทัด — ใช้ร่วมกันทั้งป๊อปอัพและแผ่นเลื่อน จะได้ไม่มี
   * สองแบบหน้าตาเพี้ยนกันเพราะแก้ที่เดียวแล้วลืมอีกที่
   *
   * ทั้งสองแบบเป็น "แถวในรายการเดียว คั่นด้วยเส้นบาง" ไม่ใช่กล่องมนใบละใบ —
   * ตัวเลือกหกเจ็ดตัวที่เป็นกล่องซ้อนกันอ่านเป็นการ์ดหลายใบลอยอยู่ ทั้งที่
   * มันคือรายการเดียวให้เลือกหนึ่งอัน และกินความสูงเกินจำเป็นไปเกือบเท่าตัว
   */
  const renderOption = (
    option: SelectOption<T>,
    index: number,
    compact: boolean,
  ) => {
    const active = option.value === value;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: option.disabled, selected: active }}
        disabled={option.disabled}
        key={option.value}
        onPress={() => {
          onChange(option.value);
          setOpen(false);
        }}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: active
            ? isAurora
              ? AURORA.accentSoft
              : theme.colors.primarySoft
            : pressed
              ? isAurora
                ? 'rgba(37, 99, 235, 0.06)'
                : theme.colors.surfaceAlt
              : 'transparent',
          borderTopColor: isAurora ? AURORA.glassBorder : theme.colors.border,
          borderTopWidth: index === 0 ? 0 : 1,
          flexDirection: 'row',
          gap: 10,
          minHeight: compact ? 46 : 52,
          opacity: option.disabled ? 0.45 : 1,
          paddingHorizontal: 12,
          paddingVertical: compact ? 8 : 9,
        })}
      >
        {/* ขีดสีหน้าตัวที่เลือกอยู่ — บอกได้ตั้งแต่ยังไม่ทันอ่านว่าอันไหนถูกเลือก */}
        <View
          style={{
            backgroundColor: active
              ? isAurora
                ? AURORA.accent
                : theme.colors.primary
              : 'transparent',
            borderRadius: 999,
            height: 18,
            width: 3,
          }}
        />

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            style={{
              color: isAurora
                ? active
                  ? AURORA.accent
                  : AURORA.text
                : undefined,
              fontSize: 14,
              fontWeight: active ? '700' : '500',
              lineHeight: 19,
            }}
          >
            {option.label}
          </Text>
          {option.description ? (
            <Text
              numberOfLines={1}
              style={{
                color: isAurora ? AURORA.textMuted : undefined,
                fontSize: 11.5,
                lineHeight: 16,
              }}
              tone="muted"
            >
              {option.description}
            </Text>
          ) : null}
        </View>

        {active ? (
          <Ionicons
            color={isAurora ? AURORA.accent : theme.colors.primary}
            name="checkmark-circle"
            size={compact ? 17 : 19}
          />
        ) : null}
      </Pressable>
    );
  };

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
        ref={fieldRef}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        disabled={disabled}
        onPress={() => {
          if (!inline) {
            setOpen(true);
            return;
          }

          if (open) {
            setOpen(false);
            return;
          }

          openInline();
        }}
        style={{
          alignItems: 'center',
          backgroundColor: disabled
            ? isAurora
              ? AURORA.accentSoft
              : theme.colors.surfaceAlt
            : isAurora
              ? AURORA.glassStrong
              : theme.colors.surface,
          borderColor: error
            ? isAurora
              ? AURORA.rose
              : theme.colors.danger
            : inline && open
              ? isAurora
                ? AURORA.accent
                : theme.colors.primary
              : isAurora
                ? AURORA.glassBorder
                : theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: error || (inline && open) ? 1.5 : 1,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          minHeight: 48,
          opacity: disabled ? 0.6 : 1,
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: isAurora
              ? selected
                ? AURORA.text
                : AURORA.textFaint
              : undefined,
            flex: 1,
          }}
          tone={selected ? 'default' : 'subtle'}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons
          color={isAurora ? AURORA.accent : theme.colors.textSubtle}
          name={inline && open ? 'chevron-up' : 'chevron-down'}
          size={18}
        />
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

      {inline ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setOpen(false)}
          statusBarTranslucent
          transparent
          visible={open && anchor !== null}
        >
          {/* ฉากมืดบาง ๆ — ตัวที่ทำให้ป๊อปอัพ "ลอย" แทนที่จะกลืนไปกับแผ่นข้างหลัง */}
          <Pressable
            accessibilityLabel="ปิด"
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.32)', flex: 1 }}
          />

          {anchor && placement ? (
            <View
              pointerEvents="box-none"
              style={{
                left: anchor.x,
                position: 'absolute',
                width: anchor.width,
                ...(placement.dropUp
                  ? { bottom: windowHeight - anchor.y + POPOVER_GAP }
                  : { top: anchor.y + anchor.height + POPOVER_GAP }),
              }}
            >
              <View
                style={{
                  backgroundColor: isAurora
                    ? AURORA.baseDeep
                    : theme.colors.surface,
                  borderColor: isAurora
                    ? 'rgba(29, 78, 216, 0.22)'
                    : theme.colors.borderStrong,
                  borderRadius: 16,
                  borderWidth: 1,
                  elevation: 18,
                  overflow: 'hidden',
                  shadowColor: '#0f172a',
                  shadowOffset: {
                    height: placement.dropUp ? -10 : 10,
                    width: 0,
                  },
                  shadowOpacity: 0.26,
                  shadowRadius: 22,
                }}
              >
                {/*
                  หัวป๊อปอัพบอกว่ากำลังเลือกอะไรอยู่ และเป็นเส้นแบ่งให้เห็นว่า
                  ตรงไหนคือรายการตัวเลือก ตรงไหนคือช่องเดิม
                */}
                {label ? (
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: isAurora
                        ? 'rgba(29, 78, 216, 0.05)'
                        : theme.colors.surfaceAlt,
                      borderBottomColor: isAurora
                        ? AURORA.glassBorder
                        : theme.colors.border,
                      borderBottomWidth: 1,
                      flexDirection: 'row',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: isAurora ? AURORA.textMuted : undefined,
                        flex: 1,
                      }}
                      tone="muted"
                      variant="label"
                    >
                      {label}
                    </Text>
                    <Pressable
                      accessibilityLabel="ปิด"
                      accessibilityRole="button"
                      hitSlop={hitSlop}
                      onPress={() => setOpen(false)}
                    >
                      <Ionicons
                        color={
                          isAurora ? AURORA.textFaint : theme.colors.textSubtle
                        }
                        name="close"
                        size={16}
                      />
                    </Pressable>
                  </View>
                ) : null}

                {/*
                  รายการเลื่อนในตัวเอง ไม่ปล่อยให้ยาวตามจำนวนตัวเลือก

                  `nestedScrollEnabled` จำเป็นบน Android — ถ้าไม่ใส่ ตัวที่เลื่อน
                  อยู่ข้างนอกจะกินท่าปัดไปหมด แล้วรายการข้างในไม่ขยับเลย
                */}
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  style={{ maxHeight: placement.maxHeight }}
                >
                  {options.map((option, index) =>
                    renderOption(option, index, true),
                  )}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </Modal>
      ) : (
        <Sheet
          onClose={() => setOpen(false)}
          title={label ?? placeholder}
          visible={open}
        >
          <View style={{ marginHorizontal: -4 }}>
            {options.map((option, index) => renderOption(option, index, false))}
          </View>
        </Sheet>
      )}
    </View>
  );
}
