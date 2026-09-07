/**
 * key กลางของ react-query
 * =======================
 * ทุก query ต้องเอา key จากที่นี่ ห้ามเขียน array ดิบในหน้า เพราะ key คือสิ่งที่
 * ใช้ทั้ง cache และ invalidate ถ้าสะกดไม่ตรงกันระหว่างหน้าที่อ่านกับหน้าที่แก้
 * จะกลายเป็นแก้ข้อมูลแล้วหน้าอื่นไม่อัปเดต ซึ่งเป็นบั๊กที่หายาก
 *
 * โครง key: [โดเมน, ชนิด, พารามิเตอร์]
 * ทำให้ invalidate ได้เป็นชั้น เช่น
 *   queryClient.invalidateQueries({ queryKey: queryKeys.leave.all })
 * จะล้างทั้งรายการและรายละเอียดของโดเมนลาในครั้งเดียว
 */

type Params = Record<string, unknown> | undefined;

export const queryKeys = {
  employees: {
    all: ["employees"] as const,
    list: (params?: Params) => ["employees", "list", params ?? {}] as const,
    detail: (id: string) => ["employees", "detail", id] as const,
    documents: (id: string) => ["employees", "documents", id] as const,
  },

  attendance: {
    all: ["attendance"] as const,
    logs: (params?: Params) => ["attendance", "logs", params ?? {}] as const,
    dailySummaries: (params?: Params) =>
      ["attendance", "daily-summaries", params ?? {}] as const,
    monthlyReview: (params?: Params) =>
      ["attendance", "monthly-review", params ?? {}] as const,
    myToday: () => ["attendance", "my-today"] as const,
    policies: (params?: Params) =>
      ["attendance", "policies", params ?? {}] as const,
    devices: (params?: Params) =>
      ["attendance", "devices", params ?? {}] as const,
    locations: (params?: Params) =>
      ["attendance", "locations", params ?? {}] as const,
  },

  leave: {
    all: ["leave"] as const,
    requests: (params?: Params) => ["leave", "requests", params ?? {}] as const,
    detail: (id: string) => ["leave", "detail", id] as const,
    balances: (params?: Params) => ["leave", "balances", params ?? {}] as const,
    types: (params?: Params) => ["leave", "types", params ?? {}] as const,
    policies: (params?: Params) => ["leave", "policies", params ?? {}] as const,
  },

  overtime: {
    all: ["overtime"] as const,
    requests: (params?: Params) =>
      ["overtime", "requests", params ?? {}] as const,
    detail: (id: string) => ["overtime", "detail", id] as const,
    policies: (params?: Params) =>
      ["overtime", "policies", params ?? {}] as const,
  },

  timeAdjust: {
    all: ["time-adjust"] as const,
    requests: (params?: Params) =>
      ["time-adjust", "requests", params ?? {}] as const,
    detail: (id: string) => ["time-adjust", "detail", id] as const,
  },

  offsite: {
    all: ["offsite"] as const,
    requests: (params?: Params) =>
      ["offsite", "requests", params ?? {}] as const,
    detail: (id: string) => ["offsite", "detail", id] as const,
  },

  approvals: {
    all: ["approvals"] as const,
    pending: (params?: Params) => ["approvals", "pending", params ?? {}] as const,
  },

  documents: {
    all: ["documents"] as const,
    requests: (params?: Params) =>
      ["documents", "requests", params ?? {}] as const,
    detail: (id: string) => ["documents", "detail", id] as const,
    types: (params?: Params) => ["documents", "types", params ?? {}] as const,
    templates: (params?: Params) =>
      ["documents", "templates", params ?? {}] as const,
    complaints: (params?: Params) =>
      ["documents", "complaints", params ?? {}] as const,
  },

  payroll: {
    all: ["payroll"] as const,
    periods: (params?: Params) => ["payroll", "periods", params ?? {}] as const,
    period: (id: string) => ["payroll", "period", id] as const,
    runs: (params?: Params) => ["payroll", "runs", params ?? {}] as const,
    payslips: (params?: Params) =>
      ["payroll", "payslips", params ?? {}] as const,
    compensation: (params?: Params) =>
      ["payroll", "compensation", params ?? {}] as const,
    tax: (params?: Params) => ["payroll", "tax", params ?? {}] as const,
    severanceTiers: (companyId: string) =>
      ["payroll", "severance-tiers", companyId] as const,
  },

  organization: {
    all: ["organization"] as const,
    companies: (params?: Params) =>
      ["organization", "companies", params ?? {}] as const,
    branches: (params?: Params) =>
      ["organization", "branches", params ?? {}] as const,
    departments: (params?: Params) =>
      ["organization", "departments", params ?? {}] as const,
    positions: (params?: Params) =>
      ["organization", "positions", params ?? {}] as const,
    employeeTypes: (params?: Params) =>
      ["organization", "employee-types", params ?? {}] as const,
    structure: (params?: Params) =>
      ["organization", "structure", params ?? {}] as const,
  },

  ess: {
    all: ["ess"] as const,
    summary: () => ["ess", "summary"] as const,
    profile: () => ["ess", "profile"] as const,
    requests: (params?: Params) => ["ess", "requests", params ?? {}] as const,
    schedule: (params?: Params) => ["ess", "schedule", params ?? {}] as const,
    payslips: (params?: Params) => ["ess", "payslips", params ?? {}] as const,
  },

  manager: {
    all: ["manager"] as const,
    dashboard: () => ["manager", "dashboard"] as const,
    team: (params?: Params) => ["manager", "team", params ?? {}] as const,
    section: (name: string, params?: Params) =>
      ["manager", name, params ?? {}] as const,
  },

  dashboard: {
    all: ["dashboard"] as const,
    summary: (params?: Params) =>
      ["dashboard", "summary", params ?? {}] as const,
    hr: () => ["dashboard", "hr"] as const,
    hrPayroll: (year?: number) => ["dashboard", "hr-payroll", year ?? 0] as const,
    executive: () => ["dashboard", "executive"] as const,
  },

  notifications: {
    all: ["notifications"] as const,
    list: (params?: Params) => ["notifications", "list", params ?? {}] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
  },

  users: {
    all: ["users"] as const,
    list: (params?: Params) => ["users", "list", params ?? {}] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },

  accessControl: {
    all: ["access-control"] as const,
    roles: (params?: Params) =>
      ["access-control", "roles", params ?? {}] as const,
    role: (id: string) => ["access-control", "role", id] as const,
    permissions: (params?: Params) =>
      ["access-control", "permissions", params ?? {}] as const,
    permissionGroups: () => ["access-control", "permission-groups"] as const,
  },

  settings: {
    all: ["settings"] as const,
    system: (params?: Params) => ["settings", "system", params ?? {}] as const,
    holidays: (params?: Params) =>
      ["settings", "holidays", params ?? {}] as const,
    approvalWorkflow: (params?: Params) =>
      ["settings", "approval-workflow", params ?? {}] as const,
  },

  onboarding: {
    all: ["onboarding"] as const,
    list: (params?: Params) => ["onboarding", "list", params ?? {}] as const,
  },

  offboarding: {
    all: ["offboarding"] as const,
    list: (params?: Params) => ["offboarding", "list", params ?? {}] as const,
  },

  recruitment: {
    all: ["recruitment"] as const,
    postings: (params?: Params) =>
      ["recruitment", "postings", params ?? {}] as const,
    applications: (params?: Params) =>
      ["recruitment", "applications", params ?? {}] as const,
  },

  performance: {
    all: ["performance"] as const,
    list: (params?: Params) => ["performance", "list", params ?? {}] as const,
  },

  hrReview: {
    all: ["hr-review"] as const,
    items: (params?: Params) => ["hr-review", "items", params ?? {}] as const,
  },

  reports: {
    all: ["reports"] as const,
    list: (params?: Params) => ["reports", "list", params ?? {}] as const,
  },

  /** หน้าห้องผู้บริหาร — แต่ละแท็บโหลดข้อมูลของตัวเองแยกกัน */
  executive: {
    all: ["executive"] as const,
    overview: () => ["executive", "overview"] as const,
    manpower: (params?: Params) =>
      ["executive", "manpower", params ?? {}] as const,
    attendanceToday: (params?: Params) =>
      ["executive", "attendance-today", params ?? {}] as const,
    cost: (params?: Params) => ["executive", "cost", params ?? {}] as const,
  },
} as const;
