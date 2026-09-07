import { MobileRequestsOrchestrator } from './mobile-requests.orchestrator';

/**
 * ใบคำขอฝั่ง Mobile ต้องเป็น passthrough และต้องเป็น "ของตัวเอง" เสมอ
 *
 * ช่องโหว่ที่ร้ายที่สุดของชั้นนี้คือ employeeId ที่ client ส่งมา
 * DTO ของ service เดิมเปิดช่องไว้ให้ HR ยื่นแทนคนอื่น ถ้าปล่อยผ่าน
 * พนักงานคนไหนก็ยื่นใบลาให้เพื่อนหรือให้หัวหน้าได้ทันที
 */
describe('MobileRequestsOrchestrator', () => {
  const user = { id: 'user-1', scope: { level: 'COMPANY' } };

  function buildOrchestrator(items: Record<string, unknown[]> = {}) {
    const listResult = (type: string) => ({
      items: items[type] ?? [],
      meta: { page: 1, pageSize: 20, total: (items[type] ?? []).length, totalPages: 1 },
    });

    const leaveRequestsService = {
      cancelMy: jest.fn(async () => ({ status: 'CANCELLED' })),
      create: jest.fn(
        async (
          dto: Record<string, unknown>,
          _user: unknown,
          _scope: unknown,
        ) => dto,
      ),
      findMy: jest.fn(async () => listResult('LEAVE')),
      findMyForMobileTimeline: jest.fn(async () => listResult('LEAVE')),
      findMyOne: jest.fn(async () => items.LEAVE?.[0] ?? { status: 'DRAFT' }),
      submitMy: jest.fn(async () => ({ status: 'SUBMITTED' })),
      updateMy: jest.fn(async (_id: string, dto: Record<string, unknown>) => dto),
    };
    const overtimeRequestsService = {
      cancelMy: jest.fn(async () => ({ status: 'CANCELLED' })),
      create: jest.fn(
        async (
          dto: Record<string, unknown>,
          _user: unknown,
          _scope: unknown,
        ) => dto,
      ),
      findMy: jest.fn(async () => listResult('OVERTIME')),
      findMyForMobileTimeline: jest.fn(async () => listResult('OVERTIME')),
      findMyOne: jest.fn(async () => ({ status: 'DRAFT' })),
      submitMy: jest.fn(async () => ({ status: 'SUBMITTED' })),
      updateMy: jest.fn(async (_id: string, dto: Record<string, unknown>) => dto),
    };
    const timeAdjustRequestsService = {
      cancelMy: jest.fn(async () => ({ status: 'CANCELLED' })),
      createMy: jest.fn(async (dto: Record<string, unknown>) => dto),
      findMy: jest.fn(async () => listResult('TIME_ADJUST')),
      findMyForMobileTimeline: jest.fn(async () => listResult('TIME_ADJUST')),
      findMyOne: jest.fn(async () => ({ status: 'DRAFT' })),
      submitMy: jest.fn(async () => ({ status: 'SUBMITTED' })),
      updateMy: jest.fn(async (_id: string, dto: Record<string, unknown>) => dto),
    };
    const offsiteWorkService = {
      cancelMy: jest.fn(async () => ({ status: 'CANCELLED' })),
      create: jest.fn(
        async (
          dto: Record<string, unknown>,
          _user: unknown,
          _scope: unknown,
        ) => dto,
      ),
      findMy: jest.fn(async () => listResult('OFFSITE')),
      deleteMy: jest.fn(async () => ({ deleted: true })),
      findMyOne: jest.fn(async () => ({ status: 'DRAFT' })),
      submitMy: jest.fn(async () => ({ status: 'SUBMITTED' })),
      updateMy: jest.fn(async (_id: string, dto: Record<string, unknown>) => dto),
    };
    const leaveBalancesService = {
      findMy: jest.fn(async () => ({
        items: [
          {
            entitlementDays: '6',
            leaveType: { id: 'lt-1', isPaid: true, nameTh: 'ลาป่วย' },
            pendingDays: '1',
            remainingDays: '4.5',
            usedDays: '0.5',
          },
        ],
        summary: { remainingDays: 4.5 },
      })),
    };

    const orchestrator = new MobileRequestsOrchestrator(
      leaveBalancesService as never,
      leaveRequestsService as never,
      offsiteWorkService as never,
      overtimeRequestsService as never,
      timeAdjustRequestsService as never,
    );

    return {
      leaveBalancesService,
      leaveRequestsService,
      offsiteWorkService,
      orchestrator,
      overtimeRequestsService,
      timeAdjustRequestsService,
    };
  }

  describe('create — กันยื่นแทนคนอื่น', () => {
    it('ต้องตัด employeeId ที่ client ส่งมาทิ้งทุกประเภท', async () => {
      const {
        orchestrator,
        leaveRequestsService,
        overtimeRequestsService,
        timeAdjustRequestsService,
        offsiteWorkService,
      } = buildOrchestrator();

      await orchestrator.create(
        'LEAVE',
        { employeeId: 'victim', reason: 'ป่วย' },
        user,
      );
      await orchestrator.create('OVERTIME', { employeeId: 'victim' }, user);
      await orchestrator.create('TIME_ADJUST', { employeeId: 'victim' }, user);
      await orchestrator.create('OFFSITE', { employeeId: 'victim' }, user);

      expect(leaveRequestsService.create.mock.calls[0]?.[0]).toMatchObject({
        employeeId: undefined,
        reason: 'ป่วย',
      });
      expect(overtimeRequestsService.create.mock.calls[0]?.[0]).toMatchObject({
        employeeId: undefined,
      });
      expect(timeAdjustRequestsService.createMy.mock.calls[0]?.[0]).toMatchObject(
        { employeeId: undefined },
      );
      expect(offsiteWorkService.create.mock.calls[0]?.[0]).toMatchObject({
        employeeId: undefined,
      });
    });

    it('ต้องส่ง scope ของผู้ใช้ต่อไปให้ service เดิมตรวจ ไม่ใช่ scope ที่กว้างกว่า', async () => {
      const { orchestrator, leaveRequestsService } = buildOrchestrator();

      await orchestrator.create('LEAVE', {}, user);

      expect(leaveRequestsService.create.mock.calls[0]?.[2]).toEqual(user.scope);
    });
  });

  describe('list', () => {
    it('กรองตามประเภทเดียว ต้องเรียกเฉพาะ service ของประเภทนั้น', async () => {
      const { orchestrator, leaveRequestsService, overtimeRequestsService } =
        buildOrchestrator();

      await orchestrator.list(user, { type: 'LEAVE' });

      expect(leaveRequestsService.findMy).toHaveBeenCalled();
      expect(overtimeRequestsService.findMy).not.toHaveBeenCalled();
    });

    /* หน้ารวมต้องเรียงตามวันของเรื่อง ไม่ใช่แยกกองตามประเภท */
    it('ไม่ระบุประเภท ต้องรวมทุกประเภทแล้วเรียงวันใหม่ก่อน', async () => {
      const { orchestrator } = buildOrchestrator({
        LEAVE: [
          {
            id: 'leave-1',
            status: 'SUBMITTED',
            startDate: new Date('2026-08-10T00:00:00.000Z'),
            endDate: new Date('2026-08-10T00:00:00.000Z'),
            dayType: 'FULL_DAY',
            totalDays: '1',
            leaveType: { nameTh: 'ลาพักร้อน' },
          },
        ],
        OVERTIME: [
          {
            id: 'ot-1',
            status: 'APPROVED',
            workDate: new Date('2026-08-20T00:00:00.000Z'),
            startTime: new Date('2026-08-20T11:00:00.000Z'),
            endTime: new Date('2026-08-20T13:00:00.000Z'),
            totalHours: '2',
            workType: 'WORKDAY',
          },
        ],
      });

      const result = await orchestrator.list(user, {});

      expect(result.items.map((item) => item.id)).toEqual(['ot-1', 'leave-1']);
      expect(result.items[0]?.type).toBe('OVERTIME');
    });

    it('หน้ารวมต้องส่ง filter ต่อและขอเฉพาะ top window ที่จำเป็น', async () => {
      const { orchestrator, leaveRequestsService } = buildOrchestrator();

      await orchestrator.list(user, {
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        page: 2,
        pageSize: 10,
        search: 'ประชุม',
        status: 'SUBMITTED',
      });

      expect(leaveRequestsService.findMyForMobileTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: '2026-08-01',
          dateTo: '2026-08-31',
          page: 1,
          pageSize: 20,
          search: 'ประชุม',
          status: 'SUBMITTED',
        }),
        user,
      );
    });

    it('ใบที่ยังไม่จบกระบวนการเท่านั้นที่ยกเลิกได้', async () => {
      const { orchestrator } = buildOrchestrator({
        LEAVE: [
          { id: 'a', status: 'SUBMITTED', dayType: 'FULL_DAY' },
          { id: 'b', status: 'APPROVED', dayType: 'FULL_DAY' },
          { id: 'c', status: 'CANCELLED', dayType: 'FULL_DAY' },
          { id: 'd', status: 'REJECTED', dayType: 'FULL_DAY' },
          { id: 'e', status: 'DRAFT', dayType: 'FULL_DAY' },
        ],
      });

      const result = await orchestrator.list(user, { type: 'LEAVE' });

      expect(
        result.items.map((item) => [item.id, item.canCancel]),
      ).toEqual([
        ['a', true],
        ['b', false],
        ['c', false],
        ['d', false],
        ['e', true],
      ]);
    });

    it('หน้ารวมต้อง paginate ข้ามประเภทได้จริง', async () => {
      const { orchestrator } = buildOrchestrator({
        LEAVE: [
          {
            dayType: 'FULL_DAY',
            id: 'leave-1',
            startDate: new Date('2026-08-10T00:00:00.000Z'),
            status: 'SUBMITTED',
          },
        ],
        OVERTIME: [
          {
            id: 'ot-1',
            status: 'SUBMITTED',
            workDate: new Date('2026-08-20T00:00:00.000Z'),
          },
        ],
      });

      const result = await orchestrator.list(user, { page: 2, pageSize: 1 });

      expect(result.items.map((item) => item.id)).toEqual(['leave-1']);
      expect(result.meta).toEqual({
        hasMore: false,
        page: 2,
        pageSize: 1,
        total: 2,
        totalPages: 2,
      });
    });
  });

  describe('detail', () => {
    it('คืนรายละเอียด timeline และไฟล์แนบแบบ normalized', async () => {
      const { orchestrator } = buildOrchestrator({
        LEAVE: [
          {
            approvalSteps: [
              {
                actedBy: { displayName: 'หัวหน้า สมชาย' },
                id: 'step-1',
                nameTh: 'หัวหน้างาน',
                status: 'APPROVED',
                stepNo: 1,
              },
            ],
            attachments: [
              {
                fileName: 'medical.pdf',
                id: 'attachment-1',
                mimeType: 'application/pdf',
              },
            ],
            dayType: 'FULL_DAY',
            id: 'leave-1',
            startDate: new Date('2026-08-20T00:00:00.000Z'),
            status: 'SUBMITTED',
          },
        ],
      });

      const result = await orchestrator.detail('LEAVE', 'leave-1', user);

      expect(result).toMatchObject({
        attachments: [
          expect.objectContaining({
            downloadSupported: true,
            id: 'attachment-1',
          }),
        ],
        timeline: [
          expect.objectContaining({
            actorName: 'หัวหน้า สมชาย',
            status: 'APPROVED',
          }),
        ],
      });
    });
  });

  describe('getLeaveCatalog', () => {
    /* ต้องมาจากสิทธิ์คงเหลือจริง ไม่ใช่รายการประเภทลาทั้งหมดของบริษัท */
    it('คืนประเภทการลาพร้อมวันคงเหลือของผู้ใช้คนนั้น', async () => {
      const { orchestrator } = buildOrchestrator();

      const catalog = await orchestrator.getLeaveCatalog(user);

      expect(catalog.leaveTypes).toEqual([
        expect.objectContaining({
          entitlementDays: 6,
          leaveTypeId: 'lt-1',
          name: 'ลาป่วย',
          pendingDays: 1,
          remainingDays: 4.5,
          usedDays: 0.5,
        }),
      ]);
    });
  });

  describe('draft parity', () => {
    it('แก้ไขต้องใช้ updateMy ของ domain และตัด employeeId จาก payload', async () => {
      const { orchestrator, overtimeRequestsService } = buildOrchestrator();

      await orchestrator.update(
        'OVERTIME',
        'ot-1',
        { employeeId: 'victim', reason: 'แก้เหตุผล' },
        user,
      );

      expect(overtimeRequestsService.updateMy).toHaveBeenCalledWith(
        'ot-1',
        expect.objectContaining({
          employeeId: undefined,
          reason: 'แก้เหตุผล',
        }),
        user,
      );
    });

    it('ห้ามแก้คำขอที่ไม่ใช่ DRAFT แม้ domain บางประเภทจะยอมให้แก้', async () => {
      const { orchestrator, overtimeRequestsService } = buildOrchestrator();
      overtimeRequestsService.findMyOne.mockResolvedValueOnce({
        status: 'SUBMITTED',
      });

      await expect(
        orchestrator.update('OVERTIME', 'ot-1', { reason: 'x' }, user),
      ).rejects.toThrow('ฉบับร่าง');
      expect(overtimeRequestsService.updateMy).not.toHaveBeenCalled();
    });

    it('ส่งร่างต้องใช้ submitMy ของ domain เดิม', async () => {
      const { orchestrator, timeAdjustRequestsService } = buildOrchestrator();

      await orchestrator.submit('TIME_ADJUST', 'ta-1', user);

      expect(timeAdjustRequestsService.submitMy).toHaveBeenCalledWith(
        'ta-1',
        user,
      );
    });

    it('ลบร่างผ่าน Mobile ได้เฉพาะ Offsite และต้องเป็น DRAFT', async () => {
      const { orchestrator, offsiteWorkService } = buildOrchestrator();

      await orchestrator.deleteDraft('OFFSITE', 'os-1', user);
      expect(offsiteWorkService.deleteMy).toHaveBeenCalledWith('os-1', user);

      offsiteWorkService.findMyOne.mockResolvedValueOnce({ status: 'SUBMITTED' });
      await expect(
        orchestrator.deleteDraft('OFFSITE', 'os-2', user),
      ).rejects.toThrow('ฉบับร่าง');
    });
  });

  describe('cancel', () => {
    it('ต้องเรียก cancelMy ซึ่งตรวจความเป็นเจ้าของให้ ไม่ใช่ cancel ตรง ๆ', async () => {
      const { orchestrator, leaveRequestsService } = buildOrchestrator();

      await orchestrator.cancel('LEAVE', 'leave-1', { reason: 'ไม่ไปแล้ว' }, user);

      expect(leaveRequestsService.cancelMy).toHaveBeenCalledWith(
        'leave-1',
        { reason: 'ไม่ไปแล้ว' },
        user,
      );
    });
  });
});
