import { randomUUID } from 'node:crypto';

import type { AuditAction, AuditEvent } from '@smart-shopping/shared';

import type { AdminStore } from './adminStore.js';

/**
 * Append-only audit recording.
 *
 * Every privileged action goes through this function so the field set is identical
 * everywhere: actor, action, target, previous state, new state, reason and the
 * request id that ties the event to the API log.
 *
 * `previousState`/`newState` are built by the caller from an explicit allowlist of
 * fields. Nothing here inspects a document, which is what keeps password hashes,
 * tokens and other secrets out of the trail by construction rather than by review.
 */

export interface AuditInput {
  readonly action: AuditAction;
  readonly actorId: string | null;
  readonly actorEmail: string | null;
  readonly targetType: AuditEvent['targetType'];
  readonly targetId: string | null;
  readonly previousState?: Record<string, unknown>;
  readonly newState?: Record<string, unknown>;
  readonly reason?: string | null;
  readonly requestId?: string | null;
}

export function buildAuditEvent(input: AuditInput, now: Date = new Date()): AuditEvent {
  return {
    id: randomUUID(),
    action: input.action,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    targetType: input.targetType,
    targetId: input.targetId,
    previousState: input.previousState ?? {},
    newState: input.newState ?? {},
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
    occurredAt: now.toISOString(),
  };
}

/**
 * Writes an audit event. A failure to record is logged by the caller's logger and
 * never silently swallowed by returning `false` without a trace - the caller
 * decides whether the operation can continue.
 */
export async function recordAudit(
  store: AdminStore,
  input: AuditInput,
  now: Date = new Date(),
): Promise<AuditEvent> {
  const event = buildAuditEvent(input, now);
  await store.appendAudit(event);
  return event;
}
