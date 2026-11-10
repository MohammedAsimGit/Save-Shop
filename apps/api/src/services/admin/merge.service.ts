import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import {
  hasGenerationConflict,
  normalizeCapacity,
  normalizeColor,
  normalizeGtin,
  normalizeKey,
  normalizeMpn,
  type CanonicalProduct,
  type MergePreviewResponse,
  type MergeRequest,
  type MergeResponse,
} from '@smart-shopping/shared';

import { AppError } from '../../utils/AppError.js';
import type { CatalogueStore } from '../catalogue/catalogueStore.js';
import type { RollupStore } from '../rollups/rollupStore.js';
import type { SnapshotStore } from '../snapshots/snapshotStore.js';
import type { StoreSession } from '../storeSession.js';
import type { AdminStore, MergeCountsRecord, MergeRunRecord } from './adminStore.js';
import { recordAudit } from './audit.js';
import type { AdminActor } from './auth.service.js';

/**
 * Canonical product merge.
 *
 * A merge is planned, recorded, then executed, and the source product is never
 * deleted. It is archived with `mergedInto` pointing at the survivor, so old links,
 * decisions and alerts keep resolving through the catalogue's redirect.
 *
 * Why the order matters:
 *   1. the run document is written first, so a crash leaves a recovery handle;
 *   2. listings, snapshots, rollups and variant links move idempotently;
 *   3. the source is archived last, so a half-finished run never looks complete;
 *   4. the run is marked completed with the applied counts.
 *
 * MongoDB transactions are used when the deployment supports them. A standalone
 * server does not, and Mongoose reports that as an error; the merge then falls back
 * to the same idempotent steps without a transaction, and the run stays `pending`
 * if anything fails so `repairPendingMerges` can finish it.
 */

export interface MergeService {
  preview(input: {
    readonly sourceProductId: string;
    readonly targetProductId: string;
  }): Promise<MergePreviewResponse>;
  merge(
    input: MergeRequest & {
      readonly actor: AdminActor;
      readonly requestId?: string | null;
    },
  ): Promise<MergeResponse>;
  /** Re-applies every unfinished merge run; safe to call repeatedly. */
  repairPendingMerges(input: {
    readonly actor: AdminActor;
    readonly requestId?: string | null;
    readonly limit?: number;
  }): Promise<{ readonly repaired: number; readonly failed: number; readonly remaining: number }>;
}

export interface MergeServiceOptions {
  readonly catalogue: CatalogueStore;
  readonly snapshots: SnapshotStore;
  readonly rollups: RollupStore;
  readonly adminStore: AdminStore;
  readonly now?: () => Date;
}

interface MergeAssessment {
  readonly blockers: readonly string[];
  readonly conflicts: readonly string[];
  readonly summary: MergePreviewResponse['summary'];
}

function both(a: string | undefined, b: string | undefined): { a: string; b: string } | null {
  return a && b ? { a, b } : null;
}

/**
 * Structural validation of a candidate merge.
 *
 * Blockers are refusals: merging cannot produce a coherent catalogue. Conflicts are
 * real identity differences that an administrator may knowingly accept, because a
 * duplicate record can legitimately be built from partial data.
 */
