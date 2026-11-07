import {
  comparisonStatusSchema,
  offerSnapshotSchema,
  marketSourceSchema,
  type ComparedOffer,
  type ComparisonResult,
  type ExcludedOffer,
  type MarketSource,
  type ProductComparisonResponse,
} from '../contracts/comparison.js';

/**
 * Comparison engine.
 *
 * Pure functions only: no network, no clock of its own, no catalogue. The same
 * code runs in the API (authoritative ranking) and can be reused by clients, so
 * web and mobile cannot disagree about which price is lowest.
 *
 * The engine never repairs data. A snapshot that does not parse is excluded with
 * a reason; a price in another currency is excluded rather than converted; a
 * stale observation is excluded rather than displayed as current.
 */

/** Timestamps this far in the future are treated as bad data, not as freshness. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

export interface CompareOffersParams {
  /** Raw snapshots, possibly untrusted. Each is validated here. */
  readonly snapshots: readonly unknown[];
  /** Known sources, keyed by id internally. Unknown source ids are excluded. */
  readonly sources: readonly MarketSource[];
  /** The currency offers are ranked in. Mismatches are excluded, never converted. */
  readonly currency: string;
  /** Injectable clock so tests are deterministic. */
  readonly now?: Date;
  readonly productId?: string;
}

interface ParsedSourceMap {
  readonly map: ReadonlyMap<string, MarketSource>;
}

function indexSources(sources: readonly MarketSource[]): ParsedSourceMap {
  const map = new Map<string, MarketSource>();
  for (const source of sources) {
    const parsed = marketSourceSchema.safeParse(source);
    // A malformed source is dropped: an unknown source must not be able to
    // promote its data to "verified" or to appear in coverage.
    if (parsed.success) map.set(parsed.data.id, parsed.data);
  }
  return { map };
}

function describeReason(reason: ExcludedOffer['reason']): string {
  switch (reason) {
    case 'invalid':
      return 'Snapshot did not match the price contract';
    case 'unknown_source':
      return 'The reporting source is not registered';
    case 'stale':
      return 'The observation is older than its TTL';
    case 'unavailable':
      return 'The offer is not in stock';
    case 'currency_mismatch':
      return 'Price is in a different currency';
    case 'future_timestamp':
      return 'Observation timestamp is in the future';
  }
}

/**
 * Ranks offers for one product.
 *
 * Order of operations matters: validity, then currency, then freshness, then
 * stock. Out-of-stock prices are shown nowhere in the ranking - they are
 * reported in `excluded` so a caller can explain why a marketplace is missing.
 */
export function compareOffers(params: CompareOffersParams): ComparisonResult {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const { map } = indexSources(params.sources);

  const eligible: ComparedOffer[] = [];
  const excluded: ExcludedOffer[] = [];

  for (const raw of params.snapshots) {
    const parsed = offerSnapshotSchema.safeParse(raw);

    if (!parsed.success) {
      excluded.push({
        reason: 'invalid',
        detail: parsed.error.issues[0]?.message,
        snapshot: raw,
      });
      continue;
    }

    const snapshot = parsed.data;

    if (params.productId && snapshot.productId !== params.productId) {
      excluded.push({
        reason: 'invalid',
        detail: 'Snapshot belongs to a different product',
        snapshot,
      });
      continue;
    }

    const source = map.get(snapshot.sourceId);
    if (!source) {
      excluded.push({
        reason: 'unknown_source',
        detail: describeReason('unknown_source'),
        snapshot,
      });
      continue;
    }

    if (snapshot.price.currency !== params.currency) {
      excluded.push({
        reason: 'currency_mismatch',
        detail: describeReason('currency_mismatch'),
        snapshot,
      });
      continue;
    }

    const capturedMs = Date.parse(snapshot.capturedAt);
    if (capturedMs - nowMs > FUTURE_TOLERANCE_MS) {
      excluded.push({
        reason: 'future_timestamp',
        detail: describeReason('future_timestamp'),
        snapshot,
      });
      continue;
    }

    const expiresMs = capturedMs + snapshot.ttlSeconds * 1000;
    if (expiresMs < nowMs) {
      excluded.push({ reason: 'stale', detail: describeReason('stale'), snapshot });
      continue;
    }

    if (snapshot.availability !== 'in_stock') {
      excluded.push({ reason: 'unavailable', detail: describeReason('unavailable'), snapshot });
      continue;
    }

    eligible.push({
      ...snapshot,
      source,
      freshness: 'fresh',
      isLowest: false,
      isVerified: source.verification === 'verified',
    });
  }

  // Cheapest first; ties break on the freshest observation, then marketplace id,
  // so repeated calls with the same input always produce the same order.
  eligible.sort((a, b) => {
    if (a.price.amountMinor !== b.price.amountMinor) {
      return a.price.amountMinor - b.price.amountMinor;
    }
    const capturedDiff = Date.parse(b.capturedAt) - Date.parse(a.capturedAt);
    if (capturedDiff !== 0) return capturedDiff;
    return a.marketplaceId.localeCompare(b.marketplaceId);
  });

  const ranked = eligible.map((offer, index) => ({ ...offer, isLowest: index === 0 }));
  const lowest = ranked[0] ?? null;
  const lowestVerified = ranked.find((offer) => offer.isVerified) ?? null;

  const status = lowestVerified ? 'verified' : ranked.length > 0 ? 'sample_only' : 'no_offers';

  const notices: string[] = [];
  if (status === 'sample_only') {
    notices.push('Every eligible offer comes from a sample source and is not a live price.');
  }
  if (status === 'no_offers') {
    notices.push('No eligible offer is available for this product right now.');
  }
  const staleCount = excluded.filter((entry) => entry.reason === 'stale').length;
  if (staleCount > 0) {
    notices.push(
      `${staleCount} observation${staleCount === 1 ? '' : 's'} exceeded the source freshness limit and ${staleCount === 1 ? 'was' : 'were'} not shown as current.`,
    );
  }

  return {
    productId: params.productId ?? lowest?.productId ?? ranked[0]?.productId ?? '',
    currency: params.currency,
    generatedAt: now.toISOString(),
    lowest,
    lowestVerified,
    offers: ranked,
    excluded,
    status: comparisonStatusSchema.parse(status),
    sources: [...params.sources],
    notices,
  };
}

/** Joins a comparison with the product identity it describes. */
export function withProduct(
  result: ComparisonResult,
  product: ProductComparisonResponse['product'],
): ProductComparisonResponse {
  return { ...result, product };
}
