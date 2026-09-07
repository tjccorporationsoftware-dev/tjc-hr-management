import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import {
  MOBILE_MAINTENANCE_JOB_PURGE_IDEMPOTENCY,
  MOBILE_MAINTENANCE_QUEUE,
} from '../mobile.constants';
import { MobileMaintenanceService } from './mobile-maintenance.service';

@Processor(MOBILE_MAINTENANCE_QUEUE)
export class MobileMaintenanceProcessor extends WorkerHost {
  constructor(private readonly maintenanceService: MobileMaintenanceService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== MOBILE_MAINTENANCE_JOB_PURGE_IDEMPOTENCY) {
      throw new Error(`Unsupported mobile maintenance job: ${job.name}`);
    }

    return this.maintenanceService.purgeExpiredIdempotencyRecords();
  }
}
