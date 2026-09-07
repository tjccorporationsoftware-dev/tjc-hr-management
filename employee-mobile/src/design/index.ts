/**
 * Design System ของแอป — จุดเดียวที่หน้าจอควร import คอมโพเนนต์และ token
 *
 * กติกา
 *   1. **จอที่ใช้ผิวออโรรา (ซึ่งคือเป้าหมายของทุกจอ) หยิบสีจาก `AURORA` เท่านั้น**
 *      ห้ามใช้ tone ของธีมหรือ theme.colors บนจอพวกนั้น — ดู AGENTS.md
 *   2. จอที่ยังไม่ได้ย้าย ให้ใช้สีผ่านคอมโพเนนต์หรือ useAppTheme() ห้าม import
 *      theme/colors ตรง ๆ ไม่งั้นโหมดมืดจะพังเป็นจุด ๆ
 *   3. ห้ามใส่ค่าสี/ระยะเป็นตัวเลขลอยในหน้าจอ ให้เพิ่ม token ที่นี่แทน
 *   4. คอมโพเนนต์ทุกตัวต้องรองรับโหมดมืดและ font scale ตั้งแต่วันแรก
 */

export { Badge, type BadgeProps } from './badge';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './button';
export { Card, type CardProps } from './card';
export { DateField, type DateFieldMode, type DateFieldProps } from './date-field';
export { ConfirmDialog, ToastProvider, useToast, type ConfirmDialogProps } from './feedback';
export {
  FingerprintMark,
  Icon,
  type IconName,
  type IconProps,
} from './icon';
export { Input, type InputProps } from './input';
export { ListRow, type ListRowProps } from './list-row';
export { MonthSwitcher, type MonthSwitcherProps } from './month-switcher';
export { Select, type SelectOption, type SelectProps } from './select';
export {
  KeyboardAware,
  KeyboardAwareScroll,
  useKeyboardScroll,
  type KeyboardAwareProps,
  type KeyboardAwareScrollProps,
} from './keyboard-aware';
export { Sheet, type SheetProps } from './sheet';
export {
  EmptyState,
  ErrorState,
  InlineNotice,
  Skeleton,
  SkeletonList,
  type EmptyStateProps,
  type ErrorStateProps,
  type InlineNoticeProps,
  type SkeletonProps,
} from './states';
export { Screen } from '@/components/ui/screen';
export { Text, type TextProps, type TextTone } from './text';
export {
  MIN_TOUCH_SIZE,
  duration,
  elevation,
  hitSlop,
  tone,
  type ToneName,
} from './tokens';
