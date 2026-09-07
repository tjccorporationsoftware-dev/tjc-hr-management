import type { DocumentDetail, DocumentSavePayload, DocumentType } from './documents.types';

export type DocumentLanguage = 'TH' | 'EN' | 'TH_EN';
export type SalaryDisplayMode = 'MONTHLY_ONLY' | 'MONTHLY_AND_ALLOWANCE' | 'CUSTOM';

export interface DocumentFormState {
  assetReturnNote: string;
  extraData: Record<string, unknown>;
  country: string;
  documentTypeId: string | null;
  effectiveDate: Date | null;
  embassyName: string;
  handoverNote: string;
  issueTo: string;
  language: DocumentLanguage;
  note: string;
  purpose: string;
  reason: string;
  salaryDisplayMode: SalaryDisplayMode;
  travelDateFrom: Date | null;
  travelDateTo: Date | null;
}

export const emptyDocumentForm = (): DocumentFormState => ({
  assetReturnNote: '',
  extraData: {},
  country: '',
  documentTypeId: null,
  effectiveDate: null,
  embassyName: '',
  handoverNote: '',
  issueTo: '',
  language: 'TH',
  note: '',
  purpose: '',
  reason: '',
  salaryDisplayMode: 'MONTHLY_ONLY',
  travelDateFrom: null,
  travelDateTo: null,
});

const value = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === 'string' ? String(record[key]) : '';

const dateValue = (raw: unknown) => {
  if (typeof raw !== 'string' || !raw) return null;
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function documentFormFromDetail(detail: DocumentDetail): DocumentFormState {
  const data = detail.requestData;
  return {
    assetReturnNote: value(data, 'assetReturnNote'),
    extraData: { ...data },
    country: value(data, 'country'),
    documentTypeId: detail.documentType.id,
    effectiveDate: dateValue(data.effectiveDate),
    embassyName: value(data, 'embassyName'),
    handoverNote: value(data, 'handoverNote'),
    issueTo: value(data, 'issueTo'),
    language: (value(data, 'language') || 'TH') as DocumentLanguage,
    note: detail.note ?? '',
    purpose: detail.purpose ?? '',
    reason: value(data, 'reason'),
    salaryDisplayMode: (value(data, 'salaryDisplayMode') || 'MONTHLY_ONLY') as SalaryDisplayMode,
    travelDateFrom: dateValue(data.travelDateFrom),
    travelDateTo: dateValue(data.travelDateTo),
  };
}

const dateKey = (date: Date | null) => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function buildDocumentPayload(
  state: DocumentFormState,
  type: DocumentType,
  submit: boolean,
): DocumentSavePayload {
  const preset = {
    WORK_CERTIFICATE: { title: 'ขอหนังสือรับรองการทำงาน', purpose: 'ขอหนังสือรับรองการทำงาน' },
    SALARY_CERTIFICATE: { title: 'ขอหนังสือรับรองเงินเดือน', purpose: 'ขอหนังสือรับรองเงินเดือน' },
    VISA_CERTIFICATE: { title: 'ขอหนังสือรับรองเพื่อประกอบการขอวีซ่า', purpose: 'ใช้ประกอบการขอวีซ่า' },
    RESIGN_DOCUMENT: { title: 'ยื่นเอกสารลาออก', purpose: 'ยื่นเอกสารลาออก' },
  }[type.code];
  const requestData: Record<string, unknown> = {
    ...state.extraData,
    documentKind: type.code,
  };

  if (['WORK_CERTIFICATE', 'SALARY_CERTIFICATE'].includes(type.code)) {
    requestData.issueTo = state.issueTo.trim() || null;
    requestData.language = state.language;
  }

  if (type.code === 'SALARY_CERTIFICATE') {
    requestData.salaryDisplayMode = state.salaryDisplayMode;
  }

  if (type.code === 'VISA_CERTIFICATE') {
    requestData.embassyName = state.embassyName.trim() || null;
    requestData.country = state.country.trim() || null;
    requestData.travelDateFrom = dateKey(state.travelDateFrom);
    requestData.travelDateTo = dateKey(state.travelDateTo);
    requestData.language = state.language;
  }

  if (type.code === 'RESIGN_DOCUMENT') {
    requestData.effectiveDate = dateKey(state.effectiveDate);
    requestData.reason = state.reason.trim();
    requestData.handoverNote = state.handoverNote.trim() || null;
    requestData.assetReturnNote = state.assetReturnNote.trim() || null;
  }

  return {
    documentTypeId: type.id,
    note:
      state.note.trim() ||
      (type.code === 'RESIGN_DOCUMENT' ? state.reason.trim() : null),
    purpose: state.purpose.trim() || preset?.purpose || null,
    requestData,
    submit,
    title: preset?.title || type.nameTh,
  };
}

export function validateDocumentForm(state: DocumentFormState, type: DocumentType) {
  if (type.code === 'RESIGN_DOCUMENT') {
    if (!state.effectiveDate) return 'กรุณาเลือกวันที่มีผลลาออก';
    if (!state.reason.trim()) return 'กรุณาระบุเหตุผลการลาออก';
  }
  if (type.code === 'VISA_CERTIFICATE' && !state.country.trim()) {
    return 'กรุณาระบุประเทศที่ใช้ประกอบการขอวีซ่า';
  }
  return null;
}
