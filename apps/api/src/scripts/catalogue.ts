import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { ensureModelIndexes } from '../models/index.js';
import { CatalogueIngestionRunModel } from '../models/catalogueIngestionRun.js';
import {
  createDemoCatalogueSource,
  createFileCatalogueSource,
  type CatalogueSource,
} from '../services/catalogue/catalogueSource.js';
import { catalogueStore, identityMatcher } from '../services/catalogue/index.js';
import { ingestCatalogue, type IngestionReport } from '../services/catalogue/ingestion.service.js';

/**
 * Local catalogue CLI.
 *
 *   npm run catalogue -- seed-demo [--dry-run]
 *   npm run catalogue -- ingest --file=catalogue.json [--dry-run]
 *
 * Why a CLI and not an endpoint: there is no admin authentication in this project
 * yet, so a public ingestion endpoint would let anyone write product identity.
 * The CLI is the safe mechanism until authorisation exists, and it is the same
 * code path an authorised provider adapter will use later.
 */

const HELP = `Save-Shop catalogue ingestion

Usage: npm run catalogue -- <command> [options]

Commands:
  seed-demo              Ingest the sample catalogue as demo records
  ingest --file=<path>   Ingest canonical products and listings from a JSON file

Options:
  --dry-run              Validate and match without writing anything
  --help                 Show this message

The JSON file shape is { "products": [...], "listings": [...] }; records are
validated per item and rejected records are reported with a reason.
`;

interface CliOptions {
  readonly command: 'seed-demo' | 'ingest';
  readonly file?: string;
  readonly dryRun: boolean;
  readonly help: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): CliOptions {
  let command: CliOptions['command'] | undefined;
  let file: string | undefined;
  let dryRun = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--file=')) {
      file = arg.slice('--file='.length);
      continue;
    }
    if (arg === 'seed-demo' || arg === 'ingest') {
      command = arg;
      continue;
    }
    throw new UsageError(`Unknown argument: ${arg}`);
  }

  if (help) return { command: 'seed-demo', dryRun, help: true };
  if (!command) throw new UsageError('A command is required (seed-demo or ingest)');
  if (command === 'ingest' && !file) throw new UsageError('ingest requires --file=<path>');

  return {
    command,
    ...(file ? { file } : {}),
    dryRun,
    help: false,
  };
}

async function recordRun(report: IngestionReport): Promise<void> {
  await CatalogueIngestionRunModel.create({
    startedAt: new Date(report.startedAt),
    finishedAt: new Date(report.finishedAt),
    dryRun: report.dryRun,
    status: report.status,
    sources: [...report.sources],
    recordsRead: report.recordsRead,
    accepted: report.accepted,
    rejected: report.rejected,
    created: report.created,
    updated: report.updated,
    unchanged: report.unchanged,
    canonicalProductsInserted: report.canonicalProductsInserted,
    matches: report.matches,
    rejectedRecords: [...report.rejectedRecords],
    warnings: [...report.warnings],
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
      'Catalogue ingestion requires MongoDB: set MONGODB_URI in apps/api/.env. An in-memory catalogue has nothing durable to ingest into.\n',
    );
    return 2;
  }

  const connected = await connectDatabase();
  if (!connected) {
    process.stderr.write('Could not connect to MongoDB.\n');
    return 1;
  }

  await ensureModelIndexes();

  try {
    const sources: CatalogueSource[] =
      options.command === 'seed-demo'
        ? [createDemoCatalogueSource()]
        : [createFileCatalogueSource(options.file ?? '')];

    const report = await ingestCatalogue({
      sources,
      store: catalogueStore,
      matcher: identityMatcher,
      dryRun: options.dryRun,
      logger,
      recordRun: options.dryRun ? undefined : recordRun,
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === 'completed' ? 0 : 1;
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Catalogue ingestion failed');
    process.exitCode = 1;
  });
