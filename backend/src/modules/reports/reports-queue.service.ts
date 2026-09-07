import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';

import {
  REPORTS_QUEUE,
  REPORTS_QUEUE_JOB_PROCESS_REPORT,
} from './reports-queue.constants';

export type ReportProcessQueuePayload = {
  reportJobId: string;
  currentUserId?: string | null;
};

@Injectable()
export class ReportsQueueService {
  constructor(
    @InjectQueue(REPORTS_QUEUE)
    private readonly reportsQueue: Queue<ReportProcessQueuePayload>,
  ) {}

  async enqueueProcessReportJob(params: ReportProcessQueuePayload) {
    const queueJob = await this.reportsQueue.add(
      REPORTS_QUEUE_JOB_PROCESS_REPORT,
      {
        reportJobId: params.reportJobId,
        currentUserId: params.currentUserId ?? null,
      },
      {
        jobId: `report-job-${params.reportJobId}`,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 500,
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7,
          count: 500,
        },
      },
    );

    return this.mapQueueJob(queueJob);
  }

  async getQueueJob(queueJobId: string) {
    const queueJob = await this.reportsQueue.getJob(queueJobId);

    if (!queueJob) {
      return null;
    }

    return this.mapQueueJob(queueJob);
  }

  private async mapQueueJob(job: Job<ReportProcessQueuePayload>) {
    const state = await job.getState();

    return {
      id: String(job.id),
      name: job.name,
      state,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason ?? null,
      progress: job.progress,
      timestamp: job.timestamp,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
    };
  }
}