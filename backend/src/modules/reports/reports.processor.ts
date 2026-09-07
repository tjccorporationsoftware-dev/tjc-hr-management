import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { ReportsService } from './reports.service';
import {
  REPORTS_QUEUE,
  REPORTS_QUEUE_JOB_PROCESS_REPORT,
} from './reports-queue.constants';
import type { ReportProcessQueuePayload } from './reports-queue.service';

@Processor(REPORTS_QUEUE)
export class ReportsProcessor extends WorkerHost {
  constructor(private readonly reportsService: ReportsService) {
    super();
  }

  async process(job: Job<ReportProcessQueuePayload>) {
    if (job.name !== REPORTS_QUEUE_JOB_PROCESS_REPORT) {
      throw new Error(`Unsupported report queue job: ${job.name}`);
    }

    await job.updateProgress(10);

    const result = await this.reportsService.processJob(
      job.data.reportJobId,
      job.data.currentUserId ?? undefined,
    );

    await job.updateProgress(100);

    return {
      reportJobId: job.data.reportJobId,
      completedAt: new Date().toISOString(),
      result,
    };
  }
}