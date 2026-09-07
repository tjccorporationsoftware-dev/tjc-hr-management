import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import type { FeatureFlags } from '@/features/bootstrap/bootstrap.types';

import { resolveNotificationDestination } from './notification-navigation';
import { loadNotifications } from './push-runtime';

type NotificationResponseLike = {
  notification: {
    request: {
      content: { data?: Record<string, unknown> | null };
      identifier: string;
    };
  };
};

/**
 * แตะ Push → ใช้ resolver เดียวกับ Notification Inbox
 *
 * payload รุ่นใหม่ใช้ entityType + notificationType ส่วน requestType เดิมยังรองรับ
 * หนึ่งช่วง release เพื่อให้ backend ใหม่กับ mobile เก่าคุยกันได้
 */
export function usePushNavigation(featureFlags?: FeatureFlags) {
  const router = useRouter();
  const handledIdentifier = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | null = null;

    const open = (response: NotificationResponseLike | null) => {
      if (!active || !response) return;

      const identifier = response.notification.request.identifier;
      if (handledIdentifier.current === identifier) return;

      const data = response.notification.request.content.data ?? {};
      const destination = resolveNotificationDestination(
        {
          entityId: typeof data.entityId === 'string' ? data.entityId : null,
          entityType:
            typeof data.entityType === 'string' ? data.entityType : null,
          notificationType:
            typeof data.notificationType === 'string'
              ? data.notificationType
              : null,
          requestType:
            typeof data.requestType === 'string' ? data.requestType : null,
        },
        featureFlags,
      );

      handledIdentifier.current = identifier;

      if (destination) {
        router.push(destination as never);
      } else {
        /* entity ที่ยังไม่มี Mobile screen ต้องไม่เดา route — เปิด inbox แทน */
        router.push('/notifications');
      }
    };

    void loadNotifications().then((notifications) => {
      if (!notifications || !active) return;

      void notifications
        .getLastNotificationResponseAsync()
        .then((response) => open(response as NotificationResponseLike | null));

      subscription = notifications.addNotificationResponseReceivedListener(
        (response) => open(response as NotificationResponseLike),
      );
    });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [featureFlags, router]);
}
