import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, DateField, ErrorState, Input, Screen, Select, SkeletonList, Text, useToast } from '@/design';
import {
  buildDocumentPayload,
  documentFormFromDetail,
  emptyDocumentForm,
  type DocumentFormState,
  validateDocumentForm,
} from '@/features/documents/document-form';
import {
  useCreateDocument,
  useDocumentCatalog,
  useDocumentDetail,
  useUpdateDocument,
} from '@/features/documents/use-documents';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';

const languageOptions = [
  { label: 'ภาษาไทย', value: 'TH' },
  { label: 'ภาษาอังกฤษ', value: 'EN' },
  { label: 'ไทยและอังกฤษ', value: 'TH_EN' },
];

const salaryOptions = [
  { label: 'เงินเดือนเท่านั้น', value: 'MONTHLY_ONLY' },
  { label: 'เงินเดือนและค่าตอบแทน', value: 'MONTHLY_AND_ALLOWANCE' },
  { label: 'กำหนดเอง', value: 'CUSTOM' },
];

export default function DocumentFormScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const editing = Boolean(id);
  const detail = useDocumentDetail(id);
  const catalog = useDocumentCatalog();
  const create = useCreateDocument();
  const update = useUpdateDocument();
  const [form, setForm] = useState<DocumentFormState>(() => emptyDocumentForm());
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  /*
   * เติมฟอร์มจากฉบับร่างที่โหลดมา — ปรับ state ระหว่าง render ไม่ใช้ effect
   * เพื่อไม่ให้ผู้ใช้เห็นฟอร์มเปล่าแวบหนึ่งก่อนค่าจริงจะเด้งเข้ามาทับ
   * `hydratedId` กันไม่ให้เขียนทับสิ่งที่ผู้ใช้พิมพ์ไปแล้วเมื่อ query refetch
   */
  if (editing && detail.data && hydratedId !== detail.data.id) {
    setForm(documentFormFromDetail(detail.data));
    setHydratedId(detail.data.id);
  }

  const selectedType = useMemo(
    () => catalog.data?.items.find((item) => item.id === form.documentTypeId) ?? null,
    [catalog.data?.items, form.documentTypeId],
  );
  const typeOptions = (catalog.data?.items ?? []).map((item) => ({
    description: item.description ?? undefined,
    label: item.nameTh,
    value: item.id,
  }));
  const busy = create.isPending || update.isPending;

  function set<K extends keyof DocumentFormState>(key: K, value: DocumentFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(submit: boolean) {
    if (!selectedType) {
      toast.warn('กรุณาเลือกประเภทเอกสาร');
      return;
    }

    const validation = validateDocumentForm(form, selectedType);
    if (validation) {
      toast.warn(validation);
      return;
    }

    const payload = buildDocumentPayload(form, selectedType, submit);

    try {
      const saved = editing
        ? await update.mutateAsync({
            id,
            body: {
              documentTypeId: payload.documentTypeId,
              note: payload.note,
              purpose: payload.purpose,
              requestData: payload.requestData,
              title: payload.title,
            },
          })
        : await create.mutateAsync(payload);

      toast.success(submit && !editing ? 'ส่งคำร้องเอกสารแล้ว' : 'บันทึกคำร้องเรียบร้อย');
      router.replace({ pathname: '/document/[id]', params: { id: saved.id } });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'บันทึกคำร้องไม่สำเร็จ');
    }
  }

  if ((editing && detail.isPending) || catalog.isPending) {
    return (
      <Screen scroll>
        <SkeletonList rows={5} />
      </Screen>
    );
  }

  if ((editing && detail.isError) || catalog.isError) {
    const error = detail.error ?? catalog.error;
    return (
      <Screen scroll>
        <ErrorState
          description={error instanceof ApiError ? error.message : undefined}
          onRetry={() => void (editing ? detail.refetch() : catalog.refetch())}
          title="ยังเปิดแบบฟอร์มไม่ได้"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg }}>
        <View>
          <Text variant="h1">{editing ? 'แก้ไขคำร้องเอกสาร' : 'ยื่นคำร้องเอกสาร'}</Text>
          <Text tone="muted">ข้อมูลที่กรอกจะใช้ workflow เดียวกับระบบเว็บ</Text>
        </View>

        <Card title="ประเภทเอกสาร">
          <Select
            disabled={editing}
            label="ประเภทเอกสาร"
            onChange={(value) => {
              const nextType = catalog.data?.items.find((item) => item.id === value);
              setForm((current) => ({
                ...current,
                documentTypeId: value,
                language: nextType?.code === 'VISA_CERTIFICATE' ? 'TH_EN' : 'TH',
              }));
            }}
            options={typeOptions}
            required
            value={form.documentTypeId}
          />
        </Card>

        {selectedType ? (
          <Card title="รายละเอียดคำร้อง">
            <View style={{ gap: theme.spacing.md }}>
              <Input
                label="วัตถุประสงค์"
                multiline
                onChangeText={(value) => set('purpose', value)}
                placeholder="ระบุวัตถุประสงค์การขอเอกสาร"
                value={form.purpose}
              />

              {['WORK_CERTIFICATE', 'SALARY_CERTIFICATE'].includes(selectedType.code) ? (
                <>
                  <Input
                    label="เรียน / ใช้ยื่นต่อ"
                    onChangeText={(value) => set('issueTo', value)}
                    placeholder="เช่น ธนาคาร หรือหน่วยงาน"
                    value={form.issueTo}
                  />
                  <Select
                    label="ภาษา"
                    onChange={(value) => set('language', value as DocumentFormState['language'])}
                    options={languageOptions}
                    value={form.language}
                  />
                </>
              ) : null}

              {selectedType.code === 'SALARY_CERTIFICATE' ? (
                <Select
                  label="ข้อมูลรายได้ที่แสดง"
                  onChange={(value) => set('salaryDisplayMode', value as DocumentFormState['salaryDisplayMode'])}
                  options={salaryOptions}
                  value={form.salaryDisplayMode}
                />
              ) : null}

              {selectedType.code === 'VISA_CERTIFICATE' ? (
                <>
                  <Input label="สถานทูต" onChangeText={(value) => set('embassyName', value)} value={form.embassyName} />
                  <Input label="ประเทศ" onChangeText={(value) => set('country', value)} required value={form.country} />
                  <DateField label="วันเดินทางตั้งแต่" maximumDate={form.travelDateTo ?? undefined} onChange={(value) => set('travelDateFrom', value)} value={form.travelDateFrom} />
                  <DateField label="ถึงวันที่" minimumDate={form.travelDateFrom ?? undefined} onChange={(value) => set('travelDateTo', value)} value={form.travelDateTo} />
                  <Select label="ภาษา" onChange={(value) => set('language', value as DocumentFormState['language'])} options={languageOptions} value={form.language} />
                </>
              ) : null}

              {selectedType.code === 'RESIGN_DOCUMENT' ? (
                <>
                  <DateField label="วันที่มีผลลาออก" onChange={(value) => set('effectiveDate', value)} required value={form.effectiveDate} />
                  <Input label="เหตุผลการลาออก" multiline onChangeText={(value) => set('reason', value)} required value={form.reason} />
                  <Input label="หมายเหตุการส่งมอบงาน" multiline onChangeText={(value) => set('handoverNote', value)} value={form.handoverNote} />
                  <Input label="หมายเหตุการคืนทรัพย์สิน" multiline onChangeText={(value) => set('assetReturnNote', value)} value={form.assetReturnNote} />
                </>
              ) : null}

              <Input label="หมายเหตุเพิ่มเติม" multiline onChangeText={(value) => set('note', value)} value={form.note} />
            </View>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.xs }}>
          {!editing ? (
            <Button loading={busy} onPress={() => void save(false)} title="บันทึกฉบับร่าง" variant="secondary" />
          ) : null}
          <Button loading={busy} onPress={() => void save(!editing)} title={editing ? 'บันทึกการแก้ไข' : 'ส่งคำร้อง'} />
        </View>
      </View>
    </Screen>
  );
}
