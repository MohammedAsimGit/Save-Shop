import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { ensureModelIndexes } from '../../../src/models/index.js';

/**
 * Real MongoDB replica-set harness.
 *
 * Transactions require a replica set, so these tests may not run against a
 * standalone server. Two modes:
 *
 * - default: `mongodb-memory-server` starts a throwaway single-node replica set
 *   (no external service, no credentials);
 * - `MONGODB_TEST_URI`: an existing transactional deployment (for example a Docker
 *   replica set in CI).
 *
 * Safety rules are deliberate: the suite never reads the development/production
 * `MONGODB_URI`, refuses to run when `NODE_ENV=production`, requires a database name
 * containing "test", and refuses a non-loopback host unless
 * `MONGODB_TEST_ALLOW_REMOTE=1` is set explicitly.
 */

export const TEST_DATABASE_NAME = 'saveshop_merge_integration_test';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function connectedDatabase(): NonNullable<typeof mongoose.connection.db> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongoose is not connected to a database.');
  return db;
}

export interface TestDatabase {
  readonly uri: string;
  readonly databaseName: string;
  stop(): Promise<void>;
}

function databaseNameFromUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return name.length > 0 ? name : null;
  } catch {
    throw new Error(
      `MONGODB_TEST_URI is not a valid MongoDB connection string. Refusing to run against it.`,
    );
  }
}

/** Guard used before every destructive operation. */
export function assertSafeDatabaseName(databaseName: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Replica-set merge tests must never run with NODE_ENV=production.');
  }

  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to use database "${databaseName}": the database name must contain "test" so the suite cannot touch development or production data.`,
    );
  }
}

/** Fails loudly instead of ever pointing the destructive setup at real data. */
export function assertSafeTestDatabase(uri: string, databaseName: string): void {
  assertSafeDatabaseName(databaseName);

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('The test database URI is not a valid MongoDB connection string.');
  }

  if (!LOOPBACK_HOSTS.has(parsed.hostname) && process.env.MONGODB_TEST_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Refusing to use non-loopback MongoDB host "${parsed.hostname}". Set MONGODB_TEST_ALLOW_REMOTE=1 only for a dedicated CI test cluster.`,
    );
  }

  if (!parsed.searchParams.get('replicaSet')) {
    throw new Error(
      'The test database URI must name a replica set (for example ?replicaSet=rs0); transactions are required and must not be skipped.',
    );
  }
}

/**
 * Starts (or connects to) a transactional MongoDB and creates the indexes the
 * persistence layer relies on. Repeated calls in one process reuse the connection.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const externalUri = process.env.MONGODB_TEST_URI?.trim();
  let memoryReplicaSet: MongoMemoryReplSet | null = null;
  let uri: string;
  let databaseName: string;

  if (externalUri) {
    databaseName = databaseNameFromUri(externalUri) ?? TEST_DATABASE_NAME;
    assertSafeTestDatabase(externalUri, databaseName);
    uri = externalUri;
  } else {
    memoryReplicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger', name: 'saveshop-merge-rs' },
    });
    databaseName = TEST_DATABASE_NAME;
    uri = memoryReplicaSet.getUri(databaseName);
    assertSafeTestDatabase(uri, databaseName);
  }

  await mongoose.connect(uri, { dbName: databaseName });

  const hello = await connectedDatabase().admin().command({ hello: 1 });
  if (!hello.setName) {
    throw new Error(
      `Connected MongoDB at ${uri} is not a replica set, so transactions would be skipped. Refusing to run.`,
    );
  }

  await ensureModelIndexes();

  return {
    uri,
    databaseName,
    async stop() {
      await mongoose.disconnect();
      await memoryReplicaSet?.stop();
    },
  };
}

/**
 * Empties every collection but keeps the indexes, so each test starts from a known
 * state without repeating replica-set startup.
 */
export async function resetTestDatabase(databaseName: string): Promise<void> {
  assertSafeDatabaseName(databaseName);

  const collections = await connectedDatabase().collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}
