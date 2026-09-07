import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';

import {
  bindInProcessProcessor,
  registerQueue,
} from '../../common/queue/queue.module';

import { PrismaModule } from '../../database/prisma.module';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsQueueService } from './reports-queue.service';
import { ReportsProcessor } from './reports.processor';
import { ReportStatisticsService } from './services/report-statistics.service';
import { REPORTS_QUEUE } from './reports-queue.constants';

@Module({
  imports: [
    PrismaModule,
    registerQueue(REPORTS_QUEUE),
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsQueueService,
    ReportsProcessor,
    ReportStatisticsService,
  ],
  exports: [ReportsService, ReportsQueueService],
})
export class ReportsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportsModule.name);

  constructor(private readonly processor: ReportsProcessor) {}

  onApplicationBootstrap() {
    bindInProcessProcessor(REPORTS_QUEUE, this.processor, this.logger);
  }
}