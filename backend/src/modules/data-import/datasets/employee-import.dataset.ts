import { Injectable } from '@nestjs/common';

import {
  DataImportType,
  EmployeeStatus,
  Gender,
  SalaryBasis,
  WorkHistoryType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  parseImportDate,
  parseImportNumber,
  splitCodeAndName,
  splitFullName,
  stripTrailingNickname,
} from '../utils/data-import-value.util';
import { readCell } from '../utils/data-import-mapping.util';
import type {
  DataImportCommitParams,
  DataImportDataset,
  DataImportFieldDef,
  DataImportPreparedRow,
  DataImportPrepareParams,
} from './data-import-dataset.types';

type MasterOption = { id: string; name: string; code?: string | null };

type EmployeeImportPayload = {
  employeeId: string | null;
  employeeCode: string;
  title: string | null;
  firstName: string;
  lastName: string;
  nickname: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  positionId: string | null;
  branchId: string | null;
  departmentId: string | null;
  divisionId: string | null;
  employeeTypeId: string | null;
  status: EmployeeStatus;
  startDate: string;
  probationPassedAt: string | null;
  employmentEndDate: string | null;
  profile: {
    gender: Gender | null;
    birthDate: string | null;
    nationalId: string | null;
    nationality: string | null;
    firstNameEn: string | null;
    lastNameEn: string | null;
    currentAddress: string | null;
    registeredAddress: string | null;
    contractEndDate: string | null;
    bankName: string | null;
    bankAccountNo: string | null;
    socialSecurityNo: string | null;
    taxId: string | null;
  };
  baseSalary: number | null;
  salaryBasis: SalaryBasis;
};

