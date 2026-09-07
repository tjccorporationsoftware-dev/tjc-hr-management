import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardSummaryController } from "./dashboard-summary.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [DashboardController, DashboardSummaryController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}