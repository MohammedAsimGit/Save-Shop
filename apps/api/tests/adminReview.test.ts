import { beforeEach, describe, expect, it } from 'vitest';

import type { CanonicalProduct, ReviewQueueQuery } from '@smart-shopping/shared';

import { createMemoryAdminStore } from '../src/services/admin/adminStore.js';
import type { AdminActor } from '../src/services/admin/auth.service.js';
import { createReviewService, type ReviewService } from '../src/services/admin/review.service.js';
import {
  listingContentHash,
  listingKey,
  type CatalogueStore,
  type StoredListing,
} from '../src/services/catalogue/catalogueStore.js';
import { ingestCatalogue } from '../src/services/catalogue/ingestion.service.js';
import { createMemoryCatalogueStore } from '../src/services/catalogue/memoryCatalogueStore.js';
import { createIdentityMatcher } from '../src/services/catalogue/matching.service.js';
import { makeProduct, makeSource, syntheticGtin } from './helpers/catalogue.js';

/**
 * Catalogue review workflow.
 *
 * The fixture uses synthetic GTINs computed with a real check digit, so the matcher
 * treats them exactly like production identifiers while identifying nothing real.
 */

const ACTOR: AdminActor = {
  id: 'admin-1',
  email: 'ops@example.com',
  displayName: 'Operations',
  role: 'catalogue_admin',
};

const NOW = new Date('2026-11-09T10:00:00.000Z');

const GTIN_XM5 = syntheticGtin('1000000000001');
const GTIN_OTHER = syntheticGtin('2000000000002');

function products(): CanonicalProduct[] {
  return [
    makeProduct({
      id: 'sony-wh1000xm5',
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
      gtin: GTIN_XM5,
    }),
    makeProduct({
      id: 'sony-wh1000xm4',
      name: 'WH-1000XM4 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM4',
      category: 'audio',
    }),
    makeProduct({
      id: 'bose-qc45',
      name: 'QuietComfort 45 Headphones',
      brand: 'Bose',
      model: 'QC45',
      category: 'audio',
    }),
  ];
}

function makeListing(overrides: Partial<StoredListing> = {}): StoredListing {
  const base: Omit<StoredListing, 'contentHash'> = {
    id: listingKey({
      sourceId: 'test-source',
      marketplaceId: 'amazon',
      externalId: overrides.externalId ?? 'item-1',
    }),
    canonicalProductId: null,
    sourceId: 'test-source',
    marketplaceId: 'amazon',
    externalId: 'item-1',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
    brand: 'Sony',
    specifications: {},
    provenance: 'manual',
    isSample: false,
    match: {
      status: 'possible',
      method: 'title_similarity',
      confidence: 72,
      requiresReview: true,
      reasons: ['title similarity 0.86 with the same brand'],
    },
    revision: 0,
    review: null,
    lastObservedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };

  return { ...base, contentHash: listingContentHash(base) };
}

