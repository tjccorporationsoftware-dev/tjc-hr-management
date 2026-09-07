import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Input, Screen, Text, useToast } from '@/design';
import {
  buildComplaintPayload,
  emptyComplaintForm,
  type ComplaintFormState,
  validateComplaintForm,
} from '@/features/complaints/complaint-form';
import { useCreateComplaint } from '@/features/complaints/use-complaints';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';

export default function ComplaintNewScreen() {
  const router = useRouter();
  const toast = useToast();
  const { theme } = useAppTheme();
  const create = useCreateComplaint();
  const [form, setForm] = useState<ComplaintFormState>(() => emptyComplaintForm());

  function set<K extends keyof ComplaintFormState>(key: K, value: ComplaintFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const validation = validateComplaintForm(form);
    if (validation) {
      toast.warn(validation);
      return;
    }

    try {
      const created = await create.mutateAsync(buildComplaintPayload(form));
      toast.success('ส่งเรื่องร้องเรียนแล้ว');
      router.replace({ pathname: '/complaint/[id]', params: { id: created.id } });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ส่งเรื่องไม่สำเร็จ');
    }
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: 2 }}>
          <Text variant="h1">ส่งเรื่องร้องเรียน</Text>
          <Text tone="muted">
            เรื่องจะถูกส่งเข้าสู่กระบวนการทันที ระบบปัจจุบันยังไม่มีฉบับร่าง
          </Text>
        </View>

        <Card title="รายละเอียดเรื่อง">
          <View style={{ gap: theme.spacing.md }}>
            <Input
              label="หัวข้อ"
              maxLength={200}
              onChangeText={(value) => set('title', value)}
              required
              value={form.title}
            />
            <Input
              label="หมวดหมู่"
              maxLength={100}
              onChangeText={(value) => set('category', value)}
              placeholder="ระบุหมวดหมู่ตามที่เกี่ยวข้อง"
              value={form.category}
            />
            <Input
              label="รายละเอียด"
              multiline
              numberOfLines={5}
              onChangeText={(value) => set('description', value)}
              required
              value={form.description}
            />
            <Input
              label="สิ่งที่ต้องการให้ดำเนินการ"
              multiline
              numberOfLines={3}
              onChangeText={(value) => set('expectation', value)}
              value={form.expectation}
            />
            <Input
              label="หมายเหตุเพิ่มเติม"
              multiline
              numberOfLines={3}
              onChangeText={(value) => set('note', value)}
              value={form.note}
            />
          </View>
        </Card>

        <Button
          loading={create.isPending}
          onPress={() => void submit()}
          title="ส่งเรื่องร้องเรียน"
        />
        <Button
          disabled={create.isPending}
          onPress={() => router.back()}
          title="ยกเลิก"
          variant="secondary"
        />
      </View>
    </Screen>
  );
}
