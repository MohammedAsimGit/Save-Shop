import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  AcceptMatchRequest,
  DeferMatchRequest,
  ListingDetailResponse,
  ReviewDecisionType,
  ReviewQueueItem,
} from '@smart-shopping/shared';

import { ApiError } from '../../lib/apiClient';
import type { AdminDecisionAction, AdminDecisionBody } from '../../services/admin.service';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { SkeletonBlock } from '../ui/LoadingSkeleton';
import { decisionTone, formatTimestamp, strengthLabel, verdictTone } from './adminPresentation';

/**
 * Listing detail and the human decision surface.
 *
 * Every action opens a confirmation dialog that shows the exact target product and
 * any conflicting identity facts. Nothing is sent until the administrator confirms,
 * and the API re-checks the listing revision so a stale page cannot overwrite a
 * colleague's decision.
 */

const ACTION_LABEL: Record<AdminDecisionAction, string> = {
  accept: 'Accept selected match',
  reassign: 'Assign to selected product',
  reject: 'Reject selected candidate',
  defer: 'Leave unresolved',
  reopen: 'Reopen for automatic matching',
};

const DECISION_LABEL: Record<ReviewDecisionType, string> = {
  accepted: 'Accepted',
  reassigned: 'Reassigned',
  rejected: 'Rejected',
  deferred: 'Left unresolved',
  reopened: 'Reopened',
};

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return [error.message, ...(error.details ?? [])].join(' ');
  }
  return error instanceof Error ? error.message : 'The decision could not be saved';
}

