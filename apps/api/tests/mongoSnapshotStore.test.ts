import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PriceSnapshotModel } from '../src/models/priceSnapshot.js';
import { createMongoSnapshotStore } from '../src/services/snapshots/mongoSnapshotStore.js';
import {
  DISABLED_SOURCE,
  SAMPLE_SOURCE,
  VERIFIED_SOURCE,
  makeSnapshot,
} from './helpers/snapshots.js';

/**
 * These tests run against a real MongoDB server (in-memory binary), not a mocked
 * driver, because the behaviour that matters - unique indexes, upsert semantics,
 * date ordering and index creation - only exists in the database.
 *
 * No external MongoDB or credential is required: `mongodb-memory-server` starts a
 * throwaway `mongod` for the file. The first run downloads the binary.
 */

let server: MongoMemoryServer;

const store = createMongoSnapshotStore();
const NOW = new Date('2026-11-07T06:00:00.000Z');
const SOURCES = [VERIFIED_SOURCE, SAMPLE_SOURCE, DISABLED_SOURCE];
const context = { sources: SOURCES, now: NOW, includeSampleSources: true };

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'saveshop-test' });
}, 180_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
}, 60_000);

beforeEach(async () => {
  await PriceSnapshotModel.deleteMany({});
});

describe('PriceSnapshot model', () => {
  it('creates the indexes history and idempotent ingestion rely on', async () => {
    await PriceSnapshotModel.createIndexes();
    const indexes = await PriceSnapshotModel.collection.indexes();
    const byName = new Map(indexes.map((index) => [index.name, index]));

    expect(byName.get('observationKey_1')?.unique).toBe(true);
    expect(byName.has('productId_1_capturedAt_1')).toBe(true);
    expect(byName.has('productId_1_sourceId_1_capturedAt_1')).toBe(true);
    expect(byName.has('productId_1_marketplaceId_1_capturedAt_1')).toBe(true);
    expect(byName.has('expiresAt_1')).toBe(true);
  });

  it('never installs a TTL index on history', async () => {
    await PriceSnapshotModel.createIndexes();
    const indexes = await PriceSnapshotModel.collection.indexes();

    // Retention is a documented job; a TTL index would silently delete history.
    expect(indexes.some((index) => 'expireAfterSeconds' in index)).toBe(false);
  });
});

