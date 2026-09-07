import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ConfirmDialog,
  ErrorState,
  Icon,
  Input,
  KeyboardAwareScroll,
  SkeletonList,
  Text,
  hitSlop,
  useToast,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PageSection,
  PressableScale,
  ProfileMotif,
  Reveal,
} from '@/design/aurora';
import { useScreenCaptureGuard } from '@/features/auth/screen-privacy';
import { money } from '@/features/payroll/payslip.types';
import { pickProfileAvatar } from '@/features/profile/profile-avatar';
import {
  useDeleteMyAvatar,
  useMyProfile,
  useUpdateMyProfile,
  useUploadMyAvatar,
} from '@/features/profile/use-profile';
import { ApiError } from '@/lib/api/api-error';
import { publicFileUrl } from '@/lib/api/public-url';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';

const EMPLOYEE_STATUS: Record<string, string> = {
  ACTIVE: 'ทำงานอยู่',
  INACTIVE: 'ไม่ใช้งาน',
  PROBATION: 'ทดลองงาน',
  RESIGNED: 'ลาออก',
  SUSPENDED: 'พักงาน',
  TERMINATED: 'สิ้นสุดการจ้าง',
};

/** ป้ายของฐานค่าจ้าง — ใช้เป็นชื่อแถวเลย จะได้รู้ว่าเลขนี้ต่อเดือนหรือต่อวัน */
const SALARY_BASIS_LABEL: Record<string, string> = {
  DAILY: 'ค่าจ้างต่อวัน',
  HOURLY: 'ค่าจ้างต่อชั่วโมง',
  MONTHLY: 'เงินเดือน',
};

const PAYMENT_METHOD: Record<string, string> = {
  BANK_TRANSFER: 'โอนเข้าบัญชีธนาคาร',
  CASH: 'เงินสด',
  CHEQUE: 'เช็ค',
  OTHER: 'อื่น ๆ',
};

const GENDER: Record<string, string> = {
  FEMALE: 'หญิง',
  MALE: 'ชาย',
  NOT_SPECIFIED: 'ไม่ระบุ',
  OTHER: 'อื่น ๆ',
};

const MARITAL: Record<string, string> = {
  DIVORCED: 'หย่า',
  MARRIED: 'สมรส',
  NOT_SPECIFIED: 'ไม่ระบุ',
  SINGLE: 'โสด',
  WIDOWED: 'หม้าย',
};

