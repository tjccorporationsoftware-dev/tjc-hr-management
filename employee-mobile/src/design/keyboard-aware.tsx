import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ScrollViewProps,
  type View,
  type ViewStyle,
} from 'react-native';

export interface KeyboardAwareProps {
  children: ReactNode;
  /**
   * `screen` = ใช้กับจอปกติ · `sheet` = ใช้กับของที่อยู่ใน `<Modal>`
   *
   * ต่างกันที่ Android: จอปกติระบบย่อหน้าต่างให้เองอยู่แล้ว ถ้าใส่ behavior
   * ซ้ำจะเด้งสองชั้น ส่วนของที่อยู่ใน Modal ไม่ถูกย่อตาม ต้องหดความสูงเอง
   */
  mode?: 'screen' | 'sheet';
  style?: ViewStyle;
}

/**
 * ตัวกันแป้นพิมพ์ทับช่องกรอก
 *
 * ใช้ที่เดียวทั้งแอปแทนที่จะให้แต่ละจอเขียน `KeyboardAvoidingView` เอง เพราะ
 * ค่า behavior ที่ถูกต้องต่างกันระหว่างแพลตฟอร์มและระหว่าง "จอ" กับ "แผ่นใน
 * Modal" — เขียนกระจายเมื่อไรก็จะมีจอที่ลืมหรือใส่ผิดค่าเสมอ
 */
export function KeyboardAware({
  children,
  mode = 'screen',
  style,
}: KeyboardAwareProps) {
  return (
    <KeyboardAvoidingView
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : mode === 'sheet'
            ? 'height'
            : undefined
      }
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * ตัวเลื่อนช่องที่กำลังพิมพ์ให้พ้นแป้นพิมพ์
 *
 * `KeyboardAvoidingView` ทำได้แค่หดพื้นที่จอ ช่องที่อยู่กลางฟอร์มยาว ๆ จึงยัง
 * ถูกแป้นพิมพ์บังอยู่ดี ตัวนี้เป็นคนเลื่อนให้: ตอนช่องไหนถูกโฟกัส มันจะวัด
 * ตำแหน่งจริงบนจอแล้วเลื่อน `ScrollView` ขึ้นเท่าที่ขาด
 */
type EnsureVisible = (target: View | null) => void;

const KeyboardScrollContext = createContext<EnsureVisible | null>(null);

/** ให้ `Input` เรียกตอนโฟกัส — คืน null เมื่อไม่ได้อยู่ในตัวเลื่อนของฟอร์ม */
export function useKeyboardScroll() {
  return useContext(KeyboardScrollContext);
}

export interface KeyboardAwareScrollProps extends ScrollViewProps {
  children: ReactNode;
  /** ระยะเผื่อเหนือแป้นพิมพ์ ไม่ให้ช่องไปแปะขอบแป้นพอดี */
  extraOffset?: number;
}

export function KeyboardAwareScroll({
  children,
  extraOffset = 24,
  onScroll,
  ...props
}: KeyboardAwareScrollProps) {
  const scrollRef = useRef<ScrollView>(null);
  /* ค่าที่ต้องอ่านตอนเกิดเหตุการณ์เท่านั้น เก็บใน ref ไม่ให้เรนเดอร์ใหม่ทุกเฟรม */
  const offsetRef = useRef(0);
  const keyboardRef = useRef(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event) => {
      keyboardRef.current = event.endCoordinates.height;
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardRef.current = 0;
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const ensureVisible = useCallback<EnsureVisible>(
    (target) => {
      if (!target) return;

      /*
       * หน่วงก่อนวัด — ตอน onFocus แป้นพิมพ์ยังไม่ขึ้นสุด ความสูงที่ได้จะเป็น
       * ของรอบก่อน (หรือศูนย์ในครั้งแรก) แล้วเลื่อนผิดระยะ
       */
      setTimeout(
        () => {
          target.measureInWindow((_x, y, _width, height) => {
            const screenHeight = Dimensions.get('window').height;
            const visibleBottom =
              screenHeight - keyboardRef.current - extraOffset;
            const fieldBottom = y + height;

            if (fieldBottom <= visibleBottom) return;

            scrollRef.current?.scrollTo({
              animated: true,
              y: offsetRef.current + (fieldBottom - visibleBottom),
            });
          });
        },
        Platform.OS === 'android' ? 140 : 80,
      );
    },
    [extraOffset],
  );

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    offsetRef.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  }

  return (
    <KeyboardScrollContext.Provider value={ensureVisible}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...props}
        onScroll={handleScroll}
        ref={scrollRef}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  );
}
