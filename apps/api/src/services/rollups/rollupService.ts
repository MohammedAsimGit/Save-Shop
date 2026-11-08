import type { Money } from '@smart-shopping/shared';

import { throwIfAborted } from '../../utils/abort.js';
import type { SnapshotStore, StoredSnapshot } from '../snapshots/snapshotStore.js';
import { rollupKey, type RollupRecord, type RollupStore } from './rollupStore.js';

/**
 * Daily rollup service.
 *
 * Aggregation lives here - not in controllers and not in Mongoose models - so it
 * can be tested with an in-memory store and reused by both the compaction job and
 * any future reprocessing tool.
 *
 * Invariants:
 * - only persisted observations are aggregated; nothing is estimated or carried
 *   forward from a neighbouring day;
 * - groups are split by product, source, marketplace, currency **and** provenance,
 *   so sample prices can never end up inside a verified aggregate;
 * - generation is insert-only by default, which makes repeated runs safe and stops
 *   a partial deletion from shrinking a committed rollup;
 * - verification compares the *persisted* rollups against the raw rows, and the
 *   retention job refuses to delete a day that fails that check.
 */

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface DayBounds {
  readonly start: Date;
  /** Exclusive end. */
  readonly end: Date;
}

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** UTC bounds for a `YYYY-MM-DD` key. Throws on anything that is not a real day. */
export function utcDayBounds(dateKey: string): DayBounds {
  if (!isDateKey(dateKey)) {
    throw new Error(`Invalid UTC date key: ${dateKey}`);
  }
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function dateKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DailyAggregate {
  readonly rollups: readonly RollupRecord[];
  readonly observationsScanned: number;
}

/**
 * Pure aggregation of one day's observations into per-group rollups.
 *
 * First/last are chosen by capture time (ties broken by observation key), so two
 * runs over the same rows always produce the same first/last price.
 */
export function aggregateDay(
  observations: readonly StoredSnapshot[],
  options: { readonly dateKey: string; readonly generatedAt: Date },
): DailyAggregate {
  const { start, end } = utcDayBounds(options.dateKey);

  // Defensive: the bounds must describe exactly this calendar day.
  if (dateKeyOf(new Date(end.getTime() - 1)) !== options.dateKey) {
    throw new Error(`Day bounds do not match date key: ${options.dateKey}`);
  }

  const ordered = [...observations].sort((a, b) => {
    const diff = Date.parse(a.snapshot.capturedAt) - Date.parse(b.snapshot.capturedAt);
    if (diff !== 0) return diff;
    return a.observationKey.localeCompare(b.observationKey);
  });

  const groups = new Map<string, RollupRecord>();

  for (const stored of ordered) {
    const snapshot = stored.snapshot;
    const capturedMs = Date.parse(snapshot.capturedAt);
    // Defensive: a caller cannot smuggle another day into this rollup.
    if (capturedMs < start.getTime() || capturedMs >= end.getTime()) continue;

    const key = rollupKey({
      productId: snapshot.productId,
      sourceId: snapshot.sourceId,
      marketplaceId: snapshot.marketplaceId,
      currency: snapshot.price.currency,
      sourceVerification: stored.sourceVerification,
      dateKey: options.dateKey,
    });

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        rollupKey: key,
        productId: snapshot.productId,
        sourceId: snapshot.sourceId,
        marketplaceId: snapshot.marketplaceId,
        currency: snapshot.price.currency,
        dateKey: options.dateKey,
        date: start,
        windowStart: start,
        windowEnd: end,
        minPrice: copyMoney(snapshot.price),
        maxPrice: copyMoney(snapshot.price),
        firstPrice: copyMoney(snapshot.price),
        lastPrice: copyMoney(snapshot.price),
        observationCount: 1,
        availabilityCounts: availabilityCounter(snapshot.availability),
        sourceVerification: stored.sourceVerification,
        isSample: stored.isSample,
        generatedAt: options.generatedAt,
      });
      continue;
    }

    const min = snapshot.price.amountMinor < existing.minPrice.amountMinor;
    const max = snapshot.price.amountMinor > existing.maxPrice.amountMinor;

    groups.set(key, {
      ...existing,
      minPrice: min ? copyMoney(snapshot.price) : existing.minPrice,
      maxPrice: max ? copyMoney(snapshot.price) : existing.maxPrice,
      // `ordered` is capture-ascending, so the running value stays the last one.
      lastPrice: copyMoney(snapshot.price),
      observationCount: existing.observationCount + 1,
      availabilityCounts: {
        ...existing.availabilityCounts,
        [availabilityBucket(snapshot.availability)]:
          existing.availabilityCounts[availabilityBucket(snapshot.availability)] + 1,
      },
    });
  }

  return { rollups: [...groups.values()], observationsScanned: ordered.length };
}