function dateText(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return thaiDate(date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function text(value: string | null | undefined) {
  return value?.trim() || '—';
}

/**
 * หนึ่งค่าในหมวดข้อมูล — ป้ายซ้าย ค่าขวา คั่นเส้นบาง
 *
 * ผังเดียวกับตารางค่าในจอรายละเอียดคำขอกับจอเงินเดือน จอไหนก็อ่านเหมือนกัน
 */
function DataRow({
  divider = false,
  label,
  value,
}: {
  divider?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 16,
        paddingVertical: 10,
      }}
    >
      <Text
        maxScale={1.2}
        style={{
          color: AURORA.textMuted,
          flex: 1,
          fontSize: 12.5,
          lineHeight: 18,
        }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.2}
        style={{
          color: AURORA.text,
          flex: 1.4,
          fontSize: 13,
          fontWeight: '600',
          lineHeight: 18,
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * หมวดข้อมูลอ่านอย่างเดียว — หัวข้อขีดน้ำเงินแล้วตามด้วยแถวค่า
 *
 * เส้นคั่นถูกใส่ให้จากตรงนี้ (แถวแรกไม่มีเส้น) แทนที่จะให้ทุก call site ต้อง
 * นับเองว่าตัวเองเป็นแถวที่เท่าไร — หมวดหนึ่งมีสิบแถวและมีหลายหมวด
 */
function DataSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <PageSection title={title}>
      <View>
        {Children.toArray(children).map((row, index) =>
          isValidElement<{ divider?: boolean }>(row)
            ? cloneElement(row, { divider: index > 0 })
            : row,
        )}
      </View>
    </PageSection>
  );
}

export default function MyProfileScreen() {
  const { gutter } = useResponsive();
  useScreenCaptureGuard();

  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const profile = useMyProfile();
  const update = useUpdateMyProfile();
  const uploadAvatar = useUploadMyAvatar();
  const deleteAvatar = useDeleteMyAvatar();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [deleteAvatarVisible, setDeleteAvatarVisible] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const auroraStatusBarStyle = useVisibleStatusBarStyle('dark');
  const themeStatusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(auroraStatusBarStyle);

      return () => setStatusBarStyle(themeStatusBarStyle);
    }, [auroraStatusBarStyle, themeStatusBarStyle]),
  );

  const serverDisplayName = profile.data?.user.displayName ?? '';
  const serverPhone = profile.data?.user.phone ?? '';
  const serverAvatarUrl = profile.data?.user.avatarUrl ?? '';
  const serverSnapshot = profile.data
    ? [serverDisplayName, serverPhone, serverAvatarUrl].join('\u0000')
    : null;
  const [syncedSnapshot, setSyncedSnapshot] = useState<string | null>(null);

  if (serverSnapshot !== null && serverSnapshot !== syncedSnapshot) {
    setSyncedSnapshot(serverSnapshot);
    setDisplayName(serverDisplayName);
    setPhone(serverPhone);
    setAvatarFailed(false);
  }

  const avatarSource = avatarFailed
    ? null
    : publicFileUrl(profile.data?.user.avatarUrl ?? null);

  async function handleSave() {
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      toast.warn('กรุณากรอกชื่อที่ใช้แสดง');
      return;
    }

    try {
      await update.mutateAsync({
        displayName: normalizedName,
        phone: phone.trim(),
      });
      toast.success('บันทึกข้อมูลแล้ว');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    }
  }

  async function handleChangeAvatar() {
    try {
      const uri = await pickProfileAvatar();
      if (!uri) return;
      await uploadAvatar.mutateAsync(uri);
      setAvatarFailed(false);
      toast.success('เปลี่ยนรูปโปรไฟล์แล้ว');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'เปลี่ยนรูปโปรไฟล์ไม่สำเร็จ');
    }
  }

  async function handleDeleteAvatar() {
    try {
      await deleteAvatar.mutateAsync();
      setDeleteAvatarVisible(false);
      setAvatarFailed(false);
      toast.success('ลบรูปโปรไฟล์แล้ว');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ลบรูปโปรไฟล์ไม่สำเร็จ');
    }
  }

  const employee = profile.data?.employee;
  const heroName = employee?.displayName || profile.data?.user.displayName || 'ข้อมูลพนักงาน';

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {/* เลื่อนช่องที่กำลังพิมพ์ให้พ้นแป้นพิมพ์ให้เอง */}
        <KeyboardAwareScroll
          contentContainerStyle={{ paddingBottom: 44 }}
          refreshControl={
            <RefreshControl
              onRefresh={() => void profile.refetch()}
              refreshing={profile.isRefetching}
              tintColor={AURORA.textMuted}
            />
          }
        >
          <Reveal>
            <View>
              <PageHero
                decoration={<ProfileMotif />}
                icon="arrow-left"
                iconLabel="ย้อนกลับ"
                onIconPress={() => router.back()}
                subtitle="ข้อมูลส่วนตัวและข้อมูลการทำงานในระบบ HR"
                title="ข้อมูลพนักงาน"
              />
            </View>
          </Reveal>

          {profile.isLoading ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <SkeletonList rows={7} />
            </View>
          ) : null}

          {profile.isError ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <ErrorState
                description={
                  profile.error instanceof ApiError
                    ? profile.error.message
                    : undefined
                }
                onRetry={() => void profile.refetch()}
                retrying={profile.isRefetching}
              />
            </View>
          ) : null}

          {profile.data ? (
            <>
              {/*
                แถบตัวตนแบบกระชับ — รูปเล็กอยู่ซ้าย ข้อความอยู่ขวา สูงรวมราว 90
                ปุ่มกล้อง/ถังขยะเกาะขอบรูปแทนการเป็นปุ่มยาวอีกแถวหนึ่ง เพราะ
                สองอย่างนี้นาน ๆ กดที ไม่ควรกินที่ถาวรเท่ารูปทั้งใบ
              */}
              <Reveal delay={40}>
                <View
                  style={{
                    alignItems: 'center',
                    backgroundColor: AURORA.accentSoft,
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    flexDirection: 'row',
                    gap: 14,
                    paddingHorizontal: gutter,
                    paddingVertical: 14,
                  }}
                >
                  <View>
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: AURORA.baseDeep,
                        borderColor: AURORA.baseDeep,
                        borderRadius: 999,
                        borderWidth: 3,
                        height: 66,
                        justifyContent: 'center',
                        overflow: 'hidden',
                        width: 66,
                      }}
                    >
                      {avatarSource ? (
                        <Image
                          accessibilityLabel="รูปโปรไฟล์"
                          onError={() => setAvatarFailed(true)}
                          source={{ uri: avatarSource }}
                          style={{ height: 66, width: 66 }}
                        />
                      ) : (
                        <Icon color={AURORA.accent} name="user" size={28} />
                      )}
                    </View>

                    <Pressable
                      accessibilityLabel="เปลี่ยนรูปโปรไฟล์"
                      accessibilityRole="button"
                      disabled={uploadAvatar.isPending}
                      hitSlop={hitSlop}
                      onPress={() => void handleChangeAvatar()}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: pressed
                          ? AURORA.accentEnd
                          : AURORA.accent,
                        borderColor: AURORA.baseDeep,
                        borderRadius: 999,
                        borderWidth: 2,
                        bottom: -1,
                        height: 26,
                        justifyContent: 'center',
                        opacity: uploadAvatar.isPending ? 0.6 : 1,
                        position: 'absolute',
                        right: -2,
                        width: 26,
                      })}
                    >
                      {uploadAvatar.isPending ? (
                        <ActivityIndicator
                          color={AURORA.baseDeep}
                          size="small"
                        />
                      ) : (
                        <Icon color={AURORA.baseDeep} name="camera" size={12} />
                      )}
                    </Pressable>

                    {profile.data.user.avatarUrl ? (
                      <Pressable
                        accessibilityLabel="ลบรูปโปรไฟล์"
                        accessibilityRole="button"
                        hitSlop={hitSlop}
                        onPress={() => setDeleteAvatarVisible(true)}
                        style={({ pressed }) => ({
                          alignItems: 'center',
                          backgroundColor: pressed
                            ? 'rgba(225, 29, 72, 0.16)'
                            : AURORA.baseDeep,
                          borderColor: AURORA.baseDeep,
                          borderRadius: 999,
                          borderWidth: 2,
                          bottom: -1,
                          height: 26,
                          justifyContent: 'center',
                          left: -2,
                          position: 'absolute',
                          width: 26,
                        })}
                      >
                        <Icon color={AURORA.rose} name="trash-2" size={12} />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: AURORA.text,
                        fontSize: 16,
                        fontWeight: '800',
                        lineHeight: 22,
                      }}
                    >
                      {heroName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11.5,
                        lineHeight: 16,
                      }}
                    >
                      {employee?.positionName || 'ข้อมูลบัญชีพนักงาน'}
                    </Text>
                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 7,
                      }}
                    >
                      {employee?.employeeCode ? (
                        <View
                          style={{
                            backgroundColor: AURORA.baseDeep,
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              color: AURORA.accent,
                              fontSize: 10.5,
                              fontVariant: ['tabular-nums'],
                              fontWeight: '700',
                              lineHeight: 14,
                            }}
                          >
                            {employee.employeeCode}
                          </Text>
                        </View>
                      ) : null}
                      <Text
                        numberOfLines={1}
                        style={{
                          color: AURORA.textFaint,
                          flex: 1,
                          fontSize: 10.5,
                          lineHeight: 14,
                        }}
                      >
                        {profile.data.user.email}
                      </Text>
                    </View>
                  </View>
                </View>
              </Reveal>

              <View
                style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}
              >
                <Reveal delay={80}>
                  <PageSection title="ข้อมูลที่แก้ไขได้">
                    <View style={{ gap: 13, paddingTop: 2 }}>
                      <Text
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 11.5,
                          lineHeight: 16,
                        }}
                      >
                        ชื่อที่ใช้แสดงและเบอร์โทรศัพท์สำหรับติดต่อ
                        ส่วนที่เหลือแก้ได้ที่ฝ่ายบุคคล
                      </Text>

                      <Input
                        appearance="aurora"
                        icon="person-outline"
                        label="ชื่อที่ใช้แสดง"
                        maxLength={120}
                        onChangeText={setDisplayName}
                        value={displayName}
                      />
                      <Input
                        appearance="aurora"
                        icon="call-outline"
                        keyboardType="phone-pad"
                        label="เบอร์โทรศัพท์"
                        maxLength={30}
                        onChangeText={setPhone}
                        value={phone}
                      />

                      <PressableScale
                        accessibilityRole="button"
                        disabled={update.isPending}
                        onPress={() => void handleSave()}
                        style={{
                          alignItems: 'center',
                          backgroundColor: AURORA.accent,
                          borderRadius: 16,
                          elevation: 3,
                          flexDirection: 'row',
                          gap: 8,
                          justifyContent: 'center',
                          minHeight: 50,
                          opacity: update.isPending ? 0.62 : 1,
                          shadowColor: AURORA.accent,
                          shadowOffset: { height: 4, width: 0 },
                          shadowOpacity: 0.22,
                          shadowRadius: 9,
                        }}
                      >
                        {update.isPending ? (
                          <ActivityIndicator
                            color={AURORA.baseDeep}
                            size="small"
                          />
                        ) : (
                          <Icon
                            color={AURORA.baseDeep}
                            name="check-circle"
                            size={17}
                          />
                        )}
                        <Text
                          style={{
                            color: AURORA.baseDeep,
                            fontSize: 14,
                            fontWeight: '700',
                            lineHeight: 19,
                          }}
                        >
                          บันทึกข้อมูล
                        </Text>
                      </PressableScale>
                    </View>
                  </PageSection>
                </Reveal>

              <Reveal delay={120}>
                {!employee ? (
                  <View style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
                    <Icon color={AURORA.textFaint} name="user" size={30} />
                    <Text style={{ color: AURORA.text }} variant="bodyStrong">
                      ยังไม่มีข้อมูลพนักงาน
                    </Text>
                    <Text
                      style={{ color: AURORA.textMuted, textAlign: 'center' }}
                      variant="caption"
                    >
                      บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 28 }}>
                    <DataSection title="ข้อมูลพนักงาน">
                      <DataRow label="รหัสพนักงาน" value={employee.employeeCode} />
                      <DataRow label="ชื่อ-นามสกุล" value={text(employee.displayName)} />
                      <DataRow label="ชื่อเล่น" value={text(employee.nickname)} />
                      <DataRow label="อีเมลงาน" value={text(employee.email)} />
                      <DataRow label="เบอร์โทรศัพท์" value={text(employee.phone)} />
                      <DataRow
                        label="สถานะ"
                        value={EMPLOYEE_STATUS[employee.status] ?? employee.status}
                      />
                      <DataRow label="วันที่เริ่มงาน" value={dateText(employee.startDate)} />
                      <DataRow
                        label="ครบทดลองงาน"
                        value={dateText(employee.probationEndDate)}
                      />
                      <DataRow
                        label="ผ่านทดลองงาน"
                        value={dateText(employee.probationPassedAt)}
                      />
                      <DataRow
                        label="วันสิ้นสุดการจ้าง"
                        value={dateText(employee.employmentEndDate)}
                      />
                    </DataSection>

                    <DataSection title="สังกัดและการทำงาน">
                      <DataRow label="บริษัท" value={text(employee.company?.nameTh)} />
                      <DataRow label="สาขา" value={text(employee.branch?.nameTh)} />
                      <DataRow label="แผนก" value={text(employee.department?.nameTh)} />
                      <DataRow label="ฝ่าย" value={text(employee.division?.nameTh)} />
                      <DataRow label="ตำแหน่ง" value={text(employee.positionName)} />
                      <DataRow
                        label="ประเภทพนักงาน"
                        value={text(employee.employeeType?.nameTh)}
                      />
                    </DataSection>

                    {profile.data.personal ? (
                      <DataSection title="ข้อมูลส่วนตัวและการติดต่อ">
                        <DataRow
                          label="เพศ"
                          value={
                            GENDER[profile.data.personal.gender] ??
                            profile.data.personal.gender
                          }
                        />
                        <DataRow
                          label="วันเกิด"
                          value={dateText(profile.data.personal.birthDate)}
                        />
                        <DataRow
                          label="สถานภาพ"
                          value={
                            MARITAL[profile.data.personal.maritalStatus] ??
                            profile.data.personal.maritalStatus
                          }
                        />
                        <DataRow
                          label="สัญชาติ"
                          value={text(profile.data.personal.nationality)}
                        />
                        <DataRow
                          label="อีเมลส่วนตัว"
                          value={text(profile.data.personal.personalEmail)}
                        />
                        <DataRow
                          label="เบอร์ต่อ"
                          value={text(profile.data.personal.workPhoneExt)}
                        />
                        <DataRow
                          label="LINE ID"
                          value={text(profile.data.personal.lineId)}
                        />
                        <DataRow
                          label="กรุ๊ปเลือด"
                          value={text(profile.data.personal.bloodType)}
                        />
                        <DataRow
                          label="ที่อยู่ปัจจุบัน"
                          value={text(profile.data.personal.currentAddress)}
                        />
                        <DataRow
                          label="ที่อยู่ตามทะเบียน"
                          value={text(profile.data.personal.registeredAddress)}
                        />
                      </DataSection>
                    ) : null}

                    {profile.data.emergencyContact ? (
                      <DataSection title="ผู้ติดต่อฉุกเฉิน">
                        <DataRow
                          label="ชื่อ"
                          value={text(profile.data.emergencyContact.name)}
                        />
                        <DataRow
                          label="ความสัมพันธ์"
                          value={text(profile.data.emergencyContact.relation)}
                        />
                        <DataRow
                          label="โทรศัพท์"
                          value={text(profile.data.emergencyContact.phone)}
                        />
                        <DataRow
                          label="ที่อยู่"
                          value={text(profile.data.emergencyContact.address)}
                        />
                      </DataSection>
                    ) : null}

                    {profile.data.emergencyContact2?.name ||
                    profile.data.emergencyContact2?.phone ? (
                      <DataSection title="ผู้ติดต่อฉุกเฉิน (สำรอง)">
                        <DataRow
                          label="ชื่อ"
                          value={text(profile.data.emergencyContact2.name)}
                        />
                        <DataRow
                          label="ความสัมพันธ์"
                          value={text(profile.data.emergencyContact2.relation)}
                        />
                        <DataRow
                          label="โทรศัพท์"
                          value={text(profile.data.emergencyContact2.phone)}
                        />
                        <DataRow
                          label="ที่อยู่"
                          value={text(profile.data.emergencyContact2.address)}
                        />
                      </DataSection>
                    ) : null}

                    {profile.data.education ? (
                      <DataSection title="การศึกษา">
                        <DataRow
                          label="ระดับการศึกษา"
                          value={text(profile.data.education.level)}
                        />
                        <DataRow
                          label="สถาบัน"
                          value={text(profile.data.education.institute)}
                        />
                        <DataRow
                          label="สาขาวิชา"
                          value={text(profile.data.education.major)}
                        />
                      </DataSection>
                    ) : null}

                    {profile.data.compensation ? (
                      <DataSection title="ค่าจ้างและการรับเงิน">
                        <DataRow
                          label={
                            SALARY_BASIS_LABEL[
                              profile.data.compensation.salaryBasis
                            ] ?? 'ค่าจ้างฐาน'
                          }
                          value={`${money(profile.data.compensation.baseSalary)} บาท`}
                        />
                        <DataRow
                          label="มีผลตั้งแต่"
                          value={dateText(
                            profile.data.compensation.effectiveDate,
                          )}
                        />
                        <DataRow
                          label="วิธีรับเงิน"
                          value={
                            PAYMENT_METHOD[
                              profile.data.compensation.paymentMethod ?? ''
                            ] ?? text(profile.data.compensation.paymentMethod)
                          }
                        />
                        <DataRow
                          label="ธนาคาร"
                          value={text(
                            profile.data.compensation.bankName ??
                              profile.data.bank?.bankName,
                          )}
                        />
                        <DataRow
                          label="ชื่อบัญชี"
                          value={text(
                            profile.data.compensation.bankAccountName ??
                              profile.data.bank?.accountName,
                          )}
                        />
                        <DataRow
                          label="เลขบัญชี"
                          value={text(
                            profile.data.compensation.bankAccountNo ??
                              profile.data.bank?.accountNumber,
                          )}
                        />
                        <DataRow
                          label="หักประกันสังคม"
                          value={
                            profile.data.compensation.socialSecurityEnabled
                              ? 'หัก'
                              : 'ไม่หัก'
                          }
                        />
                        <DataRow
                          label="หักภาษี ณ ที่จ่าย"
                          value={
                            profile.data.compensation.taxEnabled
                              ? 'หัก'
                              : 'ไม่หัก'
                          }
                        />
                      </DataSection>
                    ) : profile.data.bank ? (
                      <DataSection title="การรับเงินเดือน">
                        <DataRow
                          label="ธนาคาร"
                          value={text(profile.data.bank.bankName)}
                        />
                        <DataRow
                          label="ชื่อบัญชี"
                          value={text(profile.data.bank.accountName)}
                        />
                        <DataRow
                          label="เลขบัญชี"
                          value={text(profile.data.bank.accountNumber)}
                        />
                        <DataRow
                          label="วิธีจ่าย"
                          value={text(profile.data.bank.paymentMethod)}
                        />
                      </DataSection>
                    ) : null}

                    {profile.data.documents.length > 0 ? (
                      <DataSection title="เอกสารพนักงาน">
                        {profile.data.documents.map((document) => (
                          <DataRow
                            key={document.id}
                            label={document.title}
                            value={
                              document.issuedDate
                                ? dateText(document.issuedDate)
                                : dateText(document.createdAt)
                            }
                          />
                        ))}
                      </DataSection>
                    ) : null}
                  </View>
                )}
              </Reveal>
              </View>
            </>
          ) : null}
        </KeyboardAwareScroll>
      </SafeAreaView>

      <ConfirmDialog
        confirmLabel="ลบรูป"
        destructive
        loading={deleteAvatar.isPending}
        message="รูปโปรไฟล์ปัจจุบันจะถูกนำออกจากบัญชีของคุณ"
        onCancel={() => setDeleteAvatarVisible(false)}
        onConfirm={() => void handleDeleteAvatar()}
        title="ลบรูปโปรไฟล์?"
        visible={deleteAvatarVisible}
      />
    </View>
  );
}
