function toCapabilities(item: any) {
  return {
    canCancel: String(item?.status ?? '') === 'SUBMITTED',
  };
}

export function toMobileComplaintListItem(item: any) {
  return {
    cancelledAt: item?.cancelledAt ?? null,
    category: item?.category ?? null,
    closedAt: item?.closedAt ?? null,
    complaintNo: item?.complaintNo ?? '',
    createdAt: item?.createdAt ?? null,
    handledAt: item?.handledAt ?? null,
    id: item?.id ?? '',
    status: item?.status ?? 'SUBMITTED',
    submittedAt: item?.submittedAt ?? null,
    title: item?.title ?? 'เรื่องร้องเรียน',
    updatedAt: item?.updatedAt ?? null,
  };
}

export function toMobileComplaintDetail(item: any) {
  return {
    ...toMobileComplaintListItem(item),
    capabilities: toCapabilities(item),
    description: item?.description ?? '',
    expectation: item?.expectation ?? null,
    handler: item?.handledBy
      ? {
          displayName: item.handledBy.displayName ?? null,
        }
      : null,
    note: item?.note ?? null,
  };
}
