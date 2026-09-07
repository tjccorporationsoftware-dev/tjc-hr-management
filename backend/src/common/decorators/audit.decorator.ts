import { SetMetadata } from "@nestjs/common";
import type { AuditAction } from "../../generated/prisma/client";

export const AUDIT_METADATA_KEY = "audit:options";

export type AuditOptions = {
  action: AuditAction;
  entity: string;
  description?: string;
};

export const Audit = (options: AuditOptions) =>
  SetMetadata(AUDIT_METADATA_KEY, options);