import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AURORA } from './aurora/palette';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { elevation, type ToneName } from './tokens';
import { useAppTheme } from '@/theme/use-app-theme';

/* ----------------------------------------------------------------- Toast */

type ToastTone = Extract<ToneName, 'success' | 'danger' | 'warning' | 'primary'>;

interface ToastItem {
  id: number;
  message: string;
  title: string;
  tone: ToastTone;
}

/**
 * หัวข้อส่งเองได้ ไม่ส่งก็ใช้หัวข้อประจำโทน
 *
 * จุดเรียกส่วนใหญ่มีข้อความเดียวจบอยู่แล้ว การบังคับให้ทุกที่คิดหัวข้อเองจะได้
 * หัวข้อกำกวมเต็มไปหมด — ค่าเริ่มต้นตามโทนอ่านถูกต้องเสมอ ("สำเร็จ" / "ผิดพลาด")
 * ส่วนจุดที่มีเรื่องเฉพาะของตัวเอง (เช่น "เซสชันสิ้นสุด") ค่อยส่งมาทับ
 */
interface ToastApi {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warn: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast ต้องอยู่ภายใน ToastProvider');
  }

  return context;
}

const TOAST_DURATION = 3200;

/**
 * สีกับไอคอนของแต่ละโทน — หยิบจาก `AURORA` ไม่ใช่ `theme`
 *
 * ทั้งแอปเป็นผิวออโรราแล้ว (พื้นฟ้าอ่อน/ขาวตลอดทั้งสองโหมด) ถ้าแถบนี้ยังใช้สี
 * ธีม ผู้ใช้โหมดมืดจะได้แถบสีเข้มลอยอยู่เหนือจอสีอ่อน — อ่านเป็นของแอปอื่น
 */
const TOAST_TONE: Record<
  ToastTone,
  { color: string; icon: IconName; title: string }
> = {
  danger: { color: AURORA.rose, icon: 'alert-circle', title: 'ไม่สำเร็จ' },
  primary: { color: AURORA.accent, icon: 'info', title: 'แจ้งให้ทราบ' },
  success: { color: AURORA.emerald, icon: 'check', title: 'สำเร็จ' },
  warning: { color: AURORA.amber, icon: 'alert-triangle', title: 'โปรดทราบ' },
};