describe('createMongoSnapshotStore', () => {
  it('persists observations with source provenance intact', async () => {
    const result = await store.saveMany(
      [makeSnapshot({ capturedAt: '2026-11-07T05:00:00.000Z' })],
      context,
    );
    expect(result).toEqual({ stored: 1, duplicates: 0, rejected: 0, skippedSample: 0 });

    const stored = await PriceSnapshotModel.findOne({}).lean();
    expect(stored?.price.amountMinor).toBe(2_699_000);
    expect(stored?.price.currency).toBe('INR');
    expect(stored?.capturedAt.toISOString()).toBe('2026-11-07T05:00:00.000Z');
    expect(stored?.expiresAt.toISOString()).toBe('2026-11-07T06:00:00.000Z');
    expect(stored?.sourceVerification).toBe('verified');
    expect(stored?.isSample).toBe(false);
    expect(stored?.attribution.label).toBe('Test verified source');
    expect(stored?.observationKey).toHaveLength(64);
  });

  it('is idempotent: replaying the same observation inserts nothing new', async () => {
    const snapshot = makeSnapshot({ capturedAt: '2026-11-07T05:00:00.000Z' });

    const first = await store.saveMany([snapshot], context);
    const second = await store.saveMany([snapshot], context);

    expect(first.stored).toBe(1);
    expect(second.stored).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(await PriceSnapshotModel.countDocuments({})).toBe(1);
  });

  it('keeps distinct captures of the same price as separate observations', async () => {
    await store.saveMany(
      [
        makeSnapshot({ capturedAt: '2026-11-06T05:00:00.000Z' }),
        makeSnapshot({ capturedAt: '2026-11-07T05:00:00.000Z' }),
      ],
      context,
    );

    expect(await PriceSnapshotModel.countDocuments({})).toBe(2);
  });

  it('returns history oldest first, with the newest points when limited', async () => {
    await store.saveMany(
      [
        makeSnapshot({
          capturedAt: '2026-11-04T05:00:00.000Z',
          price: { amountMinor: 3_000_000, currency: 'INR' },
        }),
        makeSnapshot({
          capturedAt: '2026-11-06T05:00:00.000Z',
          price: { amountMinor: 2_800_000, currency: 'INR' },
        }),
        makeSnapshot({
          capturedAt: '2026-11-05T05:00:00.000Z',
          price: { amountMinor: 2_900_000, currency: 'INR' },
        }),
      ],
      context,
    );

    const all = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
      limit: 50,
    });
    expect(all.map((entry) => entry.snapshot.price.amountMinor)).toEqual([
      3_000_000, 2_900_000, 2_800_000,
    ]);

    const limited = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
      limit: 2,
    });
    expect(limited.map((entry) => entry.snapshot.price.amountMinor)).toEqual([
      2_900_000, 2_800_000,
    ]);
  });

  it('filters by product, window, source and marketplace', async () => {
    await store.saveMany(
      [
        makeSnapshot({ capturedAt: '2026-11-01T05:00:00.000Z' }),
        makeSnapshot({ capturedAt: '2026-11-06T05:00:00.000Z' }),
        makeSnapshot({ capturedAt: '2026-11-06T06:00:00.000Z', sourceId: SAMPLE_SOURCE.id }),
        makeSnapshot({
          capturedAt: '2026-11-06T07:00:00.000Z',
          marketplaceId: 'flipkart',
          price: { amountMinor: 2_500_000, currency: 'INR' },
        }),
        makeSnapshot({ productId: 'boAt-airdopes-141', capturedAt: '2026-11-06T08:00:00.000Z' }),
      ],
      context,
    );

    const recent = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-05T00:00:00.000Z'),
      to: NOW,
      limit: 50,
    });
    expect(recent).toHaveLength(3);

    const verified = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-05T00:00:00.000Z'),
      to: NOW,
      sourceId: VERIFIED_SOURCE.id,
      limit: 50,
    });
    expect(verified).toHaveLength(2);
    expect(verified.every((entry) => entry.isSample === false)).toBe(true);

    const flipkart = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-05T00:00:00.000Z'),
      to: NOW,
      marketplaceId: 'flipkart',
      limit: 50,
    });
    expect(flipkart).toHaveLength(1);
  });

  it('stores sample observations as sample and never as verified', async () => {
    await store.saveMany([makeSnapshot({ sourceId: SAMPLE_SOURCE.id })], context);

    const stored = await PriceSnapshotModel.findOne({}).lean();
    expect(stored?.sourceVerification).toBe('sample');
    expect(stored?.isSample).toBe(true);
  });

  it('rejects invalid and disabled-source observations before they reach MongoDB', async () => {
    const result = await store.saveMany(
      [
        makeSnapshot(),
        { productId: 'sony-wh1000xm5' },
        makeSnapshot({ sourceId: DISABLED_SOURCE.id }),
        makeSnapshot({ sourceId: 'ghost-source' }),
      ],
      context,
    );

    expect(result).toEqual({ stored: 1, duplicates: 0, rejected: 3, skippedSample: 0 });
    expect(await PriceSnapshotModel.countDocuments({})).toBe(1);
  });

  it('skips sample observations when demo persistence is disabled', async () => {
    const result = await store.saveMany([makeSnapshot({ sourceId: SAMPLE_SOURCE.id })], {
      ...context,
      includeSampleSources: false,
    });

    expect(result).toEqual({ stored: 0, duplicates: 0, rejected: 0, skippedSample: 1 });
    expect(await PriceSnapshotModel.countDocuments({})).toBe(0);
  });
});