const FIELDS: DataImportFieldDef[] = [
  {
    key: 'employeeCode',
    label: 'รหัสพนักงาน',
    required: true,
    type: 'TEXT',
    aliases: [
      'รหัสพนักงาน',
      'รหัสประจำตัวพนักงาน',
      'employee code',
      'employee id',
    ],
    hint: 'ใช้เทียบกับพนักงานเดิมในระบบ',
  },
  {
    key: 'fullName',
    label: 'ชื่อ-นามสกุล',
    required: true,
    type: 'TEXT',
    aliases: [
      'ชื่อ-นามสกุล',
      'ชื่อ - นามสกุล',
      'ชื่อ-สกุล',
      'ชื่อสกุล',
      'full name',
    ],
    hint: 'คำสุดท้ายถือเป็นนามสกุล',
  },
  {
    key: 'startDate',
    label: 'วันที่เริ่มงาน',
    required: true,
    type: 'DATE',
    aliases: ['วันที่เริ่มงาน', 'วันเริ่มงาน', 'วันที่เข้างาน', 'start date'],
  },
  {
    key: 'title',
    label: 'คำนำหน้าชื่อ',
    type: 'TEXT',
    aliases: ['คำนำหน้าชื่อ', 'คำนำหน้า'],
  },
  { key: 'nickname', label: 'ชื่อเล่น', type: 'TEXT', aliases: ['ชื่อเล่น'] },
  {
    key: 'fullNameEn',
    label: 'ชื่อ-นามสกุล (EN)',
    type: 'TEXT',
    aliases: ['ชื่อ-นามสกุล(EN)', 'ชื่อ-นามสกุลภาษาอังกฤษ', 'full name (en)'],
  },
  {
    key: 'status',
    label: 'สถานะพนักงาน',
    type: 'TEXT',
    aliases: ['สถานะ', 'สถานะพนักงาน', 'status'],
    hint: 'Active / Out / ลาออก / ทดลองงาน',
  },
  {
    key: 'branchName',
    label: 'สำนักงานสาขา',
    type: 'TEXT',
    aliases: ['สำนักงานสาขา', 'สาขา', 'branch'],
  },
  {
    key: 'departmentName',
    label: 'แผนก',
    type: 'TEXT',
    aliases: ['แผนก', 'department'],
  },
  {
    key: 'divisionName',
    label: 'ฝ่ายงาน',
    type: 'TEXT',
    aliases: ['ฝ่ายงาน', 'หน่วยงาน', 'division'],
  },
  {
    key: 'positionName',
    label: 'ตำแหน่ง',
    type: 'TEXT',
    aliases: ['ตำแหน่ง', 'position'],
  },
  {
    key: 'employeeTypeName',
    label: 'ประเภทพนักงาน',
    type: 'TEXT',
    aliases: ['ประเภทพนักงาน', 'กลุ่มพนักงาน', 'employee type'],
  },
  { key: 'gender', label: 'เพศ', type: 'TEXT', aliases: ['เพศ', 'gender'] },
  {
    key: 'nationality',
    label: 'สัญชาติ',
    type: 'TEXT',
    aliases: ['สัญชาติ', 'nationality'],
  },
  {
    key: 'birthDate',
    label: 'วันเกิด',
    type: 'DATE',
    aliases: ['วันเกิด', 'วันเดือนปีเกิด', 'birth date'],
  },
  {
    key: 'nationalId',
    label: 'เลขบัตรประชาชน',
    type: 'TEXT',
    aliases: ['เลขบัตรประชาชน', 'เลขประจำตัวประชาชน', 'บัตรประชาชน'],
  },
  {
    key: 'probationPassedAt',
    label: 'วันที่บรรจุ',
    type: 'DATE',
    aliases: ['วันที่บรรจุ', 'วันบรรจุ', 'วันที่ผ่านทดลองงาน'],
    hint: 'ใช้ตั้งต้นนับอายุงานของสิทธิ์ลา',
  },
  {
    key: 'contractEndDate',
    label: 'วันที่หมดสัญญาจ้าง',
    type: 'DATE',
    aliases: ['วันที่หมดสัญญาจ้าง', 'วันสิ้นสุดสัญญา', 'วันหมดสัญญา'],
  },
  {
    key: 'resignDate',
    label: 'วันที่ลาออก',
    type: 'DATE',
    aliases: ['วันที่ลาออก', 'วันลาออก', 'วันที่พ้นสภาพ'],
  },
  {
    key: 'registeredAddress',
    label: 'ที่อยู่ตามบัตร',
    type: 'TEXT',
    aliases: ['ที่อยู่ตามบัตร', 'ที่อยู่ตามทะเบียนบ้าน'],
  },
  {
    key: 'currentAddress',
    label: 'ที่อยู่ปัจจุบัน',
    type: 'TEXT',
    aliases: ['ที่อยู่ปัจจุบัน'],
  },
  {
    key: 'email',
    label: 'อีเมล',
    type: 'TEXT',
    aliases: ['อีเมล', 'email', 'e-mail'],
  },
  {
    key: 'phone',
    label: 'เบอร์โทรศัพท์',
    type: 'TEXT',
    aliases: ['เบอร์โทรศัพท์', 'เบอร์โทร', 'โทรศัพท์', 'phone', 'mobile'],
  },
  {
    key: 'baseSalary',
    label: 'เงินเดือน / ค่าจ้าง',
    type: 'NUMBER',
    aliases: ['เงินเดือน', 'อัตราค่าจ้าง', 'ฐานเงินเดือน', 'salary'],
    hint: 'สร้างโครงสร้างค่าจ้างให้เฉพาะพนักงานที่ยังไม่มี',
  },
  {
    key: 'bankName',
    label: 'ธนาคาร',
    type: 'TEXT',
    aliases: ['ธนาคาร', 'ชื่อธนาคาร', 'bank'],
  },
  {
    key: 'bankAccountNo',
    label: 'เลขที่บัญชี',
    type: 'TEXT',
    aliases: ['เลขที่บัญชี', 'เลขบัญชี', 'บัญชีธนาคาร'],
  },
  {
    key: 'socialSecurityNo',
    label: 'เลขประกันสังคม',
    type: 'TEXT',
    aliases: ['เลขประกันสังคม', 'เลขที่ประกันสังคม'],
  },
  {
    key: 'taxId',
    label: 'เลขผู้เสียภาษี',
    type: 'TEXT',
    aliases: ['เลขประจำตัวผู้เสียภาษี', 'เลขผู้เสียภาษี', 'tax id'],
  },
];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s/g, '');
}

function findMaster(options: MasterOption[], rawValue: string) {
  const { code, name } = splitCodeAndName(rawValue);
  const target = normalizeName(name || rawValue);

  if (!target) return null;

  const byCode = code
    ? options.find(
        (option) => normalizeName(option.code ?? '') === normalizeName(code),
      )
    : undefined;

  return (
    byCode ??
    options.find((option) => normalizeName(option.name) === target) ??
    options.find((option) => normalizeName(option.name).includes(target)) ??
    null
  );
}

