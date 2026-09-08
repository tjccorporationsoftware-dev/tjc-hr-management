import { Redirect, Stack } from 'expo-router';

import { AppLoading } from '@/components/feedback/app-loading';
import {
  BlockingState,
  UpdateRequiredScreen,
} from '@/components/feedback/bootstrap-gate';
import { logout } from '@/features/auth/auth.service';
import { useAuthStore } from '@/features/auth/auth.store';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { usePushNavigation } from '@/features/notifications/use-push-navigation';
import { usePushRegistration } from '@/features/notifications/use-push-registration';
import { ApiError } from '@/lib/api/api-error';

/**
 * ด่านสุดท้ายก่อนเข้าแอปจริง
 *
 * ลำดับการตัดสินใจตามบทที่ 8.1:
 *   session -> bootstrap -> บังคับอัปเดต -> บัญชีใช้งานไม่ได้ -> เข้าแอป
 */
export default function AppLayout() {
  const hasPin = useAuthStore((state) => state.hasPin);
  const locked = useAuthStore((state) => state.locked);
  const status = useAuthStore((state) => state.status);
  const mustChangePassword = useAuthStore(
    (state) => state.user?.mustChangePassword ?? false,
  );
  const bootstrap = useBootstrap();

  /* ต้องเรียกก่อน early return ทุกอัน — hook ห้ามเรียกแบบมีเงื่อนไข */
  usePushNavigation(bootstrap.data?.featureFlags);
  /*
   * รอให้ผู้ใช้เข้ามาอยู่ในแอปจริง ๆ ก่อนค่อยขอสิทธิ์แจ้งเตือนกับยิง token
   *
   * ไม่ใช่แค่ "มี session แล้ว" — ด่านตั้ง PIN ปลดล็อก และเปลี่ยนรหัสชั่วคราว
   * อยู่ถัดจากนี้ทั้งหมด การเด้งกล่องขอสิทธิ์ทับจอพวกนั้นคือการขัดจังหวะคน
   * ที่กำลังพิมพ์รหัสอยู่ และผู้ใช้ยังไม่ทันเห็นว่าแอปนี้ทำอะไรได้บ้าง
   */
  usePushRegistration(
    status === 'authenticated' &&
      hasPin === true &&
      !locked &&
      !mustChangePassword &&
      bootstrap.isSuccess,
  );

  if (status === 'restoring') {
    return <AppLoading message="กำลังเตรียมพื้นที่ทำงาน..." />;
  }

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  /*
   * ด่าน PIN ต้องอยู่ที่ layout ด้วย ไม่ใช่แค่ที่จอ index
   *
   * เหตุผลสองข้อ: deep link จากการแจ้งเตือนพุ่งเข้าจอในนี้ตรง ๆ โดยไม่ผ่าน index
   * และตอนกลับมาจากพื้นหลังนาน ๆ ผู้ใช้อยู่ในแอปอยู่แล้ว — ต้องมีคนเด้งเขาออกไป
   */
  if (hasPin === null) {
    /* ยังอ่านไม่เสร็จว่ามี PIN ไหม — รอ ห้ามเดาไปทางใดทางหนึ่ง */
    return <AppLoading message="กำลังตรวจสอบการล็อกแอป..." />;
  }

  if (!hasPin) {
    return <Redirect href="/set-pin" />;
  }

  if (locked) {
    return <Redirect href="/unlock" />;
  }

  /*
   * บัญชีที่ HR เพิ่งสร้างยังใช้รหัสชั่วคราวอยู่ ต้องตั้งใหม่ก่อนเข้าแอป
   * ด่านนี้อยู่ก่อน bootstrap เพราะไม่ควรโหลดข้อมูลพนักงานให้บัญชีที่
   * รหัสผ่านยังเป็นของที่ส่งต่อกันมาทางแชท
   */
  if (mustChangePassword) {
    return <Redirect href="/(auth)/change-password" />;
  }

  if (bootstrap.isPending) {
    return <AppLoading message="กำลังโหลดข้อมูลของคุณ..." />;
  }

  if (bootstrap.isError) {
    const error = bootstrap.error;

    // 403/404 = ไม่มีสิทธิ์ ESS หรือบัญชียังไม่ผูกกับพนักงาน — กดลองใหม่ก็ไม่หาย
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <BlockingState
          icon="person-remove-outline"
          message={error.message}
          onSecondaryAction={() => void logout()}
          requestId={error.requestId}
          secondaryLabel="ออกจากระบบ"
          title="ยังใช้งานบัญชีนี้ไม่ได้"
        />
      );
    }

    return (
      <BlockingState
        actionLabel="ลองใหม่อีกครั้ง"
        icon="cloud-offline-outline"
        message={
          error instanceof ApiError
            ? error.message
            : 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        }
        onAction={() => void bootstrap.refetch()}
        onSecondaryAction={() => void logout()}
        requestId={error instanceof ApiError ? error.requestId : null}
        secondaryLabel="ออกจากระบบ"
        title="โหลดข้อมูลไม่สำเร็จ"
      />
    );
  }

  if (bootstrap.data.compatibility.updateRequired) {
    return (
      <UpdateRequiredScreen storeUrl={bootstrap.data.compatibility.storeUrl} />
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
