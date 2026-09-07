"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("./src/generated/prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const settings = await prisma.companyPayrollSetting.findMany({
        select: { companyId: true, payrollCutoffDay: true, payrollPeriodStartDay: true },
    });
    console.log('settings:', JSON.stringify(settings));
    const periods = await prisma.payrollPeriod.findMany({
        orderBy: { startDate: 'desc' },
        select: { name: true, startDate: true, endDate: true },
        take: 3,
    });
    console.log('periods:', JSON.stringify(periods));
}
main().finally(() => prisma.$disconnect());
//# sourceMappingURL=cutoff-check.js.map