function copyMoney(money: Money): Money {
  return { amountMinor: money.amountMinor, currency: money.currency };
}

function availabilityCounter(
  availability: StoredSnapshot['snapshot']['availability'],
): RollupRecord['availabilityCounts'] {
  return {
    inStock: availability === 'in_stock' ? 1 : 0,
    outOfStock: availability === 'out_of_stock' ? 1 : 0,
    preorder: availability === 'preorder' ? 1 : 0,
    unknown: availability === 'unknown' ? 1 : 0,
  };
}

function availabilityBucket(
  availability: StoredSnapshot['snapshot']['availability'],
): keyof RollupRecord['availabilityCounts'] {
  switch (availability) {
    case 'in_stock':
      return 'inStock';
    case 'out_of_stock':
      return 'outOfStock';
    case 'preorder':
      return 'preorder';
    case 'unknown':
      return 'unknown';
  }
}

export interface RollupDayResult {
  readonly dateKey: string;
  readonly observationsScanned: number;
  readonly groups: number;
  readonly inserted: number;
  readonly existing: number;
  readonly refreshed: boolean;
  readonly deletedBeforeRefresh: number;
}

export interface DayVerification {
  readonly dateKey: string;
  readonly ok: boolean;
  readonly expectedGroups: number;
  readonly storedGroups: number;
  /** Group keys that have raw observations but no persisted rollup. */
  readonly missingKeys: readonly string[];
  /** Persisted rollups that are smaller than the raw data they should cover. */
  readonly incompleteKeys: readonly string[];
}

export interface RollupServiceOptions {
  readonly snapshotStore: SnapshotStore;
  readonly rollupStore: RollupStore;
  readonly now?: () => Date;
  readonly batchSize?: number;
}

