import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
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
  /*
   * ขอบบนของแป้นพิมพ์ในพิกัดหน้าจอ ไม่ใช่ความสูงของมัน
   *
   * ระบบส่งค่านี้มาให้ตรง ๆ (`endCoordinates.screenY`) ซึ่งเทียบกับพิกัดที่
   * `measureInWindow` คืนมาได้เลย ต่างจากการเอาความสูงจอลบความสูงแป้นพิมพ์
   * ที่บน Android แบบ edge-to-edge สองค่านั้นไม่ได้อ้างอิงขอบเดียวกันเสมอไป
   */
  const keyboardTopRef = useRef(0);
  /** ช่องที่ถูกโฟกัสล่าสุด รอเลื่อนเมื่อรู้ตำแหน่งแป้นพิมพ์ */
  const focusedRef = useRef<View | null>(null);
  /* ความสูงแป้นพิมพ์แบบที่ทำให้เรนเดอร์ใหม่ — ใช้เฉพาะ Android ดูเหตุผลข้างล่าง */
  const [androidKeyboard, setAndroidKeyboard] = useState(0);

  const scrollIntoView = useCallback(
    (target: View | null, keyboardTop: number) => {
      if (!target || keyboardTop <= 0) return;

      target.measureInWindow((_x, y, _width, height) => {
        const visibleBottom = keyboardTop - extraOffset;
        const fieldBottom = y + height;

        if (fieldBottom <= visibleBottom) return;

        scrollRef.current?.scrollTo({
          animated: true,
          y: offsetRef.current + (fieldBottom - visibleBottom),
        });
      });
    },
    [extraOffset],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      if (Platform.OS === 'android') {
        setAndroidKeyboard(event.endCoordinates.height);
      }

      /*
       * เลื่อนตอน "แป้นพิมพ์ขึ้นแล้ว" ไม่ใช่ตอน "ช่องถูกโฟกัส"
       *
       * ของเดิมตั้งเวลาหน่วงไว้ 140 มิลลิวินาทีหลังโฟกัสแล้วค่อยวัด ซึ่งเป็น
       * การเดาว่าแป้นพิมพ์ขึ้นเสร็จแล้ว บนเครื่องที่ช้ากว่านั้นความสูงแป้นยัง
       * เป็นศูนย์ การคำนวณจึงสรุปว่าช่องไม่ได้ถูกบังแล้วไม่เลื่อนอะไรเลย
       * ผู้ใช้ต้องเลื่อนเอง — เป็นอาการที่เจอจริงบนเครื่อง
       *
       * หน่วงสั้น ๆ ตรงนี้เพื่อรอให้ที่ว่างท้ายเนื้อหาที่เพิ่งเพิ่ม (ดูข้างล่าง)
       * มีผลกับ layout ก่อน ไม่งั้นจะวัดได้ตำแหน่งของ layout รอบก่อน
       */
      setTimeout(
        () => scrollIntoView(focusedRef.current, keyboardTopRef.current),
        60,
      );
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardTopRef.current = 0;
      focusedRef.current = null;
      if (Platform.OS === 'android') setAndroidKeyboard(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollIntoView]);

  const ensureVisible = useCallback<EnsureVisible>(
    (target) => {
      focusedRef.current = target;

      /*
       * ย้ายไปช่องอื่นทั้งที่แป้นพิมพ์ขึ้นค้างอยู่ — กรณีนี้ `keyboardDidShow`
       * ไม่ยิงซ้ำ จึงต้องเป็นคนเลื่อนเองที่นี่
       */
      if (keyboardTopRef.current > 0) {
        setTimeout(() => scrollIntoView(target, keyboardTopRef.current), 60);
      }
    },
    [scrollIntoView],
  );

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    offsetRef.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  }

  /*
   * เผื่อที่ว่างท้ายเนื้อหาเท่าความสูงแป้นพิมพ์ — Android เท่านั้น
   *
   * ตั้งแต่ SDK 54 Android เป็น edge-to-edge เสมอ หน้าต่างจึงไม่ถูกย่อลงเมื่อ
   * แป้นพิมพ์ขึ้นอีกต่อไป `ScrollView` ยังสูงเท่าเดิม แปลว่าถ้าเนื้อหาไม่ยาว
   * เกินจอ (เช่นจอล็อกอินที่จัดกลางด้วย `justifyContent: 'center'`) มันจะไม่มี
   * ที่ให้เลื่อนเลย แล้ว `scrollTo` ข้างบนก็ทำอะไรไม่ได้ ช่องล่างสุดเลยถูก
   * แป้นพิมพ์ทับค้างไว้ ส่วนฟอร์มที่ยาวเกินจออยู่แล้วก็ยังเลื่อนช่องสุดท้าย
   * ให้พ้นแป้นพิมพ์ไม่ได้ เพราะเลื่อนได้แค่สุดเนื้อหาเดิม
   *
   * iOS ไม่ต้องเผื่อ เพราะจอที่ใช้ตัวนี้ครอบด้วย `KeyboardAvoidingView`
   * behavior="padding" ซึ่งหดกรอบให้แล้ว ใส่ซ้ำจะกลายเป็นเผื่อสองชั้น
   */
  const basePadding = StyleSheet.flatten(
    props.contentContainerStyle,
  )?.paddingBottom;
  const contentContainerStyle =
    androidKeyboard > 0
      ? [
          props.contentContainerStyle,
          {
            paddingBottom:
              (typeof basePadding === 'number' ? basePadding : 0) +
              androidKeyboard,
          },
        ]
      : props.contentContainerStyle;

  return (
    <KeyboardScrollContext.Provider value={ensureVisible}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...props}
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        ref={scrollRef}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  );
}
