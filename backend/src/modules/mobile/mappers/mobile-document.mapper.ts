const ACTION_LABEL: Record<string, string> = {
  APPROVE: 'อนุมัติ',
  APPROVE_LEVEL_1: 'อนุมัติขั้นที่ 1',
  APPROVE_LEVEL_2: 'อนุมัติขั้นที่ 2',
  CANCEL: 'ยกเลิก / ส่งกลับให้แก้ไข',
  REJECT: 'ไม่อนุมัติ',
  SUBMIT: 'ส่งคำร้อง',
};

function isReturnedForReview(item: any): boolean {
  if (item?.status !== 'DRAFT' || !Array.isArray(item?.approvals)) return false;

  return item.approvals.some(
    (approval: any) =>
      approval?.action === 'CANCEL' &&
      approval?.oldStatus === 'SUBMITTED' &&
      approval?.newStatus === 'DRAFT',
  );
}

function toCapabilities(item: any) {
  const returnedForReview = isReturnedForReview(item);
  const status = String(item?.status ?? '');

  return {
    canCancel: status === 'DRAFT' || status === 'SUBMITTED' || status === 'REJECTED',
    canDelete: status === 'DRAFT',
    canEdit: status === 'DRAFT',
    canSubmit: status === 'DRAFT',
    returnedForReview,
  };
}

export function toMobileDocumentType(item: any) {
  return {
    approvalLevels: Number(item?.approvalLevels ?? 0),
    category: item?.category ?? null,
    code: item?.code ?? '',
    description: item?.description ?? null,
    id: item?.id ?? '',
    nameEn: item?.nameEn ?? null,
    nameTh: item?.nameTh ?? '',
    requiresApproval: Boolean(item?.requiresApproval),
  };
}

export function toMobileDocumentListItem(item: any) {
  const capabilities = toCapabilities(item);

  return {
    approvedAt: item?.approvedAt ?? null,
    cancelledAt: item?.cancelledAt ?? null,
    createdAt: item?.createdAt ?? null,
    currentLevel: Number(item?.currentLevel ?? 0),
    documentNo: item?.documentNo ?? null,
    documentType: toMobileDocumentType(item?.documentType ?? {}),
    id: item?.id ?? '',
    issuedAt: item?.issuedAt ?? null,
    purpose: item?.purpose ?? null,
    rejectedAt: item?.rejectedAt ?? null,
    requestNo: item?.requestNo ?? null,
    returnedForReview: capabilities.returnedForReview,
    status: item?.status ?? 'DRAFT',
    submittedAt: item?.submittedAt ?? null,
    title: item?.title ?? 'คำร้องเอกสาร',
    updatedAt: item?.updatedAt ?? null,
  };
}

export function toMobileDocumentDetail(item: any) {
  const capabilities = toCapabilities(item);

  return {
    ...toMobileDocumentListItem(item),
    capabilities,
    files: Array.isArray(item?.files)
      ? item.files.map((file: any) => ({
          createdAt: file?.createdAt ?? null,
          description: file?.description ?? null,
          fileName: file?.fileName ?? null,
          fileSize: file?.fileSize ?? null,
          fileType: file?.fileType ?? 'ATTACHMENT',
          id: file?.id ?? '',
          mimeType: file?.mimeType ?? null,
          title: file?.title ?? file?.fileName ?? 'ไฟล์เอกสาร',
        }))
      : [],
    note: item?.note ?? null,
    requestData:
      item?.requestData && typeof item.requestData === 'object'
        ? item.requestData
        : {},
    timeline: Array.isArray(item?.approvals)
      ? item.approvals.map((approval: any) => ({
          actedAt: approval?.actedAt ?? approval?.createdAt ?? null,
          actorName: approval?.actedBy?.displayName ?? null,
          action: approval?.action ?? '',
          id: approval?.id ?? '',
          level: Number(approval?.level ?? 0),
          note: approval?.note ?? null,
          reason: approval?.reason ?? null,
          status: approval?.newStatus ?? null,
          title: ACTION_LABEL[String(approval?.action ?? '')] ?? String(approval?.action ?? ''),
        }))
      : [],
  };
}