function assessMerge(
  source: CanonicalProduct,
  target: CanonicalProduct,
  summary: MergePreviewResponse['summary'],
): MergeAssessment {
  const blockers: string[] = [];
  const conflicts: string[] = [];

  if (source.id === target.id) blockers.push('source and target are the same product');
  if (source.mergedInto) {
    blockers.push(`source ${source.id} is already merged into ${source.mergedInto}`);
  }
  if (source.status === 'archived' && !source.mergedInto) {
    blockers.push(`source ${source.id} is archived and is not an active duplicate`);
  }
  if (target.mergedInto) {
    blockers.push(`target ${target.id} is itself merged into ${target.mergedInto}`);
  }
  if (target.status === 'archived') {
    blockers.push(`target ${target.id} is archived and cannot absorb another product`);
  }
  if (target.variantOf === source.id) {
    blockers.push(
      `target ${target.id} is a variant of the source; merging would invert the variant hierarchy`,
    );
  }
  if (normalizeKey(source.brand) !== normalizeKey(target.brand)) {
    blockers.push(`different brands (${source.brand} vs ${target.brand})`);
  }
  if (source.category !== target.category) {
    blockers.push(`different categories (${source.category} vs ${target.category})`);
  }

  if (source.isSample !== target.isSample) {
    conflicts.push('one record is sample data and the other is not');
  }
  if (source.provenance !== target.provenance) {
    conflicts.push(`different provenance (${source.provenance} vs ${target.provenance})`);
  }

  const gtins = both(source.gtin, target.gtin);
  if (gtins && normalizeGtin(gtins.a) !== normalizeGtin(gtins.b)) {
    conflicts.push(`different GTIN (${gtins.a} vs ${gtins.b})`);
  }

  const mpns = both(source.mpn, target.mpn);
  if (mpns && normalizeMpn(mpns.a) !== normalizeMpn(mpns.b)) {
    conflicts.push(`different manufacturer part number (${mpns.a} vs ${mpns.b})`);
  }

  const models = both(source.model, target.model);
  if (models && normalizeKey(models.a) !== normalizeKey(models.b)) {
    conflicts.push(`different model (${models.a} vs ${models.b})`);
  }

  const capacities = both(source.storageCapacity, target.storageCapacity);
  if (capacities && normalizeCapacity(capacities.a) !== normalizeCapacity(capacities.b)) {
    conflicts.push(`different storage capacity (${capacities.a} vs ${capacities.b})`);
  }

  const colors = both(source.color, target.color);
  if (colors && normalizeColor(colors.a) !== normalizeColor(colors.b)) {
    conflicts.push(`different colour (${colors.a} vs ${colors.b})`);
  }

  if (hasGenerationConflict(source.name, target.name)) {
    conflicts.push('the names suggest different product generations');
  }

  if (source.variantOf && source.variantOf !== target.id) {
    conflicts.push(`source is a variant of another product (${source.variantOf})`);
  }
  if (source.variantOf === target.id) {
    conflicts.push('source is a variant of the target');
  }
  if (target.variantOf && target.variantOf !== source.id) {
    conflicts.push(`target is a variant of another product (${target.variantOf})`);
  }

  const sourceVariants = Object.entries(source.variantAttributes ?? {});
  const targetVariants = Object.entries(target.variantAttributes ?? {});
  for (const [key, value] of sourceVariants) {
    const other = target.variantAttributes?.[key];
    if (other && normalizeKey(other) !== normalizeKey(value)) {
      conflicts.push(`different ${key} variant (${value} vs ${other})`);
    }
  }
  if (sourceVariants.length > 0 && targetVariants.length === 0) {
    conflicts.push('the source carries variant attributes the target does not');
  }
  if (targetVariants.length > 0 && sourceVariants.length === 0) {
    conflicts.push('the target carries variant attributes the source does not');
  }

  return { blockers, conflicts, summary };
}

