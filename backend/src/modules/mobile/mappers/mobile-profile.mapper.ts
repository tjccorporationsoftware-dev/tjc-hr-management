import type { ProfileService } from '../../profile/profile.service';

type Snapshot = Awaited<ReturnType<ProfileService['getMobileProfileSnapshot']>>;

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function personName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const explicit = input.displayName?.trim();
  if (explicit) return explicit;

  return (
    [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || null
  );
}

export function toMobileProfile(snapshot: Snapshot) {
  const employee = snapshot.employee;

  if (!employee) {
    return {
      user: {
        id: snapshot.user.id,
        email: snapshot.user.email,
        displayName: snapshot.user.displayName,
        phone: snapshot.user.phone,
        avatarUrl: snapshot.user.avatarUrl,
      },
      employee: null,
      personal: null,
      compensation: null,
      emergencyContact: null,
      emergencyContact2: null,
      education: null,
      bank: null,
      documents: [],
      capabilities: {
        editSelf: true,
        editHrData: false,
        changeAvatar: true,
      },
    };
  }

  const profile = employee.profile;
  /* backend เก่า/เทสที่ยังไม่ได้ส่ง compensations มาต้องไม่พังทั้งก้อน */
  const compensation = employee.compensations?.[0] ?? null;

  return {
    user: {
      id: snapshot.user.id,
      email: snapshot.user.email,
      displayName: snapshot.user.displayName,
      phone: snapshot.user.phone,
      avatarUrl: snapshot.user.avatarUrl,
    },
    employee: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      title: employee.title,
      firstName: employee.firstName,
      lastName: employee.lastName,
      displayName: personName(employee),
      nickname: employee.nickname,
      email: employee.email,
      phone: employee.phone,
      positionName:
        employee.positionMaster?.nameTh ?? employee.position ?? null,
      startDate: iso(employee.startDate),
      employmentEndDate: iso(employee.employmentEndDate),
      probationEndDate: iso(employee.probationEndDate),
      probationPassedAt: iso(employee.probationPassedAt),
      status: employee.status,
      company: employee.company,
      branch: employee.branch,
      department: employee.department,
      division: employee.division,
      employeeType: employee.employeeType,
      supervisor: employee.supervisor
        ? {
            id: employee.supervisor.id,
            employeeCode: employee.supervisor.employeeCode,
            displayName: personName(employee.supervisor),
            email: employee.supervisor.email,
            phone: employee.supervisor.phone,
            positionName:
              employee.supervisor.positionMaster?.nameTh ??
              employee.supervisor.position ??
              null,
          }
        : null,
    },
    personal: profile
      ? {
          gender: profile.gender,
          birthDate: iso(profile.birthDate),
          maritalStatus: profile.maritalStatus,
          nationality: profile.nationality,
          currentAddress: profile.currentAddress,
          registeredAddress: profile.registeredAddress,
          personalEmail: profile.personalEmail,
          workPhoneExt: profile.workPhoneExt,
          lineId: profile.lineId,
          bloodType: profile.bloodType,
        }
      : null,
    /*
     * ค่าจ้างของตัวเอง — ส่งเฉพาะเรคคอร์ดที่มีผลอยู่ ณ ตอนนี้ และส่งเป็นตัวเลข
     * ธรรมดา (Decimal ของ Prisma กลายเป็น object ตอน JSON.stringify)
     */
    compensation: compensation
      ? {
          baseSalary: Number(compensation.baseSalary),
          salaryBasis: compensation.salaryBasis,
          effectiveDate: iso(compensation.effectiveDate),
          paymentMethod: compensation.paymentMethod,
          socialSecurityEnabled: compensation.socialSecurityEnabled,
          taxEnabled: compensation.taxEnabled,
          bankName: compensation.bankName,
          bankAccountNo: compensation.bankAccountNo,
          bankAccountName: compensation.bankAccountName,
        }
      : null,
    emergencyContact: profile
      ? {
          name: profile.emergencyContactName,
          phone: profile.emergencyContactPhone,
          relation: profile.emergencyContactRelation,
          address: profile.emergencyContactAddress,
        }
      : null,
    emergencyContact2: profile
      ? {
          name: profile.emergencyContactName2,
          phone: profile.emergencyContactPhone2,
          relation: profile.emergencyContactRelation2,
          address: profile.emergencyContactAddress2,
        }
      : null,
    education: profile
      ? {
          level: profile.educationLevel,
          institute: profile.educationInstitute,
          major: profile.educationMajor,
        }
      : null,
    bank: profile
      ? {
          bankName: profile.bankName,
          accountName: profile.bankAccountName,
          accountNumber: profile.bankAccountNo,
          paymentMethod: profile.payrollPaymentMethod,
        }
      : null,
    documents: employee.documents.map((document) => ({
      id: document.id,
      type: document.type,
      title: document.title,
      description: document.description,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      issuedDate: iso(document.issuedDate),
      expiredDate: iso(document.expiredDate),
      status: document.status,
      createdAt: iso(document.createdAt),
    })),
    capabilities: {
      editSelf: true,
      editHrData: false,
      changeAvatar: true,
    },
  };
}
