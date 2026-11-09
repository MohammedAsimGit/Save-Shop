import { randomUUID } from 'node:crypto';

import {
  CATALOGUE_MATCHER_VERSION,
  marketplaceListingSchema,
  normalizeKey,
  tokenizeText,
  type AcceptMatchRequest,
  type DeferMatchRequest,
  type ListingDetailResponse,
  type RejectMatchRequest,
  type ReopenMatchRequest,
  type ReviewCandidate,
  type ReviewDecisionRecord,
  type ReviewQueueItem,
  type ReviewQueueQuery,
  type ReviewQueueResponse,
  type ReviewDecisionResponse,
} from '@smart-shopping/shared';

import { AppError } from '../../utils/AppError.js';
import {
  isPendingReview,
  type CatalogueStore,
  type ListingReviewPatch,
  type StoredListing,
} from '../catalogue/catalogueStore.js';
import {
  assessCandidates,
  assessListingAgainstProduct,
  createIdentityMatcher,
  type CandidateAssessment,
  type IdentityMatcher,
  type ListingIdentityHints,
} from '../catalogue/matching.service.js';
import type { AdminStore } from './adminStore.js';
import { recordAudit } from './audit.js';
import type { AdminActor } from './auth.service.js';

/**
 * Catalogue review workflow.
 *
 * Everything an administrator can do to a listing goes through `decide`, which:
 *   1. checks the optimistic revision (two administrators cannot overwrite each other);
 *   2. checks the target product still exists and is a live, unmerged record;
 *   3. re-scores the listing against the target with the same rules as the matcher,
 *      and refuses a contradicting decision unless it was explicitly acknowledged;
 *   4. writes the listing with compare-and-set;
 *   5. appends an immutable decision record and an audit event.
 *
 * The decision record is written after the listing changes, so `decidedAt` and the
 * listing's `review` always agree. If the history write itself fails the request
 * fails too - a privileged change must not silently succeed unlogged.
 */

export type DecisionAction = 'accept' | 'reject' | 'reassign' | 'defer' | 'reopen';

export type DecisionBody =
  AcceptMatchRequest | RejectMatchRequest | DeferMatchRequest | ReopenMatchRequest;

export interface DecideInput {
  readonly listingId: string;
  readonly action: DecisionAction;
  readonly actor: AdminActor;
  readonly requestId?: string | null;
  readonly body: DecisionBody;
}

export interface ReviewService {
  getQueue(query: ReviewQueueQuery): Promise<ReviewQueueResponse>;
  getListing(listingId: string): Promise<ListingDetailResponse>;
  decide(input: DecideInput): Promise<ReviewDecisionResponse>;
}

export interface ReviewServiceOptions {
  readonly store: CatalogueStore;
  readonly adminStore: AdminStore;
  readonly matcher?: IdentityMatcher;
  readonly now?: () => Date;
  readonly candidateLimit?: number;
}

const DECISION_AUDIT_ACTION = {
  accepted: 'match.accepted',
  rejected: 'match.rejected',
  reassigned: 'match.reassigned',
  deferred: 'match.deferred',
  reopened: 'match.reopened',
} as const;

function hintsOf(listing: StoredListing): ListingIdentityHints {
  return {
    title: listing.title,
    ...(listing.brand ? { brand: listing.brand } : {}),
    ...(listing.model ? { model: listing.model } : {}),
    ...(listing.mpn ? { mpn: listing.mpn } : {}),
    ...(listing.gtin ? { gtin: listing.gtin } : {}),
    ...(listing.color ? { color: listing.color } : {}),
    ...(listing.storageCapacity ? { storageCapacity: listing.storageCapacity } : {}),
  };
}

function identityFacts(listing: StoredListing): Record<string, string> {
  const facts: Record<string, string> = { title: listing.title.slice(0, 160) };
  const optional: readonly (keyof StoredListing)[] = [
    'brand',
    'model',
    'mpn',
    'gtin',
    'color',
    'storageCapacity',
  ];
  for (const key of optional) {
    const value = listing[key];
    if (typeof value === 'string' && value.length > 0) facts[key] = value.slice(0, 160);
  }
  return facts;
}

function toCandidate(assessment: CandidateAssessment): ReviewCandidate {
  return {
    productId: assessment.product.id,
    name: assessment.product.name,
    brand: assessment.product.brand,
    category: assessment.product.category,
    status: assessment.status,
    method: assessment.method,
    confidence: assessment.confidence,
    reasons: assessment.reasons.slice(0, 6).map((reason) => reason.slice(0, 160)),
    isSample: assessment.product.isSample,
    mergedInto: assessment.product.mergedInto,
  };
}

