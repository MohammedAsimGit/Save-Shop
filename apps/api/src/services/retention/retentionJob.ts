import type { Logger } from 'pino';

import { OperationAbortedError } from '../../utils/abort.js';
import {
  dateKeyOf,
  utcDayBounds,
  type RollupDayResult,
  type RollupService,
} from '../rollups/rollupService.js';
import type { RollupStore } from '../rollups/rollupStore.js';
import type { SnapshotStore } from '../snapshots/snapshotStore.js';

/**
 * Retention / compaction job.
 *
 * The job is deliberately conservative, because it deletes data:
 *
 * 1. finish a day's daily rollup first;
 * 2. re-read the **persisted** rollups and verify they cover every raw group;
 * 3. only then delete that day's raw observations, in bounded batches.
 *
 * A day that fails verification is skipped and reported; nothing is deleted for
 * it. Deletion is day-scoped and idempotent, so the safe recovery from a crash is
 * simply to run the job again: already-compacted days have nothing left to roll
 * up, and remaining rows are removed. Rollups are insert-only, so a partially
 * deleted day can never shrink a committed aggregate.
 *
 * Runs are serialised within the process. This is not a scheduler: the job is
 * invoked manually (`npm run retention`), which avoids adding infrastructure.
 */

const DAY_MS = 86_400_000;

/** Upper bound on days handled in one run; keeps a manual run time-boxed. */
const MAX_DAYS_PER_RUN = 400;

export interface RetentionConfig {
  /** Raw observations older than this are compacted. */
  readonly rawRetentionDays: number;
  /** Rollups older than this are pruned. Must be at least `rawRetentionDays`. */
  readonly rollupRetentionDays: number;
  /** Documents per read/delete batch. */
  readonly batchSize: number;
  readonly dryRun: boolean;
}

export interface FailedDay {
  readonly dateKey: string;
  readonly reason: 'verification_failed' | 'error' | 'aborted';
  readonly detail?: string;
  readonly missingGroups?: number;
  readonly incompleteGroups?: number;
}

export interface RetentionReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  /** `aborted` still records what it did before the signal arrived. */
  readonly status: 'completed' | 'aborted';
  readonly dryRun: boolean;
  readonly rawRetentionDays: number;
  readonly rollupRetentionDays: number;
  readonly batchSize: number;
  readonly rawCutoff: string;
  readonly rollupCutoff: string;
  readonly dateRange: { readonly from: string; readonly to: string } | null;
  readonly daysProcessed: number;
  readonly daysCompacted: number;
  readonly observationsScanned: number;
  readonly rollupsPlanned: number;
  readonly rollupsInserted: number;
  readonly rollupsExisting: number;
  readonly observationsEligibleForDeletion: number;
  readonly observationsDeleted: number;
  readonly rollupsEligibleForDeletion: number;
  readonly rollupsDeleted: number;
  readonly failedDays: readonly FailedDay[];
  readonly aborted: boolean;
}

export interface RetentionJobOptions {
  readonly snapshotStore: SnapshotStore;
  readonly rollupStore: RollupStore;
  readonly rollupService: RollupService;
  readonly config: RetentionConfig;
  readonly now?: () => Date;
  readonly signal?: AbortSignal;
  readonly logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Persists the run for audit; failures here must not fail the job. */
  readonly recordRun?: (report: RetentionReport) => Promise<void>;
}

export class RetentionJobBusyError extends Error {
  constructor() {
    super('A retention run is already in progress in this process');
    this.name = 'RetentionJobBusyError';
  }
}

/** Single-process guard: overlapping runs would delete concurrently. */
let runActive = false;

export function isRetentionRunActive(): boolean {
  return runActive;
}

function assertConfig(config: RetentionConfig): void {
  if (config.rawRetentionDays < 1) throw new Error('rawRetentionDays must be at least 1');
  if (config.rollupRetentionDays < config.rawRetentionDays) {
    throw new Error('rollupRetentionDays must be at least rawRetentionDays');
  }
  if (config.batchSize < 1) throw new Error('batchSize must be at least 1');
}

export async function runRetentionJob(options: RetentionJobOptions): Promise<RetentionReport> {
  if (runActive) throw new RetentionJobBusyError();
  assertConfig(options.config);

  runActive = true;
  try {
    return await executeRun(options);
  } finally {
    runActive = false;
  }
}

