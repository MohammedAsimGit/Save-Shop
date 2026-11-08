import { readFile } from 'node:fs/promises';

import {
  canonicalProductSchema,
  catalogueProductIdSchema,
  catalogueProvenanceSchema,
  catalogueStatusSchema,
  demoProducts,
  httpUrlSchema,
  isoDateTimeSchema,
  specificationsSchema,
  type CanonicalProduct,
} from '@smart-shopping/shared';
import { z } from 'zod';

/**
 * Catalogue sources.
 *
 * A source reports what a marketplace has *listed*; it never declares product
 * identity. Identity comes from the canonical catalogue and from the matcher.
 * Today the only sources are the local demo catalogue and a validated JSON file,
 * because no marketplace catalogue feed is authorised - adding one later means
 * writing one adapter, exactly like price sources.
 */

export const catalogueRecordSchema = z.object({
  /**
   * Optional identity claim, honoured only for sources the operator trusts to own
   * the catalogue (see `CatalogueSource.trustsCanonicalIds`). A marketplace feed
   * that is not trusted has this field ignored, never guessed at.
   */
  canonicalProductId: catalogueProductIdSchema.optional(),
  marketplaceId: z.string().min(1).max(80),
  /** The marketplace's own id for the item, as the source supplied it. */
  externalId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  url: httpUrlSchema,
  brand: z.string().min(1).max(80).optional(),
  model: z.string().max(80).optional(),
  mpn: z.string().max(40).optional(),
  gtin: z.string().max(14).optional(),
  specifications: specificationsSchema.default({}),
  imageUrl: httpUrlSchema.optional(),
  color: z.string().max(40).optional(),
  storageCapacity: z.string().max(20).optional(),
  lastObservedAt: isoDateTimeSchema.optional(),
});

export type CatalogueRecord = z.infer<typeof catalogueRecordSchema>;

/** A canonical product as a source may declare it (timestamps are ours). */
export const canonicalProductInputSchema = canonicalProductSchema
  .omit({ createdAt: true, updatedAt: true, isSample: true, provenance: true })
  .extend({
    status: catalogueStatusSchema.default('active'),
    provenance: catalogueProvenanceSchema.default('manual'),
    isSample: z.boolean().default(false),
  });

export type CanonicalProductInput = z.infer<typeof canonicalProductInputSchema>;

export interface CatalogueSourceResult {
  readonly products: readonly CanonicalProductInput[];
  readonly listings: readonly unknown[];
  readonly warnings: readonly string[];
}

export interface CatalogueSource {
  readonly id: string;
  readonly displayName: string;
  readonly kind: 'demo' | 'file' | 'authorized_provider';
  readonly provenance: CanonicalProduct['provenance'];
  readonly isSample: boolean;
  /**
   * True only for sources that own the catalogue (the demo catalogue and a local
   * operator file). Their optional `canonicalProductId` is treated as tier-0 proof.
   */
  readonly trustsCanonicalIds: boolean;
  read(): Promise<CatalogueSourceResult>;
}

/**
 * Demo catalogue source.
 *
 * Migrates the shared sample catalogue into canonical products and synthetic
 * listings. Nothing is invented here: every field comes from the catalogue the UI
 * already shows, identifiers are deliberately left empty because the demo never
 * had them, and every listing is marked as sample data.
 */
export function createDemoCatalogueSource(): CatalogueSource {
  return {
    id: 'demo-catalog',
    displayName: 'SaveShop demo catalogue',
    kind: 'demo',
    provenance: 'demo',
    isSample: true,
    // The sample catalogue *is* the seed of the canonical catalogue, so its own ids
    // are authoritative. No other source gets that privilege by default.
    trustsCanonicalIds: true,

    async read(): Promise<CatalogueSourceResult> {
      const products: CanonicalProductInput[] = demoProducts.map((product) => ({
        id: product.id,
        name: product.title,
        brand: product.brand,
        category: product.category,
        specifications: {},
        variantOf: null,
        variantAttributes: {},
        imageUrls: [],
        status: 'active',
        provenance: 'demo',
        isSample: true,
      }));

      const listings: CatalogueRecord[] = demoProducts.flatMap((product) =>
        product.offers.map((offer) => ({
          canonicalProductId: product.id,
          marketplaceId: offer.marketplaceId,
          // Synthetic by construction and visibly so: the demo catalogue is not a
          // marketplace and must never look like it returned a real item id.
          externalId: `demo:${product.id}:${offer.marketplaceId}`,
          title: product.title,
          url: `https://demo.saveshop.example/product/${product.id}`,
          brand: product.brand,
          specifications: {},
          lastObservedAt: new Date().toISOString(),
        })),
      );

      return {
        products,
        listings,
        warnings: ['Demo catalogue ingested as sample data: no identifiers were invented for it.'],
      };
    },
  };
}

const catalogueFileSchema = z.object({
  products: z.array(canonicalProductInputSchema).default([]),
  listings: z.array(z.unknown()).default([]),
});

/**
 * File-based catalogue source.
 *
 * The safe alternative to a public ingestion endpoint: a local operator validates a
 * JSON file and runs the CLI. Malformed records are reported per record, never
 * silently dropped.
 */
export function createFileCatalogueSource(path: string): CatalogueSource {
  return {
    id: `file:${path}`,
    displayName: `Catalogue file ${path}`,
    kind: 'file',
    provenance: 'manual',
    isSample: false,
    // A local file is written by the operator who runs the CLI, so an explicit id is
    // an instruction, not an untrusted claim.
    trustsCanonicalIds: true,

    async read(): Promise<CatalogueSourceResult> {
      const raw = await readFile(path, 'utf8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Catalogue file is not valid JSON: ${path}`);
      }

      const file = catalogueFileSchema.safeParse(parsed);
      if (!file.success) {
        const detail = file.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
        throw new Error(`Catalogue file does not match the schema: ${detail}`);
      }

      return {
        products: file.data.products,
        listings: file.data.listings,
        warnings: [],
      };
    },
  };
}
