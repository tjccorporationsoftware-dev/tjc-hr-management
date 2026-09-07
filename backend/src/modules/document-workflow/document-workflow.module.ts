import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { DocumentWorkflowController } from './document-workflow.controller';
import { DocumentWorkflowService } from './document-workflow.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [DocumentWorkflowController],
  providers: [DocumentWorkflowService],
  exports: [DocumentWorkflowService],
})
export class DocumentWorkflowModule {}