async function executeRun(options: RetentionJobOptions): Promise<RetentionReport> {
  const clock = options.now ?? (() => new Date());
  const startedAt = clock();
  const { config } = options;

  const rawCutoff = new Date(startedAt.getTime() - config.rawRetentionDays * DAY_MS);
  const rollupCutoff = new Date(startedAt.getTime() - config.rollupRetentionDays * DAY_MS);
  const rollupCutoffKey = dateKeyOf(rollupCutoff);

  const failedDays: FailedDay[] = [];
  let observationsScanned = 0;
  let rollupsPlanned = 0;
  let rollupsInserted = 0;
  let rollupsExisting = 0;
  let observationsEligibleForDeletion = 0;
  let observationsDeleted = 0;
  let daysCompacted = 0;
  let aborted = false;
  let rangeFrom: string | null = null;
  let rangeTo: string | null = null;

  const candidates = await options.snapshotStore.listDaysBefore({
    cutoff: rawCutoff,
    limit: MAX_DAYS_PER_RUN,
  });

  for (const candidate of candidates) {
    if (options.signal?.aborted) {
      aborted = true;
      break;
    }

    const { start, end } = utcDayBounds(candidate.date);
    let rollupResult: RollupDayResult;

    try {
      rollupResult = await options.rollupService.rollupDay(candidate.date, {
        batchSize: config.batchSize,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (error instanceof OperationAbortedError) {
        aborted = true;
        failedDays.push({ dateKey: candidate.date, reason: 'aborted' });
        break;
      }
      options.logger?.error({ err: error, dateKey: candidate.date }, 'Rollup failed for day');
      failedDays.push({
        dateKey: candidate.date,
        reason: 'error',
        detail: error instanceof Error ? error.message : 'unknown error',
      });
      continue;
    }

    observationsScanned += rollupResult.observationsScanned;
    rollupsPlanned += rollupResult.groups;
    rollupsInserted += rollupResult.inserted;
    rollupsExisting += rollupResult.existing;
    rangeFrom ??= candidate.date;
    rangeTo = candidate.date;

    const verification = await options.rollupService.verifyDay(candidate.date, {
      batchSize: config.batchSize,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (!verification.ok) {
      options.logger?.warn(
        { ...verification, dateKey: candidate.date },
        'Rollup verification failed; skipping deletion for this day',
      );
      failedDays.push({
        dateKey: candidate.date,
        reason: 'verification_failed',
        missingGroups: verification.missingKeys.length,
        incompleteGroups: verification.incompleteKeys.length,
      });
      continue;
    }

    const eligible = await options.snapshotStore.countRange({ from: start, to: end });
    observationsEligibleForDeletion += eligible;

    if (config.dryRun) {
      options.logger?.info(
        { dateKey: candidate.date, eligible },
        'Dry run: day is rollup-verified and would be compacted',
      );
      continue;
    }

    let remaining = eligible;
    while (remaining > 0) {
      if (options.signal?.aborted) {
        aborted = true;
        break;
      }
      const deleted = await options.snapshotStore.deleteRange({
        from: start,
        to: end,
        limit: config.batchSize,
      });
      observationsDeleted += deleted;
      if (deleted === 0) break;
      remaining -= deleted;
    }

    daysCompacted += 1;
    options.logger?.info(
      { dateKey: candidate.date, eligible },
      'Day compacted into its daily rollup',
    );
    if (aborted) break;
  }

  // Rollup pruning: only aggregates far older than the raw window.
  const rollupsEligibleForDeletion = await options.rollupStore.countOlderThan(rollupCutoffKey);
  let rollupsDeleted = 0;

  if (!config.dryRun && !aborted && rollupsEligibleForDeletion > 0) {
    for (;;) {
      const deleted = await options.rollupStore.deleteOlderThan(rollupCutoffKey, config.batchSize);
      rollupsDeleted += deleted;
      if (deleted < config.batchSize) break;
    }
  }

  const dateRange = rangeFrom && rangeTo ? { from: rangeFrom, to: rangeTo } : null;

  const report: RetentionReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: clock().toISOString(),
    status: aborted ? 'aborted' : 'completed',
    dryRun: config.dryRun,
    rawRetentionDays: config.rawRetentionDays,
    rollupRetentionDays: config.rollupRetentionDays,
    batchSize: config.batchSize,
    rawCutoff: rawCutoff.toISOString(),
    rollupCutoff: rollupCutoff.toISOString(),
    dateRange,
    daysProcessed: dateRange ? countDays(dateRange) : 0,
    daysCompacted,
    observationsScanned,
    rollupsPlanned,
    rollupsInserted,
    rollupsExisting,
    observationsEligibleForDeletion,
    observationsDeleted,
    rollupsEligibleForDeletion,
    rollupsDeleted,
    failedDays,
    aborted,
  };

  if (options.recordRun) {
    try {
      await options.recordRun(report);
    } catch (error) {
      options.logger?.warn({ err: error }, 'Could not record the retention run');
    }
  }

  options.logger?.info(
    {
      status: report.status,
      dryRun: report.dryRun,
      daysProcessed: report.daysProcessed,
      daysCompacted,
      observationsScanned,
      rollupsInserted,
      observationsEligibleForDeletion,
      observationsDeleted,
      rollupsDeleted,
      failedDays: failedDays.length,
    },
    'Retention run finished',
  );

  return report;
}

function countDays(range: { readonly from: string; readonly to: string }): number {
  const from = Date.parse(`${range.from}T00:00:00.000Z`);
  const to = Date.parse(`${range.to}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.floor((to - from) / DAY_MS) + 1;
}