export interface RollupService {
  rollupDay(
    dateKey: string,
    options?: {
      readonly refresh?: boolean;
      readonly batchSize?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<RollupDayResult>;
  verifyDay(
    dateKey: string,
    options?: { readonly signal?: AbortSignal; readonly batchSize?: number },
  ): Promise<DayVerification>;
  rollupRange(
    range: { readonly fromDate: string; readonly toDate: string },
    options?: {
      readonly refresh?: boolean;
      readonly batchSize?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<readonly RollupDayResult[]>;
}

export function createRollupService(options: RollupServiceOptions): RollupService {
  const clock = options.now ?? (() => new Date());
  const defaultBatchSize = options.batchSize ?? 1_000;

  /** Pages one UTC day of raw observations; the cursor prevents double counting. */
  async function loadDay(
    dateKey: string,
    batchSize: number,
    signal?: AbortSignal,
  ): Promise<StoredSnapshot[]> {
    const { start, end } = utcDayBounds(dateKey);
    const observations: StoredSnapshot[] = [];
    let after: { capturedAt: Date; observationKey: string } | undefined;

    for (;;) {
      throwIfAborted(signal);
      const page = await options.snapshotStore.listRange({
        from: start,
        to: end,
        limit: batchSize,
        ...(after ? { after } : {}),
      });

      observations.push(...page);
      if (page.length < batchSize) return observations;

      const last = page[page.length - 1];
      if (!last) return observations;
      after = {
        capturedAt: new Date(last.snapshot.capturedAt),
        observationKey: last.observationKey,
      };
    }
  }

  const service: RollupService = {
    async rollupDay(dateKey, dayOptions = {}) {
      const batchSize = dayOptions.batchSize ?? defaultBatchSize;
      const generatedAt = clock();
      const observations = await loadDay(dateKey, batchSize, dayOptions.signal);
      const { rollups } = aggregateDay(observations, { dateKey, generatedAt });

      if (rollups.length === 0) {
        // Nothing observed that day: never create an empty "zero price" rollup.
        return {
          dateKey,
          observationsScanned: observations.length,
          groups: 0,
          inserted: 0,
          existing: 0,
          refreshed: false,
          deletedBeforeRefresh: 0,
        };
      }

      if (dayOptions.refresh) {
        const result = await options.rollupStore.replaceDay(dateKey, rollups);
        return {
          dateKey,
          observationsScanned: observations.length,
          groups: rollups.length,
          inserted: result.inserted,
          existing: result.existing,
          refreshed: true,
          deletedBeforeRefresh: result.deleted,
        };
      }

      const result = await options.rollupStore.insertMany(rollups);
      return {
        dateKey,
        observationsScanned: observations.length,
        groups: rollups.length,
        inserted: result.inserted,
        existing: result.existing,
        refreshed: false,
        deletedBeforeRefresh: 0,
      };
    },

    async verifyDay(dateKey, verifyOptions = {}) {
      const batchSize = verifyOptions.batchSize ?? defaultBatchSize;
      const observations = await loadDay(dateKey, batchSize, verifyOptions.signal);
      const { rollups: expected } = aggregateDay(observations, {
        dateKey,
        generatedAt: clock(),
      });
      const stored = await options.rollupStore.listForDay(dateKey);
      const storedByKey = new Map(stored.map((rollup) => [rollup.rollupKey, rollup]));

      const missingKeys: string[] = [];
      const incompleteKeys: string[] = [];

      for (const expectedRollup of expected) {
        const storedRollup = storedByKey.get(expectedRollup.rollupKey);
        if (!storedRollup) {
          missingKeys.push(expectedRollup.rollupKey);
          continue;
        }

        // A stored rollup may cover *more* observations than remain (a deletion
        // that crashed halfway), which is safe. It may never cover fewer.
        const coversEnough =
          storedRollup.observationCount >= expectedRollup.observationCount &&
          storedRollup.minPrice.amountMinor <= expectedRollup.minPrice.amountMinor &&
          storedRollup.maxPrice.amountMinor >= expectedRollup.maxPrice.amountMinor;

        if (!coversEnough) incompleteKeys.push(expectedRollup.rollupKey);
      }

      return {
        dateKey,
        ok: missingKeys.length === 0 && incompleteKeys.length === 0,
        expectedGroups: expected.length,
        storedGroups: stored.length,
        missingKeys,
        incompleteKeys,
      };
    },

    async rollupRange(range, rangeOptions = {}) {
      const results: RollupDayResult[] = [];
      for (
        let cursor = utcDayBounds(range.fromDate).start;
        ;
        cursor = new Date(cursor.getTime() + DAY_MS)
      ) {
        const dateKey = dateKeyOf(cursor);
        if (dateKey > range.toDate) break;
        throwIfAborted(rangeOptions.signal);
        results.push(
          await service.rollupDay(dateKey, {
            ...(rangeOptions.refresh === undefined ? {} : { refresh: rangeOptions.refresh }),
            ...(rangeOptions.batchSize === undefined ? {} : { batchSize: rangeOptions.batchSize }),
            ...(rangeOptions.signal === undefined ? {} : { signal: rangeOptions.signal }),
          }),
        );
      }
      return results;
    },
  };

  return service;
}
