/**
 * Query key กลางของทั้งแอป (บทที่ 10.5)
 *
 * ห้ามเขียน key เป็น array ดิบ ๆ ตามหน้าจอ ไม่อย่างนั้นตอน invalidate
 * หลัง mutation จะพลาดบางหน้าจอโดยไม่มีใครรู้
 */
export const queryKeys = {
  attendanceHistory: (
    month: string,
    range: string = 'calendar',
    anchorDate?: string,
  ) =>
    ['attendance', 'history', month, range, anchorDate ?? 'none'] as const,
  /** ประวัติเวลาแบบไล่ย้อนงวดต่อเนื่อง (จอประวัติลงเวลา) */
  attendanceHistoryFeed: (anchorDate: string) =>
    ['attendance', 'history-feed', anchorDate] as const,
  bootstrap: ['bootstrap'] as const,
  complaintDetail: (id: string) => ['complaints', 'detail', id] as const,
  complaints: (filters: {
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    status?: string;
  }) =>
    [
      'complaints',
      'list',
      filters.status ?? 'ALL',
      filters.category ?? '',
      filters.search ?? '',
      filters.dateFrom ?? '',
      filters.dateTo ?? '',
    ] as const,
  devices: ['devices'] as const,
  /*
   * ห้องผู้บริหาร — ตัวกรองต้องอยู่ใน key ทุกตัว
   *
   * ผู้บริหารเปลี่ยนตัวกรองไปมาเพื่อเทียบหน่วยงาน ถ้า key ไม่แยก จะเห็น
   * ตัวเลขของสาขาก่อนหน้าค้างอยู่ระหว่างโหลด แล้วอ่านผิดว่าสองสาขาเท่ากัน
   */
  executiveAttendance: (filters: {
    branchId?: string;
    /* วันที่ต้องอยู่ในคีย์ด้วย ไม่งั้นเลื่อนไปดูวันอื่นแล้วได้ข้อมูลวันเดิมจากแคช */
    date?: string;
    departmentId?: string;
    status?: string;
  }) =>
    [
      'executive',
      'attendance-today',
      filters.date ?? 'TODAY',
      filters.branchId ?? 'ALL',
      filters.departmentId ?? 'ALL',
      filters.status ?? 'ALL',
    ] as const,
  /* วันที่อยู่ในคีย์ด้วย ไม่งั้นเลื่อนวันแล้วยังเห็นตัวเลขของวันเดิมค้าง */
  executiveAttendanceTrend: (filters: { branchId?: string; days?: number }) =>
    [
      'executive',
      'attendance-trend',
      filters.branchId ?? 'all',
      filters.days ?? 14,
    ] as const,
  executiveDailyCost: (date?: string) =>
    ['executive', 'daily-cost', date ?? 'today'] as const,
  executiveInsights: ['executive', 'insights'] as const,
  executiveLeaveOtPeriod: (range: { from: string; to: string }) =>
    ['executive', 'leave-ot-period', range.from, range.to] as const,
  executiveManpower: (filters: {
    branchId?: string;
    companyId?: string;
    departmentId?: string;
    employeeTypeId?: string;
    search?: string;
    status?: string;
  }) =>
    [
      'executive',
      'manpower',
      filters.companyId ?? 'ALL',
      filters.branchId ?? 'ALL',
      filters.departmentId ?? 'ALL',
      filters.employeeTypeId ?? 'ALL',
      filters.status ?? 'ALL',
      filters.search ?? '',
    ] as const,
  executivePayroll: (year?: number) =>
    ['executive', 'payroll', year ?? 'current'] as const,
  executiveReportCatalog: ['executive', 'reports', 'catalog'] as const,
  executiveReportJobs: ['executive', 'reports', 'jobs'] as const,
  executiveSummary: ['executive', 'summary'] as const,
  documentCatalog: ['documents', 'catalog'] as const,
  documentDetail: (id: string) => ['documents', 'detail', id] as const,
  documents: (filters: {
    dateFrom?: string;
    dateTo?: string;
    documentTypeId?: string;
    search?: string;
    status?: string;
  }) =>
    [
      'documents',
      'list',
      filters.documentTypeId ?? 'ALL',
      filters.status ?? 'ALL',
      filters.search ?? '',
      filters.dateFrom ?? '',
      filters.dateTo ?? '',
    ] as const,
  /** สวิตช์เปิด/ปิดแจ้งเตือนเข้าเครื่องรายหมวด */
  notificationPushPreferences: ['notifications', 'push-preferences'] as const,
  notifications: (filters: { category?: string; status?: string }) =>
    [
      'notifications',
      'list',
      filters.status ?? 'ALL',
      filters.category ?? 'ALL',
    ] as const,
  profile: ['profile'] as const,
  punchContext: (punchType?: string) =>
    ['attendance', 'punch-context', punchType ?? 'auto'] as const,
  /*
   * จอทีมทุกตัวมีเดือนหรือชุดตัวกรองอยู่ใน key เสมอ
   *
   * เดือนที่เลือกต้องอยู่ใน key ไม่ใช่แค่ส่งไปกับ request — ไม่งั้นหัวหน้าที่
   * สลับกลับไปดูเดือนก่อนจะเห็นตัวเลขของเดือนปัจจุบันค้างอยู่ชั่วครู่
   * แล้วเข้าใจว่าตัวเลขเปลี่ยนเอง
   */
  teamAttendance: (filters: {
    dateFrom?: string;
    dateTo?: string;
    employeeId?: string;
    search?: string;
    status?: string;
  }) =>
    [
      'team',
      'attendance',
      filters.employeeId ?? 'ALL',
      filters.status ?? 'ALL',
      filters.search ?? '',
      filters.dateFrom ?? '',
      filters.dateTo ?? '',
    ] as const,
  teamCalendar: (month?: string) =>
    ['team', 'calendar', month ?? 'current'] as const,
  teamMember: (employeeId: string, month?: string) =>
    ['team', 'member', employeeId, month ?? 'current'] as const,
  teamMembers: (filters: { search?: string; status?: string }) =>
    ['team', 'members', filters.search ?? '', filters.status ?? 'ALL'] as const,
  teamRequests: (filters: {
    dateFrom?: string;
    dateTo?: string;
    employeeId?: string;
    search?: string;
    status?: string;
    type?: string;
  }) =>
    [
      'team',
      'requests',
      filters.type ?? 'ALL',
      filters.employeeId ?? 'ALL',
      filters.status ?? 'ALL',
      filters.search ?? '',
      filters.dateFrom ?? '',
      filters.dateTo ?? '',
    ] as const,
  teamSummary: (params: { date?: string; month?: string }) =>
    ['team', 'summary', params.date ?? 'today', params.month ?? 'current'] as const,
  today: ['attendance', 'today'] as const,
} as const;