function toEmployeeStatus(rawValue: string): {
  status: EmployeeStatus | null;
  unknown: boolean;
} {
  const text = rawValue.trim().toLowerCase();

  if (!text) return { status: null, unknown: false };

  if (
    ['active', 'ทำงาน', 'ปกติ', 'ปฏิบัติงาน'].some((word) => text.includes(word))
  ) {
    return { status: EmployeeStatus.ACTIVE, unknown: false };
  }

  if (
    ['out', 'resign', 'ลาออก', 'พ้นสภาพ'].some((word) => text.includes(word))
  ) {
    return { status: EmployeeStatus.RESIGNED, unknown: false };
  }

  if (['probation', 'ทดลองงาน'].some((word) => text.includes(word))) {
    return { status: EmployeeStatus.PROBATION, unknown: false };
  }

  if (['terminate', 'เลิกจ้าง', 'ไล่ออก'].some((word) => text.includes(word))) {
    return { status: EmployeeStatus.TERMINATED, unknown: false };
  }

  return { status: null, unknown: true };
}

/** คืน null เมื่อไฟล์ไม่ได้ระบุ — ค่าว่างต้องไม่ไปทับเพศที่บันทึกไว้แล้ว */
function toGender(rawValue: string): Gender | null {
  const text = rawValue.trim().toLowerCase();

  if (!text) return null;

  if (['ชาย', 'male', 'ผู้ชาย', 'm'].includes(text)) return Gender.MALE;
  if (['หญิง', 'female', 'ผู้หญิง', 'f'].includes(text)) return Gender.FEMALE;

  return Gender.NOT_SPECIFIED;
}

/**
 * ตัดช่องที่ไฟล์ไม่ได้ให้ค่าออกก่อนเขียน
 *
 * ไฟล์รายงานของระบบเดิมมีคอลัมน์ไม่ครบเท่าที่ระบบนี้เก็บ (ไม่มีอีเมล เบอร์โทร เลขบัตร)
 * ถ้าส่ง null ลงไปทั้งชุด การเลือก "อัปเดตทับของเดิม" จะล้างข้อมูลที่ HR กรอกไว้ในระบบทิ้ง
 * ทั้งที่ผู้ใช้ตั้งใจแค่จะอัปเดตค่าที่มีอยู่ในไฟล์
 */
type WithoutNulls<T> = { [K in keyof T]?: Exclude<T[K], null> };

function compact<T extends Record<string, unknown>>(value: T): WithoutNulls<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, fieldValue]) => fieldValue !== null && fieldValue !== undefined,
    ),
  ) as WithoutNulls<T>;
}

/**
 * เดาฐานค่าจ้างจากชื่อประเภทพนักงาน
 *
 * เลข 500 ในช่อง "อัตราค่าจ้าง" อย่างเดียวบอกไม่ได้ว่าเดือนละ 500 หรือวันละ 500
 * ระบบเดิมแยกด้วยประเภทพนักงานเท่านั้น จึงต้องอ่านจากตรงนั้น ถ้าเดาไม่ได้ให้ถือเป็น
 * รายเดือนตามค่าตั้งต้นของระบบ
 */
