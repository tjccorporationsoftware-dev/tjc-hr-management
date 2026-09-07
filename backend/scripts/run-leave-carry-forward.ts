/**
 * งานปลายปีของระบบลา — สะสมวันลาข้ามปี และตัดวันสะสมที่หมดอายุ
 * -----------------------------------------------------------------------------
 * รันซ้ำได้ ไม่ทำให้ยอดบวม เพราะเช็ค LeaveBalanceLedger ก่อนเขียนทุกครั้ง
 *
 *   npm run leave:carry-forward -- --dry-run
 *   npm run leave:carry-forward -- --from-year=2026
 *   npm run leave:carry-forward -- --expire --year=2026
 *   npm run leave:carry-forward -- --company=<companyId>
 *
 * ไม่ระบุ --from-year จะใช้ปีที่แล้ว / ไม่ระบุ --year จะใช้ปีปัจจุบัน
 * ไม่ระบุ --company จะรันให้ทุกบริษัทที่ยังใช้งานอยู่
 */
import 'dotenv/config';
import { PrismaService } from '../src/database/prisma.service';
import { LeaveBalanceLedgerService } from '../src/modules/leaves/leave-balance-ledger.service';
import { LeaveCarryForwardService } from '../src/modules/leaves/services/leave-carry-forward.service';
import { LeavePolicyResolverService } from '../src/modules/leaves/services/leave-policy-resolver.service';

function readFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readOption(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const service = new LeaveCarryForwardService(
    prisma,
    new LeaveBalanceLedgerService(),
    new LeavePolicyResolverService(prisma),
  );

  const dryRun = readFlag('dry-run');
  const expireMode = readFlag('expire');
  const companyOption = readOption('company');
  const now = new Date();

  const companies = companyOption
    ? await prisma.company.findMany({
        where: { id: companyOption, deletedAt: null },
        select: { id: true, nameTh: true },
      })
    : await prisma.company.findMany({
        where: { deletedAt: null, status: 'ACTIVE' },
        select: { id: true, nameTh: true },
        orderBy: { code: 'asc' },
      });

  if (companies.length === 0) {
    console.log('ไม่พบบริษัทที่ตรงเงื่อนไข');
    await prisma.$disconnect();
    return;
  }

  console.log(
    `โหมด: ${expireMode ? 'ตัดวันสะสมที่หมดอายุ' : 'สะสมวันลาข้ามปี'}${dryRun ? ' (dry run — ยังไม่เขียนข้อมูล)' : ''}`,
  );
  console.log(`บริษัทที่จะรัน: ${companies.length} แห่ง\n`);

  for (const company of companies) {
    if (expireMode) {
      const year = Number(readOption('year') ?? now.getFullYear());
      const summary = await service.runExpiry({
        companyId: company.id,
        year,
        dryRun,
      });

      console.log(
        `${company.nameTh}\n  ปี ${summary.year} | ตรวจ ${summary.scanned} | หมดอายุ ${summary.expired} รายการ รวม ${summary.totalDays} วัน | ยังไม่ถึงกำหนด ${summary.skippedNotDue} | เคยตัดแล้ว ${summary.skippedAlreadyDone}`,
      );
      continue;
    }

    const fromYear = Number(readOption('from-year') ?? now.getFullYear() - 1);
    const summary = await service.runCarryForward({
      companyId: company.id,
      fromYear,
      dryRun,
    });

    console.log(
      `${company.nameTh}\n  ${summary.fromYear} -> ${summary.toYear} | ตรวจ ${summary.scanned} | ยกไป ${summary.carried} รายการ รวม ${summary.totalDays} วัน`,
    );
    console.log(
      `  ข้าม: ไม่มีนโยบาย ${summary.skippedNoPolicy} | ไม่ให้สะสม ${summary.skippedNotAllowed} | ไม่มีวันเหลือ ${summary.skippedNothingLeft} | เคยยกแล้ว ${summary.skippedAlreadyDone}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