function query(overrides: Partial<ReviewQueueQuery> = {}): ReviewQueueQuery {
  return {
    scope: 'pending',
    sort: 'oldest',
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

async function seed() {
  const store = createMemoryCatalogueStore();
  const adminStore = createMemoryAdminStore();
  const matcher = createIdentityMatcher({ store });
  const review = createReviewService({ store, adminStore, matcher, now: () => NOW });

  await store.upsertProducts(products());
  return { store, adminStore, review };
}

async function seedListing(store: CatalogueStore, listing: StoredListing): Promise<void> {
  await store.upsertListings([listing]);
}

describe('review queue', () => {
  let store: CatalogueStore;
  let review: ReviewService;

  beforeEach(async () => {
    ({ store, review } = await seed());
  });

  it('includes unresolved verdicts and excludes resolved rows from the pending scope', async () => {
    await seedListing(store, makeListing({ externalId: 'possible' }));
    await seedListing(
      store,
      makeListing({
        externalId: 'conflict',
        brand: 'Sony',
        gtin: GTIN_OTHER,
        match: {
          status: 'conflict',
          method: 'gtin',
          confidence: 10,
          requiresReview: true,
          reasons: ['different GTIN for the same candidate'],
        },
      }),
    );
    await seedListing(
      store,
      makeListing({
        externalId: 'unmatched',
        title: 'USB-C Cable 2m',
        brand: 'Acme',
        match: {
          status: 'unmatched',
          method: 'none',
          confidence: 0,
          requiresReview: false,
          reasons: ['no deterministic rule matched'],
        },
      }),
    );

    const pending = await review.getQueue(query());

    expect(pending.totalItems).toBe(3);
    expect(pending.items.map((item) => item.listing.match.status).sort()).toEqual([
      'conflict',
      'possible',
      'unmatched',
    ]);
    expect(pending.counts.pending).toBe(3);
    expect(pending.counts.requiresReview).toBe(2);
    expect(pending.counts.byVerdict.possible).toBe(1);
    expect(pending.notices.join(' ')).toMatch(/not a probability/);
  });

  it('filters by verdict, source, marketplace, canonical product and search text', async () => {
    await seedListing(store, makeListing({ externalId: 'one' }));
    await seedListing(
      store,
      makeListing({
        externalId: 'two',
        sourceId: 'other-source',
        marketplaceId: 'flipkart',
        title: 'Sony WH-1000XM4 Wireless Headphones',
        brand: 'Sony',
      }),
    );

    expect((await review.getQueue(query({ sourceId: 'other-source' }))).totalItems).toBe(1);
    expect((await review.getQueue(query({ marketplaceId: 'amazon' }))).totalItems).toBe(1);
    expect((await review.getQueue(query({ verdict: 'possible' }))).totalItems).toBe(2);
    expect((await review.getQueue(query({ q: 'xm4' }))).totalItems).toBe(1);
    expect((await review.getQueue(query({ q: 'two' }))).totalItems).toBe(1);
    expect(
      (await review.getQueue(query({ canonicalProductId: 'sony-wh1000xm5' }))).totalItems,
    ).toBe(0);
  });

  it('paginates deterministically and reports the total', async () => {
    for (let index = 0; index < 5; index += 1) {
      await seedListing(store, makeListing({ externalId: `item-${index}` }));
    }

    const first = await review.getQueue(query({ page: 1, pageSize: 2 }));
    const second = await review.getQueue(query({ page: 2, pageSize: 2 }));

    expect(first.totalItems).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(first.items.map((item) => item.listing.id)).not.toEqual(
      second.items.map((item) => item.listing.id),
    );
  });

  it('shows candidates, conflicts and the reason a human is needed', async () => {
    await seedListing(
      store,
      makeListing({
        gtin: GTIN_OTHER,
        match: {
          status: 'conflict',
          method: 'gtin',
          confidence: 10,
          requiresReview: true,
          reasons: ['different GTIN for the same candidate'],
        },
      }),
    );

    const queue = await review.getQueue(query());
    const item = queue.items[0];

    expect(item?.candidates.map((candidate) => candidate.productId)).toContain('sony-wh1000xm5');
    expect(item?.conflicts.length).toBeGreaterThan(0);
    expect(item?.reviewRequiredReason).toMatch(/contradict|human/i);
    expect(item?.pending).toBe(true);
    expect(item?.listing.title).toBe('Sony WH-1000XM5 Wireless Headphones');
  });
});

describe('review decisions', () => {
  let store: CatalogueStore;
  let adminStore: ReturnType<typeof createMemoryAdminStore>;
  let review: ReviewService;

  beforeEach(async () => {
    ({ store, adminStore, review } = await seed());
    await seedListing(store, makeListing());
  });

  async function accept(
    canonicalProductId: string,
    options: { confirmConflicts?: boolean; revision?: number } = {},
  ) {
    return review.decide({
      listingId: makeListing().id,
      action: 'accept',
      actor: ACTOR,
      requestId: 'request-1',
      body: {
        canonicalProductId,
        confirmConflicts: options.confirmConflicts ?? false,
        expectedRevision: options.revision ?? 0,
        reason: 'reviewed against the marketplace title',
        notes: 'checked the model number by hand',
      },
    });
  }

  it('accepts a proposed match and records a human decision', async () => {
    const result = await accept('sony-wh1000xm5');

    expect(result.listing.canonicalProductId).toBe('sony-wh1000xm5');
    expect(result.listing.review).toMatchObject({
      decision: 'accepted',
      decidedBy: ACTOR.id,
      matcherVersion: 'catalogue-matcher/1',
    });
    expect(result.listing.match.requiresReview).toBe(false);
    expect(result.listing.revision).toBe(1);
    expect(result.decision).toMatchObject({
      decision: 'accepted',
      previousCanonicalProductId: null,
      newCanonicalProductId: 'sony-wh1000xm5',
      adminId: ACTOR.id,
      requestId: 'request-1',
      listingRevision: 1,
    });
    expect(result.decision.identityFacts).toMatchObject({
      brand: 'Sony',
      title: 'Sony WH-1000XM5 Wireless Headphones',
    });

    const audit = await adminStore.listAudit({ targetId: makeListing().id, page: 1, pageSize: 10 });
    expect(audit.events[0]).toMatchObject({
      action: 'match.accepted',
      actorId: ACTOR.id,
      previousState: { canonicalProductId: null, status: 'possible', revision: 0 },
      newState: { canonicalProductId: 'sony-wh1000xm5', reviewDecision: 'accepted', revision: 1 },
    });
  });

  it('refuses an unknown target product', async () => {
    await expect(accept('does-not-exist')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('requires an explicit acknowledgement of conflicting identity facts', async () => {
    await store.upsertProducts([
      makeProduct({
        id: 'sony-wh1000xm5-import',
        name: 'WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        gtin: GTIN_OTHER,
        category: 'audio',
      }),
    ]);

    const listing = await store.findListing(makeListing().id);
    expect(listing?.gtin).toBeUndefined();

    // The listing's brand and title agree, so add a GTIN that contradicts the target.
    await store.upsertListings([
      makeListing({
        gtin: GTIN_XM5,
        match: {
          status: 'conflict',
          method: 'gtin',
          confidence: 10,
          requiresReview: true,
          reasons: ['different GTIN for the same candidate'],
        },
      }),
    ]);

    await expect(accept('sony-wh1000xm5-import')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });

    const confirmed = await accept('sony-wh1000xm5-import', { confirmConflicts: true });
    expect(confirmed.acknowledgedConflicts.length).toBeGreaterThan(0);
    expect(confirmed.decision.newCanonicalProductId).toBe('sony-wh1000xm5-import');
    expect(confirmed.listing.review?.decision).toBe('accepted');
  });

  it('rejects a candidate, keeps the listing and refuses to propose it again', async () => {
    const result = await review.decide({
      listingId: makeListing().id,
      action: 'reject',
      actor: ACTOR,
      body: {
        canonicalProductId: 'sony-wh1000xm5',
        expectedRevision: 0,
        reason: 'the marketplace item is the XM4, not the XM5',
      },
    });

    expect(result.listing.canonicalProductId).toBeNull();
    expect(result.listing.review?.decision).toBe('rejected');
    expect(result.listing.review?.rejectedProductIds).toContain('sony-wh1000xm5');
    expect(result.listing.match.status).toBe('unmatched');
    expect(result.decision.rejectedProductId).toBe('sony-wh1000xm5');

    const pending = await review.getQueue(query());
    expect(pending.totalItems).toBe(0);

    const decided = await review.getQueue(query({ scope: 'decided' }));
    expect(decided.items[0]?.listing.review?.decision).toBe('rejected');

    const detail = await review.getListing(makeListing().id);
    expect(detail.decisions).toHaveLength(1);
    expect(detail.audit[0]?.action).toBe('match.rejected');
  });

  it('reassigns a resolved listing to a different product', async () => {
    await accept('sony-wh1000xm5');

    const result = await review.decide({
      listingId: makeListing().id,
      action: 'reassign',
      actor: ACTOR,
      body: {
        canonicalProductId: 'bose-qc45',
        confirmConflicts: true,
        expectedRevision: 1,
        reason: 'the listing is actually the Bose model',
      },
    });

    expect(result.decision.decision).toBe('reassigned');
    expect(result.listing.canonicalProductId).toBe('bose-qc45');

    const history = await adminStore.listDecisions(makeListing().id, 10);
    expect(history.map((record) => record.decision)).toEqual(['accepted', 'reassigned']);
    expect(history[1]?.previousCanonicalProductId).toBe('sony-wh1000xm5');
    expect(history[1]?.newCanonicalProductId).toBe('bose-qc45');
  });

  it('leaves a listing unresolved with a review note', async () => {
    const result = await review.decide({
      listingId: makeListing().id,
      action: 'defer',
      actor: ACTOR,
      body: {
        expectedRevision: 0,
        reason: 'colour variant is unclear',
        notes: 'asked the provider for the exact SKU',
      },
    });

    expect(result.listing.canonicalProductId).toBeNull();
    expect(result.listing.review).toMatchObject({
      decision: 'deferred',
      notes: 'asked the provider for the exact SKU',
    });
    expect(result.listing.match.requiresReview).toBe(true);

    const pending = await review.getQueue(query());
    expect(pending.totalItems).toBe(1);
    expect(pending.items[0]?.reviewRequiredReason).toMatch(/left this listing unresolved/i);
  });

  it('rejects a stale decision instead of overwriting a newer one', async () => {
    await accept('sony-wh1000xm5');

    await expect(accept('sony-wh1000xm4', { revision: 0 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });

    const listing = await store.findListing(makeListing().id);
    expect(listing?.canonicalProductId).toBe('sony-wh1000xm5');
    expect(listing?.revision).toBe(1);
  });

  it('returns to the automatic matcher only on an explicit reopen', async () => {
    await review.decide({
      listingId: makeListing().id,
      action: 'reject',
      actor: ACTOR,
      body: {
        canonicalProductId: 'sony-wh1000xm5',
        expectedRevision: 0,
        reason: 'wrong candidate',
      },
    });

    const reopened = await review.decide({
      listingId: makeListing().id,
      action: 'reopen',
      actor: ACTOR,
      body: {
        expectedRevision: 1,
        reason: 'provider corrected the listing title',
      },
    });

    expect(reopened.listing.review).toBeNull();
    expect(reopened.decision.decision).toBe('reopened');
    expect(reopened.listing.revision).toBe(2);

    // The cleared refusal means the matcher may propose that candidate again.
    const pending = await review.getQueue(query());
    expect(pending.items[0]?.candidates.map((candidate) => candidate.productId)).toContain(
      'sony-wh1000xm5',
    );
  });

  it('keeps an append-only decision history', async () => {
    await accept('sony-wh1000xm5');
    await review.decide({
      listingId: makeListing().id,
      action: 'defer',
      actor: ACTOR,
      body: { expectedRevision: 1, reason: 'second look needed' },
    });

    const history = await adminStore.listDecisions(makeListing().id, 10);
    expect(history).toHaveLength(2);
    expect(history[0]?.id).not.toBe(history[1]?.id);
    expect((history[0]?.decidedAt ?? '') <= (history[1]?.decidedAt ?? '')).toBe(true);
  });
});

describe('human decisions versus re-ingestion', () => {
  it('preserves an accepted decision when the same listing is ingested again', async () => {
    const store = createMemoryCatalogueStore();
    const adminStore = createMemoryAdminStore();
    const matcher = createIdentityMatcher({ store });
    const review = createReviewService({ store, adminStore, matcher, now: () => NOW });

    await store.upsertProducts(products());

    const source = makeSource({
      listings: [
        {
          marketplaceId: 'amazon',
          externalId: 'sku-1',
          title: 'Sony WH-1000XM5 Wireless Headphones',
          url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
          brand: 'Sony',
          specifications: {},
        },
      ],
    });

    await ingestCatalogue({ sources: [source], store, matcher, now: () => NOW });
    const first = await store.findListing(
      listingKey({ sourceId: source.id, marketplaceId: 'amazon', externalId: 'sku-1' }),
    );
    expect(first).toBeDefined();

    await review.decide({
      listingId: first?.id as string,
      action: 'accept',
      actor: ACTOR,
      body: {
        canonicalProductId: 'sony-wh1000xm5',
        confirmConflicts: false,
        expectedRevision: 0,
        reason: 'confirmed against the manufacturer page',
      },
    });

    const report = await ingestCatalogue({
      sources: [
        makeSource({
          listings: [
            {
              marketplaceId: 'amazon',
              externalId: 'sku-1',
              title: 'Sony WH-1000XM5 Headphones (2026 listing)',
              url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
              brand: 'Sony',
              specifications: {},
            },
          ],
        }),
      ],
      store,
      matcher,
      now: () => new Date(NOW.getTime() + 60_000),
    });

    expect(report.status).toBe('completed');
    expect(report.respectedHumanDecisions).toBe(1);
    expect(report.updated).toBe(1);

    const after = await store.findListing(first?.id as string);
    expect(after?.title).toContain('2026 listing');
    expect(after?.canonicalProductId).toBe('sony-wh1000xm5');
    expect(after?.review?.decision).toBe('accepted');
    expect(after?.revision).toBe(1);
  });

  it('preserves a rejection across re-ingestion and matcher reruns', async () => {
    const store = createMemoryCatalogueStore();
    const adminStore = createMemoryAdminStore();
    const matcher = createIdentityMatcher({ store });
    const review = createReviewService({ store, adminStore, matcher, now: () => NOW });

    await store.upsertProducts(products());

    const source = makeSource({
      listings: [
        {
          marketplaceId: 'amazon',
          externalId: 'sku-2',
          title: 'Sony WH-1000XM5 Wireless Headphones',
          url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
          brand: 'Sony',
          specifications: {},
        },
      ],
    });

    await ingestCatalogue({ sources: [source], store, matcher, now: () => NOW });
    const listing = (await store.findListing(
      listingKey({ sourceId: source.id, marketplaceId: 'amazon', externalId: 'sku-2' }),
    )) as StoredListing;

    await review.decide({
      listingId: listing.id,
      action: 'reject',
      actor: ACTOR,
      body: {
        canonicalProductId: 'sony-wh1000xm5',
        expectedRevision: 0,
        reason: 'this is a different generation',
      },
    });

    const report = await ingestCatalogue({
      sources: [source],
      store,
      matcher,
      now: () => new Date(NOW.getTime() + 120_000),
    });

    expect(report.created + report.updated + report.unchanged).toBe(1);
    const after = await store.findListing(listing.id);
    expect(after?.review?.decision).toBe('rejected');
    expect(after?.canonicalProductId).toBeNull();
  });
});