function toSalaryBasis(employeeTypeName: string): SalaryBasis {
  const text = employeeTypeName.toLowerCase();

  if (text.includes('รายวัน') || text.includes('daily')) {
    return SalaryBasis.DAILY;
  }

  if (text.includes('รายชั่วโมง') || text.includes('hourly')) {
    return SalaryBasis.HOURLY;
  }

  return SalaryBasis.MONTHLY;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDateCell(value: string) {
  const parsed = parseImportDate(value);

  return parsed ? toIsoDate(parsed) : null;
}

/**
 * ทะเบียนพนักงาน
 *
 * ไฟล์ต้นทางคือรายงาน "ทะเบียนพนักงาน (ข้อมูลพื้นฐาน)" ของระบบเดิม ซึ่งมีหัวเรื่อง
 * คร่อมอยู่แถวบน หัวตารางจริงอยู่แถวถัดมา และหนึ่งแถวคือพนักงานหนึ่งคน
 */
@Injectable()
export class EmployeeImportDataset implements DataImportDataset {
  readonly type = DataImportType.EMPLOYEE;
  readonly label = 'ทะเบียนพนักงาน';
  readonly description =
    'นำเข้าข้อมูลพนักงาน เช่น รหัส ชื่อ สังกัด วันที่เริ่มงาน และค่าจ้างตั้งต้น';
  readonly fields = FIELDS;

  constructor(private readonly prisma: PrismaService) {}

  async prepare({
    rows,
    headerRowIndex,
    mapping,
    duplicateMode,
    companyId,
  }: DataImportPrepareParams): Promise<DataImportPreparedRow[]> {
    const dataRows = rows
      .map((row, index) => ({ row, rowNo: index + 1 }))
      .filter(({ rowNo }) => rowNo > headerRowIndex + 1)
      /*
       * แถวที่ไม่มีรหัสพนักงานไม่ใช่ข้อมูล
       *
       * รายงานของระบบเดิมแทรกแถวหัวกลุ่ม (บริษัท / สาขา / แผนก) และแถวว่าง
       * คั่นไว้เป็นระยะ ถ้าไม่กรองออกจะกลายเป็นแถวผิดพลาดเต็มหน้าพรีวิว
       */
      .filter(({ row }) => readCell(row, mapping, 'employeeCode') !== '');

    const codes = Array.from(
      new Set(dataRows.map(({ row }) => readCell(row, mapping, 'employeeCode'))),
    );

    const [
      existing,
      branches,
      departments,
      divisions,
      positions,
      employeeTypes,
    ] = await Promise.all([
      /*
       * ดึงคนที่ถูกลบไปแล้วมาด้วย
       *
       * รหัสพนักงานห้ามซ้ำภายในบริษัทถึงระดับฐานข้อมูล และข้อจำกัดนั้นไม่สนใจ
       * ว่าคนเดิมถูกลบไปแล้วหรือยัง ถ้ากรอง deletedAt ทิ้งตั้งแต่ตอนตรวจ
       * แถวนั้นจะขึ้นว่า "เพิ่มใหม่" แล้วไปพังตอนเขียนจริงด้วยข้อความจาก Prisma
       */
      this.prisma.employee.findMany({
        where: { companyId, employeeCode: { in: codes } },
        select: { id: true, employeeCode: true, deletedAt: true },
      }),
      this.prisma.branch.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, code: true, nameTh: true },
      }),
      this.prisma.department.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, code: true, nameTh: true },
      }),
      this.prisma.division.findMany({
        where: { deletedAt: null, department: { is: { companyId } } },
        select: { id: true, code: true, nameTh: true },
      }),
      this.prisma.position.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, code: true, nameTh: true },
      }),
      this.prisma.employeeType.findMany({
        where: { companyId, deletedAt: null },
        select: { id: true, code: true, nameTh: true },
      }),
    ]);

    const existingByCode = new Map(
      existing.map((employee) => [employee.employeeCode, employee]),
    );

    const toOptions = (
      items: { id: string; code: string; nameTh: string }[],
    ): MasterOption[] =>
      items.map((item) => ({ id: item.id, code: item.code, name: item.nameTh }));

    const branchOptions = toOptions(branches);
    const departmentOptions = toOptions(departments);
    const divisionOptions = toOptions(divisions);
    const positionOptions = toOptions(positions);
    const employeeTypeOptions = toOptions(employeeTypes);

    const seenCodes = new Set<string>();

    return dataRows.map(({ row, rowNo }) => {
      const values: Record<string, string> = {};
      for (const field of FIELDS) {
        values[field.key] = readCell(row, mapping, field.key);
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      const employeeCode = values.employeeCode;
      const { name: fullName, nickname: nicknameFromName } =
        stripTrailingNickname(values.fullName);
      const { firstName, lastName } = splitFullName(fullName);
      const startDate = parseImportDate(values.startDate);

      if (!firstName) errors.push('ไม่มีชื่อพนักงาน');

      if (!startDate) {
        errors.push(
          values.startDate
            ? `วันที่เริ่มงาน "${values.startDate}" อ่านไม่ออก (รองรับ วว/ดด/ปปปป)`
            : 'ไม่มีวันที่เริ่มงาน',
        );
      }

      if (seenCodes.has(employeeCode)) {
        errors.push('รหัสพนักงานนี้ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน');
      }
      seenCodes.add(employeeCode);

      const matched = existingByCode.get(employeeCode) ?? null;

      if (matched?.deletedAt) {
        errors.push(
          'มีพนักงานรหัสนี้อยู่ในถังขยะ กรุณากู้คืนก่อน หรือเปลี่ยนรหัสในไฟล์',
        );
      }

      const current = matched && !matched.deletedAt ? matched : null;

      const resolveMaster = (
        options: MasterOption[],
        rawValue: string,
        label: string,
      ) => {
        if (!rawValue) return null;

        const matched = findMaster(options, rawValue);

        if (!matched) {
          warnings.push(`ไม่พบ${label} "${rawValue}" ในระบบ จะเว้นช่องนี้ไว้`);
          return null;
        }

        return matched.id;
      };

      const branchId = resolveMaster(branchOptions, values.branchName, 'สาขา');
      const departmentId = resolveMaster(
        departmentOptions,
        values.departmentName,
        'แผนก',
      );
      const divisionId = resolveMaster(
        divisionOptions,
        values.divisionName,
        'ฝ่ายงาน',
      );
      const positionMatch = values.positionName
        ? findMaster(positionOptions, values.positionName)
        : null;
      const employeeTypeId = resolveMaster(
        employeeTypeOptions,
        values.employeeTypeName,
        'ประเภทพนักงาน',
      );

      const statusFromFile = toEmployeeStatus(values.status);
      if (statusFromFile.unknown) {
        warnings.push(
          `อ่านสถานะ "${values.status}" ไม่ออก จะใช้สถานะทำงานปกติ`,
        );
      }

      const resignDate = parseImportDate(values.resignDate);
      const status =
        statusFromFile.status ??
        (resignDate ? EmployeeStatus.RESIGNED : EmployeeStatus.ACTIVE);

      const baseSalary = parseImportNumber(values.baseSalary);
      if (baseSalary !== null && baseSalary < 0) {
        errors.push('เงินเดือนติดลบ');
      }

      const birthDate = parseImportDate(values.birthDate);
      if (values.birthDate && !birthDate) {
        warnings.push(`วันเกิด "${values.birthDate}" อ่านไม่ออก จะเว้นไว้`);
      }

      const { firstName: firstNameEn, lastName: lastNameEn } = splitFullName(
        values.fullNameEn,
      );

      const displayName =
        [values.title, fullName].filter(Boolean).join(' ').trim() || fullName;

      const payload: EmployeeImportPayload = {
        employeeId: current?.id ?? null,
        employeeCode,
        title: values.title || null,
        firstName,
        lastName,
        nickname: values.nickname || nicknameFromName,
        displayName,
        email: values.email || null,
        phone: values.phone || null,
        position: positionMatch?.name ?? values.positionName ?? null,
        positionId: positionMatch?.id ?? null,
        branchId,
        departmentId,
        divisionId,
        employeeTypeId,
        status,
        startDate: startDate ? toIsoDate(startDate) : '',
        probationPassedAt: parseIsoDateCell(values.probationPassedAt),
        employmentEndDate: resignDate ? toIsoDate(resignDate) : null,
        profile: {
          gender: toGender(values.gender),
          birthDate: birthDate ? toIsoDate(birthDate) : null,
          nationalId: values.nationalId || null,
          nationality: values.nationality || null,
          firstNameEn: firstNameEn || null,
          lastNameEn: lastNameEn || null,
          currentAddress: values.currentAddress || null,
          registeredAddress: values.registeredAddress || null,
          contractEndDate: parseIsoDateCell(values.contractEndDate),
          bankName: values.bankName || null,
          bankAccountNo: values.bankAccountNo || null,
          socialSecurityNo: values.socialSecurityNo || null,
          taxId: values.taxId || null,
        },
        baseSalary,
        salaryBasis: toSalaryBasis(values.employeeTypeName),
      };

      let action: DataImportPreparedRow['action'] = current
        ? 'UPDATE'
        : 'CREATE';

      if (current && duplicateMode === 'SKIP') action = 'SKIP';

      if (current && duplicateMode === 'ERROR') {
        errors.push('มีพนักงานรหัสนี้อยู่แล้วในระบบ');
      }

      if (errors.length > 0) action = 'ERROR';

      return {
        rowNo,
        key: employeeCode,
        title: displayName || employeeCode,
        action,
        values,
        errors,
        warnings,
        payload,
      };
    });
  }

  async commitRow({ row, companyId, actorId }: DataImportCommitParams) {
    const payload = row.payload as EmployeeImportPayload;

    await this.prisma.$transaction(async (tx) => {
      const profileData = {
        gender: payload.profile.gender,
        birthDate: payload.profile.birthDate
          ? new Date(payload.profile.birthDate)
          : null,
        nationalId: payload.profile.nationalId,
        nationality: payload.profile.nationality,
        firstNameEn: payload.profile.firstNameEn,
        lastNameEn: payload.profile.lastNameEn,
        currentAddress: payload.profile.currentAddress,
        registeredAddress: payload.profile.registeredAddress,
        contractEndDate: payload.profile.contractEndDate
          ? new Date(payload.profile.contractEndDate)
          : null,
        bankName: payload.profile.bankName,
        bankAccountNo: payload.profile.bankAccountNo,
        socialSecurityNo: payload.profile.socialSecurityNo,
        taxId: payload.profile.taxId,
      };

      const employeeData = {
        title: payload.title,
        firstName: payload.firstName,
        lastName: payload.lastName,
        nickname: payload.nickname,
        displayName: payload.displayName,
        email: payload.email,
        phone: payload.phone,
        position: payload.position,
        positionId: payload.positionId,
        branchId: payload.branchId,
        departmentId: payload.departmentId,
        divisionId: payload.divisionId,
        employeeTypeId: payload.employeeTypeId,
        status: payload.status,
        startDate: new Date(payload.startDate),
        probationPassedAt: payload.probationPassedAt
          ? new Date(payload.probationPassedAt)
          : null,
        employmentEndDate: payload.employmentEndDate
          ? new Date(payload.employmentEndDate)
          : null,
      };

      const employeeWrite = compact(employeeData);
      const profileWrite = compact(profileData);

      const employee = payload.employeeId
        ? await tx.employee.update({
            where: { id: payload.employeeId },
            data: {
              ...employeeWrite,
              profile: {
                upsert: {
                  create: { ...profileWrite, companyId },
                  update: profileWrite,
                },
              },
            },
          })
        : await tx.employee.create({
            data: {
              ...employeeWrite,
              employeeCode: payload.employeeCode,
              firstName: payload.firstName,
              lastName: payload.lastName,
              displayName: payload.displayName,
              startDate: new Date(payload.startDate),
              status: payload.status,
              companyId,
              profile: { create: { ...profileWrite, companyId } },
            },
          });

      if (!payload.employeeId) {
        await tx.employeeWorkHistory.create({
          data: {
            employeeId: employee.id,
            type: WorkHistoryType.JOINED,
            effectiveDate: employee.startDate,
            title: 'เริ่มงาน',
            description: 'นำเข้าทะเบียนพนักงานจากไฟล์ Excel',
            newCompanyId: employee.companyId,
            newBranchId: employee.branchId,
            newDepartmentId: employee.departmentId,
            newDivisionId: employee.divisionId,
            newEmployeeTypeId: employee.employeeTypeId,
            newPosition: employee.position,
            newStatus: employee.status,
            createdById: actorId,
          },
        });
      }

      if (payload.baseSalary === null) return;

      /*
       * ค่าจ้างเขียนให้เฉพาะคนที่ยังไม่มีโครงสร้างค่าจ้างเลย
       *
       * ไฟล์รายงานมีแค่ตัวเลขปัจจุบัน ไม่มีวันมีผลและเหตุผลการปรับ ถ้าเขียนทับของเดิม
       * ประวัติการปรับเงินเดือนที่ทำในระบบจะหายไปเงียบ ๆ และงวดที่ปิดไปแล้วจะคำนวณไม่ตรง
       */
      const existingCompensation = await tx.employeeCompensation.findFirst({
        where: { employeeId: employee.id, deletedAt: null },
        select: { id: true },
      });

      if (existingCompensation) return;

      await tx.employeeCompensation.create({
        data: {
          companyId,
          employeeId: employee.id,
          effectiveDate: employee.startDate,
          salaryBasis: payload.salaryBasis,
          baseSalary: payload.baseSalary,
          note: 'สร้างจากการนำเข้าทะเบียนพนักงาน',
          bankName: payload.profile.bankName,
          bankAccountNo: payload.profile.bankAccountNo,
        },
      });
    });
  }
}