/**
 * แจ้งผลสั้น ๆ ลอยด้านบน
 *
 * วางไว้บนสุดของแอปครั้งเดียว ทุกจอเรียกผ่าน useToast()
 * ไม่ใช้ Alert ของระบบเพราะปิดกั้นการใช้งานและปรับหน้าตาไม่ได้
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastItem | null>(null);
  /* lazy init เหมือน Skeleton — ห้ามอ่าน ref.current ตอน render */
  /* เริ่มจากเหนือขอบจอ แล้วไหลลงมา — แคปซูลอยู่ด้านบน */
  const [translateY] = useState(() => new Animated.Value(-80));
  /*
   * ความคืบหน้าของการปรากฏ 0→1 — ใช้คุมทั้งความจางและการย่อขยายจากค่าเดียว
   * แถบจึงลอยลงมาพร้อมชัดขึ้นและขยายเข้าที่เป็นจังหวะเดียวกัน ไม่ใช่สาม
   * อนิเมชันที่วิ่งคนละจังหวะ
   */
  const [appear] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        duration: 180,
        toValue: -80,
        useNativeDriver: true,
      }),
      Animated.timing(appear, {
        duration: 160,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  }, [appear, translateY]);

  const show = useCallback(
    (message: string, itemTone: ToastTone, title?: string) => {
      counter.current += 1;
      setToast({
        id: counter.current,
        message,
        title: title ?? TOAST_TONE[itemTone].title,
        tone: itemTone,
      });

      appear.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          damping: 18,
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(appear, {
          duration: 220,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, TOAST_DURATION);
    },
    [appear, hide, translateY],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      error: (message, title) => show(message, 'danger', title),
      info: (message, title) => show(message, 'primary', title),
      success: (message, title) => show(message, 'success', title),
      warn: (message, title) => show(message, 'warning', title),
    }),
    [show],
  );

  const palette = toast ? TOAST_TONE[toast.tone] : null;

  return (
    <ToastContext.Provider value={api}>
      {children}

      {toast && palette ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            left: 0,
            opacity: appear,
            paddingHorizontal: 16,
            position: 'absolute',
            right: 0,
            /* ใต้แถบสถานะเล็กน้อย — ชิดกว่านี้แคปซูลจะไปแตะขอบจอ */
            top: insets.top + 10,
            transform: [
              { translateY },
              {
                scale: appear.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.94, 1],
                }),
              },
            ],
            zIndex: 999,
          }}
        >
          {/*
            การ์ดหัวข้อ + คำอธิบาย — ทรงเดียวกับแจ้งเตือนของระบบ

            สองบรรทัดทำให้ "เรื่องอะไร" กับ "รายละเอียด" แยกกันตั้งแต่เหลือบตา
            แคปซูลบรรทัดเดียวที่ลองก่อนหน้าอ่านง่ายก็จริง แต่พอข้อความยาวขึ้น
            (เช่นข้อความ error จากเซิร์ฟเวอร์) มันก็เป็นก้อนตัวหนังสือก้อนเดียว
            ที่ต้องอ่านทั้งหมดถึงจะรู้ว่าเรื่องดีหรือเรื่องร้าย

            เต็มความกว้าง ไม่ใช่กว้างตามข้อความ — ความสูงของการ์ดเปลี่ยนตาม
            จำนวนบรรทัดอยู่แล้ว ถ้าความกว้างขยับตามข้อความด้วย แถบจะกระโดด
            ไปมาทุกครั้งที่ขึ้นคนละข้อความ
          */}
          <Pressable
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            onPress={hide}
            style={{
              alignItems: 'flex-start',
              backgroundColor: AURORA.baseDeep,
              borderColor: `${palette.color}26`,
              borderRadius: 20,
              borderWidth: 1,
              elevation: 10,
              flexDirection: 'row',
              gap: 12,
              paddingHorizontal: 14,
              paddingVertical: 13,
              shadowColor: '#0f172a',
              shadowOffset: { height: 10, width: 0 },
              shadowOpacity: 0.16,
              shadowRadius: 22,
            }}
          >
            {/* วงไอคอนพื้นสีจาง — จุดเดียวในการ์ดที่มีสี ที่เหลือเป็นขาว-ดำ */}
            <View
              style={{
                alignItems: 'center',
                backgroundColor: `${palette.color}1f`,
                borderRadius: 999,
                height: 34,
                justifyContent: 'center',
                width: 34,
              }}
            >
              <Icon color={palette.color} name={palette.icon} size={17} />
            </View>

            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: AURORA.text,
                  fontSize: 13,
                  fontWeight: '800',
                  lineHeight: 18,
                }}
              >
                {toast.title}
              </Text>
              <Text
                numberOfLines={3}
                style={{
                  color: AURORA.textMuted,
                  fontSize: 12.5,
                  lineHeight: 18,
                }}
              >
                {toast.message}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

/* -------------------------------------------------------- ConfirmDialog */

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ถามยืนยันก่อนทำสิ่งที่ย้อนยาก (ยกเลิกใบคำขอ ล็อกเอาต์ ถอนเครื่อง)
 * ใช้ Modal ของ RN แทน Alert เพื่อให้ปุ่มอันตรายเป็นสีแดงเหมือนกันทุกแพลตฟอร์ม
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { theme } = useAppTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.overlay,
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        <View
          style={[
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              gap: theme.spacing.sm,
              maxWidth: 420,
              padding: theme.spacing.lg,
              width: '100%',
            },
            elevation(theme, 3),
          ]}
        >
          <Text variant="h3">{title}</Text>
          {message ? (
            <Text tone="muted" variant="caption">
              {message}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.xs,
              marginTop: theme.spacing.xs,
            }}
          >
            <View style={{ flex: 1 }}>
              <Button
                disabled={loading}
                onPress={onCancel}
                title={cancelLabel}
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                loading={loading}
                onPress={onConfirm}
                title={confirmLabel}
                variant={destructive ? 'danger' : 'primary'}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
