import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { ensureModelIndexes } from '../models/index.js';
import { RetentionRunModel } from '../models/retentionRun.js';
import { runRetentionJob, type RetentionReport } from '../services/retention/retentionJob.js';
import { rollupService, rollupStore } from '../services/rollups/index.js';
import { createSnapshotStore } from '../services/snapshots/index.js';

/**
 * Manual retention / compaction run.
 *
 *   npm run retention --workspace @smart-shopping/api               # dry run
 *   npm run retention --workspace @smart-shopping/api -- --apply     # delete eligible rows
 *
 * Why a CLI and not a scheduler: the requirement is a safe, repeatable, manually
 * invoked job. A cron container, queue or scheduler would add operational surface
 * for a task that runs once a day at most.
 *
 * Safety:
 * - defaults to a **dry run**, so the first thing anyone runs cannot delete data;
 * - refuses to run without MongoDB, because compacting an in-memory store would
 *   report success for work that evaporates with the process;
 * - turns SIGINT/SIGTERM into a cooperative abort: the current batch finishes,
 *   the run is recorded, and the process exits without deleting a half-verified
 *   day.
 */

const HELP = `Save-Shop retention job

Usage: npm run retention -- [options]

Options:
  --apply                 Actually delete compacted observations (default: dry run)
  --dry-run               Report what would be deleted; no writes
  --raw-days=<n>          Full-resolution retention window in days
  --rollup-days=<n>       Daily rollup retention window in days
  --batch-size=<n>        Documents per read/delete batch
  --help                  Show this message

Defaults come from the validated environment:
  RETENTION_RAW_DAYS=${env.retention.rawRetentionDays}
  RETENTION_ROLLUP_DAYS=${env.retention.rollupRetentionDays}
  RETENTION_BATCH_SIZE=${env.retention.batchSize}
  RETENTION_DRY_RUN=${String(env.retention.dryRun)}
`;

interface CliOptions {
  readonly dryRun: boolean;
  readonly rawRetentionDays: number;
  readonly rollupRetentionDays: number;
  readonly batchSize: number;
  readonly help: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): CliOptions {
  let dryRun = env.retention.dryRun;
  let rawRetentionDays = env.retention.rawRetentionDays;
  let rollupRetentionDays = env.retention.rollupRetentionDays;
  let batchSize = env.retention.batchSize;
  let help = false;

  const numeric = (flag: string, value: string | undefined): number => {
    if (value === undefined || !/^\d+$/.test(value)) {
      throw new UsageError(`${flag} expects a positive integer, received "${value ?? ''}"`);
    }
    return Number(value);
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--apply') {
      dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--raw-days=')) {
      rawRetentionDays = numeric('--raw-days', arg.slice('--raw-days='.length));
      continue;
    }
    if (arg.startsWith('--rollup-days=')) {
      rollupRetentionDays = numeric('--rollup-days', arg.slice('--rollup-days='.length));
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      batchSize = numeric('--batch-size', arg.slice('--batch-size='.length));
      continue;
    }
    throw new UsageError(`Unknown option: ${arg}`);
  }

  if (rollupRetentionDays < rawRetentionDays) {
    throw new UsageError('--rollup-days must be greater than or equal to --raw-days');
  }

  return { dryRun, rawRetentionDays, rollupRetentionDays, batchSize, help };
}

/** Audit trail: a destructive job must be explainable after the terminal is gone. */
async function recordRun(report: RetentionReport): Promise<void> {
  await RetentionRunModel.create({
    startedAt: new Date(report.startedAt),
    finishedAt: new Date(report.finishedAt),
    dryRun: report.dryRun,
    status: report.status,
    rawRetentionDays: report.rawRetentionDays,
    rollupRetentionDays: report.rollupRetentionDays,
    batchSize: report.batchSize,
    rawCutoff: new Date(report.rawCutoff),
    rollupCutoff: new Date(report.rollupCutoff),
    dateRange: report.dateRange,
    stats: report,
    failedDays: [...report.failedDays],
  });
}

async function main(): Promise<number> {
  let options: CliOptions;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n\n${HELP}`);
      return 2;
    }
    throw error;
  }

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (!env.isDatabaseConfigured) {
    process.stderr.write(
      'Retention requires MongoDB: set MONGODB_URI in apps/api/.env. An in-memory store has no durable data to compact.\n',
    );
    return 2;
  }

  const connected = await connectDatabase();
  if (!connected) {
    process.stderr.write('Could not connect to MongoDB.\n');
    return 1;
  }

  await ensureModelIndexes();

  const controller = new AbortController();
  const abort = (signal: NodeJS.Signals): void => {
    if (controller.signal.aborted) return;
    logger.warn({ signal }, 'Aborting retention run after the current batch');
    controller.abort();
  };
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  try {
    const report = await runRetentionJob({
      snapshotStore: createSnapshotStore(),
      rollupStore,
      rollupService,
      config: {
        rawRetentionDays: options.rawRetentionDays,
        rollupRetentionDays: options.rollupRetentionDays,
        batchSize: options.batchSize,
        dryRun: options.dryRun,
      },
      signal: controller.signal,
      logger,
      recordRun,
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === 'aborted' ? 3 : 0;
  } finally {
    process.off('SIGINT', abort);
    process.off('SIGTERM', abort);
    await disconnectDatabase();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Retention run failed');
    process.exitCode = 1;
  });