function reviewReason(listing: StoredListing): string {
  if (listing.review && listing.review.decision !== 'reopened') {
    switch (listing.review.decision) {
      case 'accepted':
        return 'An administrator accepted this listing as the canonical product.';
      case 'reassigned':
        return 'An administrator reassigned this listing to a different canonical product.';
      case 'rejected':
        return 'An administrator rejected the proposed match; the listing stays unresolved.';
      default:
        return 'An administrator left this listing unresolved for later review.';
    }
  }

  switch (listing.match.status) {
    case 'conflict':
      return 'The identity facts contradict the available candidates, so the listing stays unresolved.';
    case 'possible':
      return 'The automatic matcher found more than one plausible product; a human must choose.';
    case 'unmatched':
      return 'No canonical product matched automatically; a human must decide whether one exists.';
    default:
      return listing.canonicalProductId === null
        ? 'The listing is not attached to a canonical product.'
        : 'The automatic match was flagged for human review.';
  }
}

export function createReviewService(options: ReviewServiceOptions): ReviewService {
  const { store, adminStore } = options;
  const clock = options.now ?? (() => new Date());
  const matcher = options.matcher ?? createIdentityMatcher({ store });
  const candidateLimit = options.candidateLimit ?? 30;

  async function candidatesFor(listing: StoredListing): Promise<{
    readonly assessments: CandidateAssessment[];
    readonly topId: string | null;
  }> {
    const rejected = new Set(listing.review?.rejectedProductIds ?? []);
    const hints = hintsOf(listing);

    const found = await store.findCandidates({
      ...(listing.gtin ? { gtin: listing.gtin } : {}),
      ...(listing.mpn ? { mpn: listing.mpn } : {}),
      ...(listing.brand ? { brandKey: normalizeKey(listing.brand) } : {}),
      ...(tokenizeText(listing.title).length > 0
        ? { nameTokens: tokenizeText(listing.title).slice(0, 6) }
        : {}),
      ...(rejected.size > 0 ? { excludeIds: [...rejected] } : {}),
      limit: candidateLimit,
    });

    const assessments = assessCandidates(hints, found);

    // The product a human already chose must stay visible even if the matcher would
    // no longer propose it (for example after the candidate set changed).
    if (
      listing.canonicalProductId &&
      !assessments.some((a) => a.product.id === listing.canonicalProductId)
    ) {
      const chosen = await store.findProduct(listing.canonicalProductId);
      if (chosen) assessments.push(assessCandidates(hints, [chosen])[0] as CandidateAssessment);
    }

    assessments.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.product.name.localeCompare(b.product.name);
    });

    const eligible = assessments.filter((a) => a.status !== 'unmatched');
    return {
      assessments: eligible,
      topId: eligible[0]?.product.id ?? null,
    };
  }

  async function buildItem(listing: StoredListing): Promise<ReviewQueueItem> {
    const { assessments } = await candidatesFor(listing);

    const conflicts = new Set<string>();
    if (listing.match.status === 'conflict' || listing.match.status === 'unmatched') {
      for (const reason of listing.match.reasons) conflicts.add(reason.slice(0, 160));
    }
    for (const assessment of assessments) {
      if (!assessment.contradictory) continue;
      for (const reason of assessment.reasons) {
        conflicts.add(`${assessment.product.name}: ${reason}`.slice(0, 160));
      }
    }

    return {
      // Parsing strips storage-only fields (the content hash) and validates shape.
      listing: marketplaceListingSchema.parse(listing),
      candidates: assessments.slice(0, 5).map(toCandidate),
      conflicts: [...conflicts].slice(0, 8),
      reviewRequiredReason: reviewReason(listing),
      pending: isPendingReview(listing),
    };
  }

  function staleConflict(expected: number, current: number): AppError {
    return new AppError({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'This listing changed since it was loaded',
      details: [
        `Expected revision ${expected}, current revision ${current}. Reload the listing and try again.`,
      ],
    });
  }

  async function requireLiveProduct(productId: string) {
    const product = await store.findProduct(productId);
    if (!product) throw AppError.notFound(`Unknown canonical product: ${productId}`);

    if (product.mergedInto) {
      throw new AppError({
        statusCode: 409,
        code: 'CONFLICT',
        message: `Product ${productId} was merged into ${product.mergedInto}; choose the surviving product.`,
      });
    }

    if (product.status === 'archived') {
      throw new AppError({
        statusCode: 409,
        code: 'CONFLICT',
        message: `Product ${productId} is archived and cannot receive listings.`,
      });
    }

    return product;
  }

  return {
    async getQueue(query) {
      const result = await store.listReviewQueue(query);
      const items = await Promise.all(result.listings.map(buildItem));

      return {
        items,
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        counts: result.counts,
        notices: [
          'Matching strength is a deterministic 0-100 score from documented identity rules, not a probability.',
          store.kind === 'memory'
            ? 'The catalogue is running in memory for this process: review decisions will not survive a restart.'
            : 'Review decisions are stored in MongoDB and survive re-ingestion and restarts.',
        ],
      };
    },

    async getListing(listingId) {
      const listing = await store.findListing(listingId);
      if (!listing) throw AppError.notFound(`Unknown listing: ${listingId}`);

      const [item, decisions, audit] = await Promise.all([
        buildItem(listing),
        adminStore.listDecisions(listingId, 50),
        adminStore.listAudit({ targetId: listingId, page: 1, pageSize: 20 }),
      ]);

      return {
        item,
        decisions: [...decisions],
        audit: [...audit.events],
        notices: [
          'Decision history is append-only; a new decision never rewrites an earlier one.',
          'A human decision outranks the automatic matcher until an administrator explicitly reopens the listing.',
        ],
      };
    },

    async decide(input) {
      const listing = await store.findListing(input.listingId);
      if (!listing) throw AppError.notFound(`Unknown listing: ${input.listingId}`);

      const body = input.body;
      if (listing.revision !== body.expectedRevision) {
        throw staleConflict(body.expectedRevision, listing.revision);
      }

      const now = clock();
      const requestId = input.requestId ?? null;
      const notes = body.notes ?? null;

      let patch: ListingReviewPatch;
      let acknowledged: string[] = [];
      let newCanonicalProductId: string | null = null;
      let rejectedProductId: string | null = null;
      const notices: string[] = [];

      if (input.action === 'accept' || input.action === 'reassign') {
        const acceptBody = body as AcceptMatchRequest;
        const target = await requireLiveProduct(acceptBody.canonicalProductId);
        const assessment = assessListingAgainstProduct(hintsOf(listing), target);

        const conflicts: string[] = [];
        if (assessment.contradictory) conflicts.push(...assessment.reasons);
        if (assessment.status === 'unmatched') {
          conflicts.push('no identity evidence links this listing to that product');
        }

        if (conflicts.length > 0 && !acceptBody.confirmConflicts) {
          throw new AppError({
            statusCode: 409,
            code: 'CONFLICT',
            message: 'The selected product conflicts with the listing',
            details: [
              ...conflicts.slice(0, 8).map((conflict) => conflict.slice(0, 200)),
              'Confirm the conflicts explicitly to record this decision.',
            ],
          });
        }

        const decisionType =
          input.action === 'reassign' && listing.canonicalProductId !== target.id
            ? 'reassigned'
            : 'accepted';

        acknowledged = conflicts;
        newCanonicalProductId = target.id;

        patch = {
          decision: decisionType,
          decidedBy: input.actor.id,
          decidedAt: now,
          reason: body.reason,
          notes,
          matcherVersion: CATALOGUE_MATCHER_VERSION,
          canonicalProductId: target.id,
          previousStatus: listing.match.status,
          previousCanonicalProductId: listing.canonicalProductId,
          match: {
            // An accepted weak match stays recorded as weak; only the human decision
            // resolves it. "unmatched with confirmation" is recorded as possible so
            // the verdict never claims evidence that did not exist.
            status: assessment.status === 'unmatched' ? 'possible' : assessment.status,
            method: assessment.method,
            confidence: assessment.confidence,
            requiresReview: false,
            reasons: [
              ...assessment.reasons,
              decisionType === 'reassigned'
                ? 'assigned by an administrator'
                : 'accepted by an administrator',
            ].slice(0, 6),
          },
        };

        notices.push(
          decisionType === 'reassigned'
            ? 'The listing now resolves to the selected product.'
            : 'The match was approved and now outranks the automatic matcher.',
        );
      } else if (input.action === 'reject') {
        const requested = (body as RejectMatchRequest).canonicalProductId;
        if (requested) await requireLiveProduct(requested);

        const { topId } = await candidatesFor(listing);
        const candidateId = requested ?? listing.canonicalProductId ?? topId;
        rejectedProductId = candidateId;

        patch = {
          decision: 'rejected',
          decidedBy: input.actor.id,
          decidedAt: now,
          reason: body.reason,
          notes,
          matcherVersion: CATALOGUE_MATCHER_VERSION,
          canonicalProductId: null,
          ...(candidateId ? { rejectedProductId: candidateId } : {}),
          previousStatus: listing.match.status,
          previousCanonicalProductId: listing.canonicalProductId,
          match: {
            status: 'unmatched',
            method: 'none',
            confidence: 0,
            requiresReview: false,
            reasons: ['rejected by an administrator'],
          },
        };

        notices.push(
          candidateId
            ? 'The rejected candidate will not be proposed automatically again unless an administrator reopens the listing.'
            : 'The listing is recorded as rejected without a specific candidate.',
        );
      } else if (input.action === 'defer') {
        patch = {
          decision: 'deferred',
          decidedBy: input.actor.id,
          decidedAt: now,
          reason: body.reason,
          notes,
          matcherVersion: CATALOGUE_MATCHER_VERSION,
          canonicalProductId: null,
          previousStatus: listing.match.status,
          previousCanonicalProductId: listing.canonicalProductId,
          match: {
            ...listing.match,
            requiresReview: true,
            reasons: [...listing.match.reasons].slice(0, 6),
          },
        };

        notices.push(
          'The listing remains unresolved and stays in the review queue with the note attached.',
        );
      } else {
        // Reopen: put the row back under the automatic matcher. This is the only way
        // a previously refused candidate can be proposed again.
        const reopened = await matcher.match(hintsOf(listing));
        newCanonicalProductId = reopened.canonicalProductId;

        patch = {
          decision: 'reopened',
          decidedBy: input.actor.id,
          decidedAt: now,
          reason: body.reason,
          notes,
          matcherVersion: CATALOGUE_MATCHER_VERSION,
          canonicalProductId: reopened.canonicalProductId,
          previousStatus: listing.match.status,
          previousCanonicalProductId: listing.canonicalProductId,
          match: {
            status: reopened.status,
            method: reopened.method,
            confidence: reopened.confidence,
            requiresReview: reopened.requiresReview,
            reasons: [...reopened.reasons].slice(0, 6),
          },
        };

        notices.push(
          'The automatic matcher ran again; previous candidate refusals were cleared by this explicit reprocess.',
        );
      }

      const applied = await store.applyReview(listing.id, body.expectedRevision, patch);

      if (applied.status === 'not_found') {
        throw AppError.notFound(`Unknown listing: ${listing.id}`);
      }
      if (applied.status === 'conflict') {
        throw staleConflict(body.expectedRevision, applied.currentRevision ?? listing.revision);
      }
      const updated = applied.listing as StoredListing;

      const record: ReviewDecisionRecord = {
        id: randomUUID(),
        listingId: listing.id,
        sourceId: listing.sourceId,
        marketplaceId: listing.marketplaceId,
        decision: patch.decision,
        previousStatus: listing.match.status,
        previousCanonicalProductId: listing.canonicalProductId,
        newCanonicalProductId,
        rejectedProductId,
        adminId: input.actor.id,
        adminEmail: input.actor.email,
        reason: body.reason,
        notes,
        identityFacts: identityFacts(listing),
        matcherVersion: CATALOGUE_MATCHER_VERSION,
        requestId,
        listingRevision: body.expectedRevision + 1,
        decidedAt: now.toISOString(),
      };

      // The decision is the durable fact; the audit event is the operational trail.
      // Both are append-only.
      await adminStore.appendDecision(record);

      await recordAudit(
        adminStore,
        {
          action: DECISION_AUDIT_ACTION[patch.decision],
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          targetType: 'listing',
          targetId: listing.id,
          previousState: {
            status: listing.match.status,
            canonicalProductId: listing.canonicalProductId,
            reviewDecision: listing.review?.decision ?? null,
            revision: listing.revision,
          },
          newState: {
            status: updated.match.status,
            canonicalProductId: updated.canonicalProductId,
            reviewDecision: updated.review?.decision ?? null,
            revision: updated.revision,
            acknowledgedConflicts: acknowledged,
          },
          reason: body.reason,
          requestId,
        },
        now,
      );

      return {
        listing: marketplaceListingSchema.parse(updated),
        decision: record,
        acknowledgedConflicts: acknowledged,
        notices,
      };
    },
  };
}