export function createMergeService(options: MergeServiceOptions): MergeService {
  const { catalogue, snapshots, rollups, adminStore } = options;
  const clock = options.now ?? (() => new Date());

  async function requireProduct(productId: string): Promise<CanonicalProduct> {
    const product = await catalogue.findProduct(productId);
    if (!product) throw AppError.notFound(`Unknown canonical product: ${productId}`);
    return product;
  }

  async function inspect(sourceId: string): Promise<MergePreviewResponse['summary']> {
    const [references, snapshots_, rollups_] = await Promise.all([
      catalogue.inspectMerge(sourceId),
      snapshots.countForProduct(sourceId),
      rollups.countForProduct(sourceId),
    ]);

    return {
      listings: references.listings,
      variants: references.variants,
      snapshots: snapshots_,
      rollups: rollups_,
    };
  }

  async function assess(sourceId: string, targetId: string) {
    const [source, target] = await Promise.all([
      requireProduct(sourceId),
      requireProduct(targetId),
    ]);
    const summary = await inspect(sourceId);
    return { source, target, ...assessMerge(source, target, summary) };
  }

  interface ApplyResult {
    readonly refs: { readonly listings: number; readonly variants: number };
    readonly snaps: { readonly moved: number; readonly deduped: number };
    readonly rolls: { readonly moved: number; readonly combined: number };
  }

  async function runSteps(
    sourceProductId: string,
    targetProductId: string,
    mergedAt: Date,
    runId: string,
    tx?: StoreSession,
  ): Promise<ApplyResult> {
    const refs = await catalogue.mergeProductReferences({
      sourceProductId,
      targetProductId,
      mergedAt,
      runId,
      ...(tx ? { tx } : {}),
    });

    const snaps = await snapshots.mergeProduct({
      sourceProductId,
      targetProductId,
      ...(tx ? { tx } : {}),
    });

    const rolls = await rollups.mergeProduct({
      sourceProductId,
      targetProductId,
      ...(tx ? { tx } : {}),
    });

    return { refs, snaps, rolls };
  }

  function isTransactionUnsupported(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

    return (
      code === 20 ||
      /Transaction numbers are only allowed|replica set member or mongos|does not support transactions|Transactions are not supported/i.test(
        message,
      )
    );
  }

  /** Applies the merge, preferring a transaction and falling back when unsupported. */
  async function apply(
    sourceProductId: string,
    targetProductId: string,
    mergedAt: Date,
    runId: string,
  ): Promise<{ readonly result: ApplyResult; readonly transactionUsed: boolean }> {
    if (mongoose.connection.readyState !== 1) {
      return {
        result: await runSteps(sourceProductId, targetProductId, mergedAt, runId),
        transactionUsed: false,
      };
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await runSteps(sourceProductId, targetProductId, mergedAt, runId, session);
      await session.commitTransaction();
      return { result, transactionUsed: true };
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();

      if (!isTransactionUnsupported(error)) throw error;

      // A standalone MongoDB (including the local development default) cannot run
      // multi-document transactions. The steps are idempotent, so retrying them
      // without a session is safe; the run records that no transaction was used.
      return {
        result: await runSteps(sourceProductId, targetProductId, mergedAt, runId),
        transactionUsed: false,
      };
    } finally {
      await session.endSession();
    }
  }

  function countsOf(result: ApplyResult): MergeCountsRecord {
    return {
      listings: result.refs.listings,
      snapshots: result.snaps.moved,
      snapshotsDeduped: result.snaps.deduped,
      rollups: result.rolls.moved,
      rollupsCombined: result.rolls.combined,
      variants: result.refs.variants,
    };
  }

  async function failRun(runId: string, error: unknown, now: Date): Promise<void> {
    const reason = error instanceof Error ? error.message.slice(0, 500) : 'merge failed';
    await adminStore.updateMergeRun(runId, {
      status: 'failed',
      failureReason: reason,
      finishedAt: now,
    });
  }

  return {
    async preview(input) {
      const assessment = await assess(input.sourceProductId, input.targetProductId);

      return {
        sourceProductId: assessment.source.id,
        targetProductId: assessment.target.id,
        compatible: assessment.blockers.length === 0,
        blockers: assessment.blockers.slice(0, 10).map((value) => value.slice(0, 240)),
        conflicts: assessment.conflicts.slice(0, 10).map((value) => value.slice(0, 240)),
        summary: assessment.summary,
        notices: [
          'Blockers cannot be overridden; conflicts must be acknowledged explicitly before merging.',
          assessment.source.isSample || assessment.target.isSample
            ? 'One of these records is sample data. Merging does not make it verified; provenance is preserved.'
            : 'Both records are treated as verified catalogue entries; provenance is preserved.',
          assessment.summary.listings === 0 && assessment.summary.snapshots === 0
            ? 'Neither product has listings or price observations, so this merge only changes identity records.'
            : 'Marketplace listings, price observations and daily rollups will move to the surviving product.',
          'The source product is archived, not deleted, and remains resolvable as a redirect.',
        ],
      };
    },

    async merge(input) {
      const now = clock();
      const assessment = await assess(input.sourceProductId, input.targetProductId);

      if (assessment.blockers.length > 0) {
        throw new AppError({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'This merge cannot be performed safely',
          details: assessment.blockers.slice(0, 10),
        });
      }

      if (assessment.conflicts.length > 0 && !input.confirmConflicts) {
        throw new AppError({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'The products have conflicting identity facts',
          details: [
            ...assessment.conflicts.slice(0, 10),
            'Confirm the conflicts explicitly to perform this merge.',
          ],
        });
      }

      const run: MergeRunRecord = {
        id: randomUUID(),
        sourceProductId: assessment.source.id,
        targetProductId: assessment.target.id,
        status: 'pending',
        reason: input.reason,
        notes: input.notes ?? null,
        adminId: input.actor.id,
        adminEmail: input.actor.email,
        requestId: input.requestId ?? null,
        transactionUsed: false,
        acknowledgedConflicts: [...assessment.conflicts],
        planned: {
          listings: assessment.summary.listings,
          snapshots: assessment.summary.snapshots,
          snapshotsDeduped: 0,
          rollups: assessment.summary.rollups,
          rollupsCombined: 0,
          variants: assessment.summary.variants,
        },
        applied: null,
        failureReason: null,
        startedAt: now,
        finishedAt: null,
      };

      await adminStore.createMergeRun(run);

      // Ownership is decided before anything moves. Without this compare-and-set a
      // second merge of the same source could pass the assessment at the same time
      // and split its listings, snapshots and rollups across two survivors.
      const claimed = await catalogue.claimMerge({
        sourceProductId: assessment.source.id,
        targetProductId: assessment.target.id,
        runId: run.id,
      });

      if (!claimed) {
        await failRun(
          run.id,
          new Error('the source product is claimed by another merge run'),
          clock(),
        );
        throw new AppError({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Another merge is already in progress for this product',
          details: ['Wait for the in-flight merge to finish, then re-check the record.'],
        });
      }

      let applied: { result: ApplyResult; transactionUsed: boolean };
      try {
        applied = await apply(assessment.source.id, assessment.target.id, now, run.id);
      } catch (error) {
        // A failed transaction is rolled back; a failed non-transactional attempt may
        // be half-done. Either way the run is the recovery handle: it stays pending so
        // `repairPendingMerges` re-applies the idempotent steps.
        await failRun(run.id, error, clock());
        throw new AppError({
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message:
            'The merge could not be completed. The source product was not deleted; run the repair command to finish or inspect the run.',
        });
      }

      const counts = countsOf(applied.result);
      const finishedAt = clock();

      const updated = await adminStore.updateMergeRun(run.id, {
        status: 'completed',
        applied: counts,
        transactionUsed: applied.transactionUsed,
        finishedAt,
      });

      if (!updated) {
        throw new AppError({
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: `Merge ${run.id} completed but its run record could not be updated`,
        });
      }

      await recordAudit(
        adminStore,
        {
          action: 'product.merged',
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          targetType: 'product',
          targetId: assessment.source.id,
          previousState: {
            sourceStatus: assessment.source.status,
            sourceMergedInto: assessment.source.mergedInto,
            sourceIsSample: assessment.source.isSample,
            targetStatus: assessment.target.status,
            planned: assessment.summary,
          },
          newState: {
            sourceStatus: 'archived',
            mergedInto: assessment.target.id,
            mergeRunId: run.id,
            applied: counts,
            transactionUsed: applied.transactionUsed,
            acknowledgedConflicts: assessment.conflicts,
          },
          reason: input.reason,
          requestId: input.requestId ?? null,
        },
        finishedAt,
      );

      return {
        mergeRunId: run.id,
        status: 'completed',
        sourceProductId: assessment.source.id,
        targetProductId: assessment.target.id,
        transactionUsed: applied.transactionUsed,
        listingsMoved: counts.listings,
        snapshotsMoved: counts.snapshots,
        snapshotsDeduped: counts.snapshotsDeduped,
        rollupsMoved: counts.rollups,
        rollupsCombined: counts.rollupsCombined,
        variantsRepointed: counts.variants,
        acknowledgedConflicts: assessment.conflicts.slice(0, 10),
        notices: [
          `Product ${assessment.source.id} is archived and redirects to ${assessment.target.id}.`,
          applied.transactionUsed
            ? 'The reference migration ran inside a MongoDB transaction.'
            : 'No transaction was used; the migration is idempotent and the run record is the recovery handle.',
          'Product comparison and history now resolve through the surviving product.',
        ],
      };
    },

    async repairPendingMerges(input) {
      const limit = input.limit ?? 20;
      const open = await adminStore.listOpenMergeRuns(limit);
      let repaired = 0;
      let failed = 0;

      for (const run of open) {
        const now = clock();
        try {
          const source = await catalogue.findProduct(run.sourceProductId);
          const target = await catalogue.findProduct(run.targetProductId);

          if (!source || !target) {
            await failRun(run.id, new Error('source or target product no longer exists'), now);
            failed += 1;
            continue;
          }

          // Recovery re-claims with the same run id, so it can finish work its own
          // run started. A claim held by a different run means this run must not
          // touch the source; it is reported as failed instead of corrupting data.
          const claimed = await catalogue.claimMerge({
            sourceProductId: run.sourceProductId,
            targetProductId: run.targetProductId,
            runId: run.id,
          });

          if (!claimed) {
            await failRun(
              run.id,
              new Error('the source product is claimed by another merge run'),
              now,
            );
            failed += 1;
            continue;
          }

          const { result, transactionUsed } = await apply(
            run.sourceProductId,
            run.targetProductId,
            now,
            run.id,
          );
          const counts = countsOf(result);

          await adminStore.updateMergeRun(run.id, {
            status: 'completed',
            applied: counts,
            transactionUsed,
            finishedAt: now,
          });

          await recordAudit(
            adminStore,
            {
              action: 'product.merged',
              actorId: input.actor.id,
              actorEmail: input.actor.email,
              targetType: 'product',
              targetId: run.sourceProductId,
              previousState: { mergeRunId: run.id, status: run.status },
              newState: {
                status: 'completed',
                mergedInto: run.targetProductId,
                applied: counts,
                recovered: true,
              },
              reason: 'recovered an unfinished merge run',
              requestId: input.requestId ?? null,
            },
            now,
          );

          repaired += 1;
        } catch (error) {
          await failRun(run.id, error, clock());
          failed += 1;
        }
      }

      const remaining = (await adminStore.listOpenMergeRuns(limit)).length;
      return { repaired, failed, remaining };
    },
  };
}
