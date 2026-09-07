import { z } from 'zod';

const nullableString = z.string().nullable();
const orgSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    nameTh: z.string(),
    nameEn: nullableString,
  })
  .nullable();

export const profileDocumentSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: nullableString,
  fileName: z.string(),
  fileSize: z.number().nullable(),
  mimeType: nullableString,
  issuedDate: nullableString,
  expiredDate: nullableString,
  status: z.string(),
  createdAt: z.string(),
});

export const mobileProfileSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    phone: nullableString,
    avatarUrl: nullableString,
  }),
  employee: z
    .object({
      id: z.string(),
      employeeCode: z.string(),
      title: nullableString,
      firstName: z.string(),
      lastName: z.string(),
      displayName: nullableString,
      nickname: nullableString,
      email: nullableString,
      phone: nullableString,
      positionName: nullableString,
      startDate: z.string(),
      employmentEndDate: nullableString,
      probationEndDate: nullableString,
      probationPassedAt: nullableString,
      status: z.string(),
      company: orgSchema,
      branch: orgSchema,
      department: orgSchema,
      division: orgSchema,
      employeeType: orgSchema,
      supervisor: z
        .object({
          id: z.string(),
          employeeCode: z.string(),
          displayName: nullableString,
          email: nullableString,
          phone: nullableString,
          positionName: nullableString,
        })
        .nullable(),
    })
    .nullable(),
  personal: z
    .object({
      gender: z.string(),
      birthDate: nullableString,
      maritalStatus: z.string(),
      nationality: nullableString,
      currentAddress: nullableString,
      registeredAddress: nullableString,
      personalEmail: nullableString,
      workPhoneExt: nullableString,
      lineId: nullableString,
      bloodType: nullableString,
    })
    .nullable(),
  /*
   * ค่าจ้างที่มีผลอยู่ตอนนี้ — backend รุ่นเก่ายังไม่ส่งมา จึงเป็น nullish
   * ไม่ใช่ nullable เฉย ๆ ไม่งั้นแอปใหม่คู่กับ backend เก่าจะพังทั้งจอ
   */
  compensation: z
    .object({
      baseSalary: z.coerce.number().default(0),
      salaryBasis: z.string(),
      effectiveDate: nullableString,
      paymentMethod: nullableString,
      socialSecurityEnabled: z.boolean().default(true),
      taxEnabled: z.boolean().default(true),
      bankName: nullableString,
      bankAccountNo: nullableString,
      bankAccountName: nullableString,
    })
    .nullish(),
  emergencyContact: z
    .object({
      name: nullableString,
      phone: nullableString,
      relation: nullableString,
      address: nullableString,
    })
    .nullable(),
  emergencyContact2: z
    .object({
      name: nullableString,
      phone: nullableString,
      relation: nullableString,
      address: nullableString,
    })
    .nullish(),
  education: z
    .object({
      level: nullableString,
      institute: nullableString,
      major: nullableString,
    })
    .nullable(),
  bank: z
    .object({
      bankName: nullableString,
      accountName: nullableString,
      accountNumber: nullableString,
      paymentMethod: nullableString,
    })
    .nullable(),
  documents: z.array(profileDocumentSchema),
  capabilities: z.object({
    editSelf: z.boolean(),
    editHrData: z.boolean(),
    changeAvatar: z.boolean(),
  }),
});

export type MobileProfile = z.infer<typeof mobileProfileSchema>;
export type ProfileDocument = z.infer<typeof profileDocumentSchema>;

export interface UpdateMyProfileInput {
  displayName?: string;
  phone?: string;
}
