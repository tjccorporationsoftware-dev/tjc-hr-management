export type TrashGroupSummary = {
  group: string;
  label: string;
  count: number;
};

export type TrashTypeSummary = {
  type: string;
  label: string;
  group: string;
  groupLabel: string;
  model: string;
  count: number;
};

export type TrashCatalogItem = {
  type: string;
  label: string;
  group: string;
  groupLabel: string;
  model: string;
};

export type TrashSummary = {
  total: number;
  groups: TrashGroupSummary[];
  types: TrashTypeSummary[];
  catalog: TrashCatalogItem[];
};

export type TrashItem = {
  id: string;
  type: string;
  model: string;
  group: string;
  typeLabel: string;
  title: string;
  subtitle?: string | null;
  code?: string | null;
  status?: string | null;
  deletedAt: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  meta: Record<string, unknown>;
};

export type TrashListParams = {
  q?: string;
  type?: string;
  group?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type TrashListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type TrashListResponse = {
  data: TrashItem[];
  meta?: TrashListMeta;
  summary?: TrashSummary;
};

export type TrashActionResponse = {
  message: string;
  item?: TrashItem;
};
