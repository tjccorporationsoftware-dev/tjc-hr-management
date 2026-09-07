/**
 * ชุด UI มาตรฐานของทั้งระบบ
 * -------------------------
 * นำเข้าจากที่นี่ที่เดียว: import { Button, DataTable, Modal, ... } from "@/components/kit"
 *
 * ต้นแบบของดีไซน์คือหน้า /payroll และ /payroll/[periodId]
 * หน้าใหม่ทุกหน้าให้ใช้ชุดนี้ ส่วนหน้าเก่าที่ยังใช้ hr-ui / manager-ui / ess-ui
 * หรือเขียน modal เองจะทยอยแปลงมาใช้ชุดนี้ทีละหน้า
 */

export { joinClassName } from "@/components/ui/class-name";

export {
  CONTROL_BASE,
  CONTROL_HEIGHT,
  FOCUS_RING,
  HAIRLINE,
  PAGE_BACKGROUND,
  PAGE_MAX_WIDTH,
  RADIUS_CONTROL,
  RADIUS_SURFACE,
  SURFACE_BASE,
  TONE_SOFT,
  TONE_TEXT,
  type Tone,
} from "./tokens";

export {
  Button,
  ButtonLink,
  IconButton,
  type ButtonSize,
  type ButtonVariant,
} from "./button";

export { Avatar } from "./avatar";

export { PageChip, PageHeading, PageSurface } from "./page";

export { Notice, Section, Toolbar } from "./surface";

export { CollapsibleSection } from "./collapsible";

export { DetailItem, Metric, MetricRow, StatTile } from "./metric";

export { Tabs, type TabItem } from "./tabs";

export {
  CellStack,
  DataTable,
  useStickyGroupTop,
  type Column,
} from "./table";

export { Modal, ModalActions } from "./modal";

export { RowMenu, type RowMenuItem } from "./row-menu";

export {
  Checkbox,
  Field,
  FieldGrid,
  MoneyInput,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  Toggle,
} from "./form";

export { PasswordInput } from "./password-input";

export { Badge, Money, StatusBadge, formatMoney } from "./display";
