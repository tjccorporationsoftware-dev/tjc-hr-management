import { GUARDS_METADATA } from '@nestjs/common/constants';

import { MobileClientGuard } from '../guards/mobile-client.guard';
import { MobileApprovalsController } from './mobile-approvals.controller';
import { MobileComplaintsController } from './mobile-complaints.controller';
import { MobileDocumentsController } from './mobile-documents.controller';
import { MobileRequestAttachmentsController } from './mobile-request-attachments.controller';
import { MobileRequestsController } from './mobile-requests.controller';

type ControllerClass = { prototype: Record<string, unknown> };

function expectMobileGuard(controller: ControllerClass, methods: string[]) {
  for (const method of methods) {
    const handler = controller.prototype[method];
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler as object) ?? [];

    expect(guards).toContain(MobileClientGuard);
  }
}

describe('Mobile mutation security guard regression', () => {
  it('Request mutations ต้องผ่าน MobileClientGuard', () => {
    expectMobileGuard(MobileRequestsController as unknown as ControllerClass, [
      'createLeave',
      'createOffsite',
      'createOvertime',
      'createTimeAdjust',
      'updateLeave',
      'updateOffsite',
      'updateOvertime',
      'updateTimeAdjust',
      'submitLeave',
      'submitOffsite',
      'submitOvertime',
      'submitTimeAdjust',
      'deleteOffsite',
      'cancel',
    ]);
  });

  it('Attachment mutations ต้องผ่าน MobileClientGuard', () => {
    expectMobileGuard(
      MobileRequestAttachmentsController as unknown as ControllerClass,
      [
        'uploadLeaveAttachment',
        'deleteLeaveAttachment',
        'uploadOvertimeAttachment',
        'deleteOvertimeAttachment',
        'uploadTimeAdjustAttachment',
        'deleteTimeAdjustAttachment',
      ],
    );
  });

  it('Approval / Document / Complaint mutations ต้องผ่าน MobileClientGuard', () => {
    expectMobileGuard(MobileApprovalsController as unknown as ControllerClass, [
      'act',
    ]);
    expectMobileGuard(MobileDocumentsController as unknown as ControllerClass, [
      'create',
      'update',
      'submit',
      'cancel',
      'remove',
      'uploadFile',
      'removeFile',
    ]);
    expectMobileGuard(MobileComplaintsController as unknown as ControllerClass, [
      'create',
      'cancel',
    ]);
  });
});