export function ReviewDetailPanel({
  item,
  detail,
  loading,
  error,
  onRetry,
  onDecision,
}: {
  readonly item: ReviewQueueItem | null;
  readonly detail: ListingDetailResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
  readonly onDecision: (action: AdminDecisionAction, body: AdminDecisionBody) => Promise<void>;
}) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [dialog, setDialog] = useState<AdminDecisionAction | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmConflicts, setConfirmConflicts] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const listingId = item?.listing.id ?? null;
  const revision = item?.listing.revision ?? 0;

  useEffect(() => {
    setSelectedProductId(item?.listing.canonicalProductId ?? item?.candidates[0]?.productId ?? '');
    setDialog(null);
    setDialogError(null);
  }, [listingId, revision, item]);

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-3 rounded-card border border-line bg-surface p-5">
        <SkeletonBlock className="h-5 w-2/3" />
        <SkeletonBlock className="h-3 w-1/2" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-card border border-danger/30 bg-danger/5 p-5">
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="rounded-card border border-dashed border-line-strong/70 bg-surface-muted/50 p-8 text-center">
        <p className="text-sm font-semibold text-ink">Select a listing</p>
        <p className="mt-1 text-sm text-ink-muted">
          Choose a row from the queue to see its identity facts, candidates and decision history.
        </p>
      </div>
    );
  }

  const listing = item.listing;
  const selectedCandidate = item.candidates.find(
    (candidate) => candidate.productId === selectedProductId,
  );
  const needsTarget = dialog === 'accept' || dialog === 'reassign';
  const canSubmit =
    !submitting &&
    reason.trim().length >= 3 &&
    (!needsTarget || selectedProductId !== '') &&
    (!needsTarget || !item.conflicts.length || confirmConflicts);

  function openDialog(action: AdminDecisionAction): void {
    setReason('');
    setNotes('');
    setConfirmConflicts(false);
    setDialogError(null);
    setDialog(action);
  }

  async function confirm(): Promise<void> {
    if (!dialog) return;
    setSubmitting(true);
    setDialogError(null);

    const base = {
      expectedRevision: revision,
      reason: reason.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    let body: AdminDecisionBody;
    if (dialog === 'accept' || dialog === 'reassign') {
      body = {
        ...base,
        canonicalProductId: selectedProductId,
        confirmConflicts,
      } satisfies AcceptMatchRequest;
    } else if (dialog === 'reject') {
      body = {
        ...base,
        ...(selectedProductId ? { canonicalProductId: selectedProductId } : {}),
      };
    } else {
      body = base satisfies DeferMatchRequest;
    }

    try {
      await onDecision(dialog, body);
      setDialog(null);
    } catch (caught) {
      setDialogError(describeError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-dark uppercase dark:text-brand">
              Marketplace listing
            </p>
            <h2 className="text-lg font-semibold tracking-tight">{listing.title}</h2>
            <p className="text-xs text-ink-muted">
              {listing.sourceId} · {listing.marketplaceId} ·{' '}
              <span className="font-mono">{listing.externalId}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={verdictTone(listing.match.status)}>{listing.match.status}</Badge>
            <Badge tone="outline">{strengthLabel(listing.match.confidence)}</Badge>
            {listing.isSample && <Badge tone="warning">Sample data</Badge>}
            <Badge tone="neutral">revision {listing.revision}</Badge>
          </div>
        </div>

        <p className="rounded-tile border border-line bg-background-alt px-3 py-2 text-sm text-ink-muted">
          <span className="font-semibold text-ink">Why review is needed: </span>
          {item.reviewRequiredReason}
        </p>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Fact label="Brand" value={listing.brand ?? '—'} />
          <Fact label="Model" value={listing.model ?? '—'} />
          <Fact label="MPN" value={listing.mpn ?? '—'} />
          <Fact label="GTIN" value={listing.gtin ?? '—'} />
          <Fact label="Colour" value={listing.color ?? '—'} />
          <Fact label="Capacity" value={listing.storageCapacity ?? '—'} />
          <Fact label="Match method" value={listing.match.method} />
          <Fact label="Provenance" value={listing.provenance} />
          <Fact label="Last observed" value={formatTimestamp(listing.lastObservedAt)} />
        </dl>

        {Object.keys(listing.specifications).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(listing.specifications).map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted"
              >
                {key}: {value}
              </span>
            ))}
          </div>
        )}

        <a
          href={listing.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block text-sm font-semibold text-brand-dark underline dark:text-brand"
        >
          Open the original listing
        </a>
      </section>

      {item.conflicts.length > 0 && (
        <section className="space-y-2 rounded-card border border-discount/30 bg-discount/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <AlertTriangle aria-hidden="true" className="size-4 text-discount" />
            Conflicting identity facts
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {item.conflicts.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
          <p className="text-xs text-ink-subtle">
            Accepting a product with these conflicts requires an explicit acknowledgement. The
            confirmation is recorded in the audit trail.
          </p>
        </section>
      )}

      <section className="space-y-3 rounded-card border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Candidate canonical products</h3>
          <span className="text-xs text-ink-subtle">{item.candidates.length} shown</span>
        </div>

        {item.candidates.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No canonical product is plausible for this listing. Leave it unresolved, or create the
            product through catalogue ingestion first.
          </p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="sr-only">Choose a canonical product</legend>
            {item.candidates.map((candidate) => {
              const active = candidate.productId === selectedProductId;

              return (
                <label
                  key={candidate.productId}
                  className={`flex cursor-pointer items-start gap-3 rounded-tile border p-3 transition-colors ${
                    active
                      ? 'border-brand bg-brand-soft/60 dark:bg-brand/10'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name="review-candidate"
                    value={candidate.productId}
                    checked={active}
                    onChange={() => setSelectedProductId(candidate.productId)}
                    className="mt-1 size-4 accent-[var(--color-brand)]"
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{candidate.name}</span>
                      <Badge tone={verdictTone(candidate.status)}>{candidate.status}</Badge>
                      <Badge tone="outline">{strengthLabel(candidate.confidence)}</Badge>
                      {candidate.isSample && <Badge tone="warning">Sample</Badge>}
                      {candidate.mergedInto && <Badge tone="neutral">Merged</Badge>}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {candidate.brand} · {candidate.category} ·{' '}
                      <span className="font-mono">{candidate.productId}</span>
                    </span>
                    {candidate.reasons.length > 0 && (
                      <span className="block text-xs text-ink-subtle">
                        {candidate.reasons.join('; ')}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button
            size="sm"
            onClick={() => openDialog('accept')}
            disabled={!selectedProductId}
            leadingIcon={<CheckCircle2 aria-hidden="true" className="size-4" />}
          >
            Accept selected
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openDialog('reassign')}
            disabled={!selectedProductId}
            leadingIcon={<ArrowRightLeft aria-hidden="true" className="size-4" />}
          >
            Assign to selected
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openDialog('reject')}
            leadingIcon={<XCircle aria-hidden="true" className="size-4" />}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDialog('defer')}
            leadingIcon={<Clock aria-hidden="true" className="size-4" />}
          >
            Leave unresolved
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDialog('reopen')}
            leadingIcon={<RotateCcw aria-hidden="true" className="size-4" />}
          >
            Reopen
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-card border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Decision history</h3>
        {detail?.decisions.length ? (
          <ol className="space-y-3">
            {detail.decisions.map((decision) => (
              <li key={decision.id} className="border-l-2 border-line pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={decisionTone(decision.decision)}>
                    {DECISION_LABEL[decision.decision]}
                  </Badge>
                  <span className="text-xs text-ink-muted">
                    {decision.adminEmail} · {formatTimestamp(decision.decidedAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink">{decision.reason}</p>
                {decision.notes && (
                  <p className="mt-1 text-xs text-ink-muted">Note: {decision.notes}</p>
                )}
                <p className="mt-1 text-[11px] text-ink-subtle">
                  {decision.previousStatus} → {decision.newCanonicalProductId ?? 'unresolved'} ·{' '}
                  {decision.matcherVersion}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">No human decision has been recorded yet.</p>
        )}

        <h3 className="pt-2 text-sm font-semibold text-ink">Audit trail for this listing</h3>
        {detail?.audit.length ? (
          <ul className="space-y-2">
            {detail.audit.map((event) => (
              <li key={event.id} className="rounded-tile bg-background-alt px-3 py-2 text-xs">
                <span className="font-semibold text-ink">{event.action}</span>{' '}
                <span className="text-ink-muted">
                  by {event.actorEmail ?? 'unknown'} · {formatTimestamp(event.occurredAt)}
                </span>
                <p className="mt-0.5 text-ink-subtle">
                  {(event.previousState['canonicalProductId'] as string | undefined) ?? '—'} →{' '}
                  {(event.newState['canonicalProductId'] as string | undefined) ?? '—'}
                </p>
                {event.requestId && (
                  <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">
                    request {event.requestId}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No audit events recorded for this listing.</p>
        )}
      </section>

      {dialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-dialog-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg space-y-4 rounded-card border border-line bg-surface p-5 shadow-float">
            <div className="space-y-1">
              <h2 id="decision-dialog-title" className="text-lg font-semibold tracking-tight">
                {ACTION_LABEL[dialog]}
              </h2>
              <p className="text-sm text-ink-muted">
                This is recorded as a human decision with your administrator identity and the
                current matcher version. It outranks automatic matching until reopened.
              </p>
            </div>

            {needsTarget && (
              <p className="rounded-tile border border-line bg-background-alt px-3 py-2 text-sm">
                Target:{' '}
                <span className="font-semibold">
                  {selectedCandidate?.name ?? selectedProductId}
                </span>
                <span className="ml-1 font-mono text-xs text-ink-muted">{selectedProductId}</span>
              </p>
            )}

            {needsTarget && item.conflicts.length > 0 && (
              <label className="flex items-start gap-2 rounded-tile border border-discount/40 bg-discount/5 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmConflicts}
                  onChange={(event) => setConfirmConflicts(event.target.checked)}
                  className="mt-1 size-4 accent-[var(--color-discount)]"
                />
                <span>
                  I have reviewed the {item.conflicts.length} conflicting identity fact(s) and
                  confirm this assignment.
                </span>
              </label>
            )}

            <div className="space-y-1.5">
              <label htmlFor="decision-reason" className="block text-sm font-medium text-ink">
                Reason (required)
              </label>
              <textarea
                id="decision-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                maxLength={240}
                required
                className="w-full rounded-tile border border-line bg-background-alt px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                placeholder="e.g. checked the model number against the manufacturer page"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="decision-notes" className="block text-sm font-medium text-ink">
                Notes (optional)
              </label>
              <textarea
                id="decision-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                maxLength={1000}
                className="w-full rounded-tile border border-line bg-background-alt px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                placeholder="Anything the next reviewer should know"
              />
            </div>

            {dialogError && (
              <p role="alert" className="text-sm font-medium text-danger">
                {dialogError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={() => void confirm()} disabled={!canSubmit}>
                {submitting ? 'Saving…' : 'Confirm decision'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-ink-subtle uppercase">{label}</dt>
      <dd className="truncate text-sm text-ink">{value}</dd>
    </div>
  );
}
