import { TenantScope, nextId, requireTenantScope } from "../platform/types";

export interface NotificationMessage {
  id: string;
  tenantId: string;
  entityId?: string;
  recipientEmployeeId?: string;
  messageId: string;
  channel: "IN_APP" | "EMAIL" | "SMS";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "DEAD_LETTER";
  relatedRef?: string;
  mergeFields: Record<string, unknown>;
}

export class NotificationService {
  private readonly messages: NotificationMessage[] = [];

  publish(scope: TenantScope, input: Omit<NotificationMessage, "id" | "tenantId" | "entityId" | "status">): NotificationMessage {
    requireTenantScope(scope);
    const message: NotificationMessage = {
      id: nextId("notification", this.messages.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      status: "PENDING",
      ...input,
      mergeFields: { ...input.mergeFields },
    };
    this.messages.push(message);
    return { ...message, mergeFields: { ...message.mergeFields } };
  }

  list(scope: TenantScope): NotificationMessage[] {
    requireTenantScope(scope);
    return this.messages
      .filter((message) => message.tenantId === scope.tenantId && (!scope.entityId || message.entityId === scope.entityId))
      .map((message) => ({ ...message, mergeFields: { ...message.mergeFields } }));
  }
}
