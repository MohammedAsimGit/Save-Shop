import {
  detectAccessory,
  hasGenerationConflict,
  normalizeCapacity,
  normalizeColor,
  normalizeGtin,
  normalizeKey,
  normalizeMpn,
  titleSimilarity,
  tokenizeText,
  type CanonicalProduct,
  type ListingMatch,
  type MatchMethod,
  type MatchStatus,
} from '@smart-shopping/shared';

import type { CatalogueStore } from './catalogueStore.js';

/**
 * Product identity matching.
 *
 * Deterministic rules only, in the documented priority order:
 *
 *   1. GTIN/EAN/UPC            -> exact
 *   2. manufacturer part number -> strong
 *   3. brand + model            -> strong
 *   4. brand + model + variant  -> strong (highest non-identifier score)
 *   5. brand + title similarity -> possible (never auto-resolved)
 *
 * Hard rules (a "conflict" verdict, no automatic matching):
 * - two different GTINs, two different MPNs, or two different explicit models;
 * - different product generations ("XM4" vs "XM5") inferred from the titles;
 * - an accessory ("case for ...", "screen protector") is never the product;
 * - a stated capacity or colour that contradicts the canonical variant.
 *
 * `confidence` is a deterministic strength score (0-100) produced by the table in
 * `confidenceFor`, **not** a probability. No calibration exists, so nothing may
 * present it as "likely correct 95% of the time".
 */

export interface ListingIdentityHints {
  readonly title: string;
  readonly brand?: string;
  readonly model?: string;
  readonly mpn?: string;
  readonly gtin?: string;
  readonly color?: string;
  readonly storageCapacity?: string;
}

export interface MatchDecision extends ListingMatch {
  readonly canonicalProductId: string | null;
}

export interface MatchOptions {
  /** Candidates a human already refused; never proposed again automatically. */
  readonly excludeIds?: readonly string[];
}

export interface IdentityMatcher {
  match(hints: ListingIdentityHints, options?: MatchOptions): Promise<MatchDecision>;
}

/**
 * Assesses one listing against one product, using the same rules as the matcher.
 *
 * Administrative decisions call this before accepting or reassigning: a human may
 * override the verdict, but never silently - the caller receives the status, the
 * reasons and whether the rules consider the pair contradictory.
 */
export function assessListingAgainstProduct(
  hints: ListingIdentityHints,
  product: CanonicalProduct,
): {
  readonly status: MatchStatus;
  readonly method: MatchMethod;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly requiresReview: boolean;
  readonly contradictory: boolean;
} {
  const normalized = normalizeHints(hints);
  if (normalized.accessory) {
    return {
      status: 'conflict',
      method: 'none',
      confidence: CONFIDENCE.conflict,
      reasons: ['looks like an accessory, not the product'],
      requiresReview: true,
      contradictory: true,
    };
  }

  const score = scoreCandidate(normalized, product);
  return {
    status: score.status,
    method: score.method,
    confidence: score.confidence,
    reasons: [...score.reasons],
    requiresReview: score.status === 'possible' || score.blocked,
    contradictory: score.blocked || score.status === 'unmatched',
  };
}

/**
 * One candidate as the deterministic rules see it. `contradictory` is true when the
 * rules found a direct disagreement (identifier, generation, accessory or variant)
 * or no evidence at all; the review service uses it to decide when an
 * administrator must explicitly acknowledge a conflict.
 */
export interface CandidateAssessment {
  readonly product: CanonicalProduct;
  readonly status: MatchStatus;
  readonly method: MatchMethod;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly contradictory: boolean;
}

/**
 * Scores a listing against a set of candidates with exactly the rules used by
 * `createIdentityMatcher`. The review queue and the accept/reassign validation both
 * call this, so what an administrator sees is what the matcher decided.
 */
export function assessCandidates(
  hints: ListingIdentityHints,
  products: readonly CanonicalProduct[],
): CandidateAssessment[] {
  const normalized = normalizeHints(hints);

  return products.map((product) => {
    const score = scoreCandidate(normalized, product);
    return {
      product,
      status: score.status,
      method: score.method,
      confidence: score.confidence,
      reasons: [...score.reasons],
      contradictory: score.blocked || score.status === 'unmatched',
    };
  });
}

/** Scores by rule, documented in one place so the number is explainable. */
const CONFIDENCE = {
  canonicalId: 100,
  gtin: 100,
  mpn: 95,
  brandModelSpecs: 92,
  brandModel: 90,
  titleWithBrand: 65,
  titleOnly: 55,
  conflict: 10,
  none: 0,
} as const;

interface NormalizedHints {
  readonly title: string;
  readonly brandKey: string | null;
  readonly modelKey: string | null;
  readonly mpn: string | null;
  readonly gtin: string | null;
  readonly color: string | null;
  readonly storageCapacity: string | null;
  readonly tokens: readonly string[];
  readonly accessory: boolean;
}

function normalizeHints(hints: ListingIdentityHints): NormalizedHints {
  return {
    title: hints.title,
    brandKey: hints.brand && hints.brand.trim() !== '' ? normalizeKey(hints.brand) : null,
    modelKey: hints.model && hints.model.trim() !== '' ? normalizeKey(hints.model) : null,
    mpn: hints.mpn && hints.mpn.trim() !== '' ? normalizeMpn(hints.mpn) : null,
    gtin: hints.gtin && hints.gtin.trim() !== '' ? normalizeGtin(hints.gtin) : null,
    color: hints.color ? normalizeColor(hints.color) : null,
    storageCapacity: hints.storageCapacity ? normalizeCapacity(hints.storageCapacity) : null,
    tokens: tokenizeText(hints.title).slice(0, 24),
    accessory: detectAccessory(hints.title),
  };
}

interface CandidateScore {
  readonly product: CanonicalProduct;
  readonly status: MatchStatus;
  readonly method: MatchMethod;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly blocked: boolean;
}

function emptyScore(product: CanonicalProduct): CandidateScore {
  return {
    product,
    status: 'unmatched',
    method: 'none',
    confidence: CONFIDENCE.none,
    reasons: [],
    blocked: false,
  };
}

function blocked(product: CanonicalProduct, method: MatchMethod, reason: string): CandidateScore {
  return {
    product,
    status: 'conflict',
    method,
    confidence: CONFIDENCE.conflict,
    reasons: [reason],
    blocked: true,
  };
}

/** Evaluates one candidate against one listing; never mutates or guesses. */
export function scoreCandidate(hints: NormalizedHints, product: CanonicalProduct): CandidateScore {
  // 1. GTIN. Equal is proof; different is a contradiction that blocks everything.
  // Both sides are normalized here so a curated record with a raw value still works.
  const productGtin = product.gtin ? normalizeGtin(product.gtin) : null;
  if (hints.gtin && productGtin) {
    if (hints.gtin === productGtin) {
      return {
        product,
        status: 'exact',
        method: 'gtin',
        confidence: CONFIDENCE.gtin,
        reasons: ['GTIN matched exactly'],
        blocked: false,
      };
    }
    return blocked(product, 'gtin', 'different GTIN for the same candidate');
  }

  // 2. Manufacturer part number.
  const productMpn = product.mpn ? normalizeMpn(product.mpn) : null;
  if (hints.mpn && productMpn) {
    if (hints.mpn === productMpn) {
      return {
        product,
        status: 'strong',
        method: 'mpn',
        confidence: CONFIDENCE.mpn,
        reasons: ['manufacturer part number matched'],
        blocked: false,
      };
    }
    return blocked(product, 'mpn', 'different manufacturer part number');
  }

  const productBrandKey = normalizeKey(product.brand);
  const brandAgrees = hints.brandKey !== null && hints.brandKey === productBrandKey;

  // Explicit models that disagree are different products, whatever the title says.
  if (hints.modelKey && product.model) {
    const productModelKey = normalizeKey(product.model);
    if (hints.modelKey !== productModelKey) {
      return blocked(product, 'brand_model', `different model (${product.model})`);
    }

    // 3/4. Same brand and model: variant attributes decide, and they matter.
    if (brandAgrees) {
      if (
        hints.storageCapacity &&
        product.storageCapacity &&
        hints.storageCapacity !== normalizeCapacity(product.storageCapacity)
      ) {
        return blocked(product, 'brand_model_specs', 'different storage capacity variant');
      }

      if (hints.color && product.color && hints.color !== normalizeColor(product.color)) {
        return blocked(product, 'brand_model_specs', 'different colour variant');
      }

      const hasVariantFacts =
        (hints.storageCapacity !== null && product.storageCapacity !== undefined) ||
        (hints.color !== null && product.color !== undefined);

      return {
        product,
        status: 'strong',
        method: hasVariantFacts ? 'brand_model_specs' : 'brand_model',
        confidence: hasVariantFacts ? CONFIDENCE.brandModelSpecs : CONFIDENCE.brandModel,
        reasons: [hasVariantFacts ? 'brand, model and variant matched' : 'brand and model matched'],
        blocked: false,
      };
    }
  }

  // A different generation in the title is a different product.
  if (hasGenerationConflict(hints.title, product.name)) {
    return blocked(product, 'title_similarity', 'different product generation');
  }

  // 5. Weak evidence only. Always unresolved: a similar title is not identity.
  const similarity = titleSimilarity(hints.title, `${product.brand} ${product.name}`);
  if (brandAgrees && similarity >= 0.5) {
    return {
      product,
      status: 'possible',
      method: 'title_similarity',
      confidence: CONFIDENCE.titleWithBrand + Math.round(similarity * 10),
      reasons: [`title similarity ${similarity.toFixed(2)} with the same brand`],
      blocked: false,
    };
  }

  if (similarity >= 0.75) {
    return {
      product,
      status: 'possible',
      method: 'title_similarity',
      confidence: CONFIDENCE.titleOnly + Math.round(similarity * 10),
      reasons: [`title similarity ${similarity.toFixed(2)}`],
      blocked: false,
    };
  }

  return emptyScore(product);
}

function decide(hints: NormalizedHints, scores: readonly CandidateScore[]): MatchDecision {
  if (scores.length === 0) {
    return {
      status: hints.accessory ? 'conflict' : 'unmatched',
      method: 'none',
      confidence: hints.accessory ? CONFIDENCE.conflict : CONFIDENCE.none,
      requiresReview: hints.accessory,
      reasons: hints.accessory ? ['looks like an accessory, not the product'] : ['no candidate'],
      canonicalProductId: null,
    };
  }

  // Two products claiming the same exact identifier is a data problem, not a match.
  const exacts = scores.filter((score) => score.status === 'exact');
  if (exacts.length > 1) {
    return {
      status: 'conflict',
      method: exacts[0]?.method ?? 'none',
      confidence: CONFIDENCE.conflict,
      requiresReview: true,
      reasons: ['more than one canonical product carries this identifier'],
      canonicalProductId: null,
    };
  }

  if (exacts.length === 1) {
    const winner = exacts[0] as CandidateScore;
    return {
      status: 'exact',
      method: winner.method,
      confidence: winner.confidence,
      requiresReview: false,
      reasons: [...winner.reasons],
      canonicalProductId: winner.product.id,
    };
  }

  const strongs = scores.filter((score) => score.status === 'strong');
  const strongest = strongs.reduce<CandidateScore | null>(
    (a, b) => (a === null || b.confidence > a.confidence ? b : a),
    null,
  );

  // An exact-tier contradiction outranks a weaker positive match.
  const conflicts = scores.filter((score) => score.blocked);
  const topConfidence = Math.max(...scores.map((score) => score.confidence));

  if (strongs.length === 1 && (strongest?.confidence ?? 0) >= topConfidence) {
    const winner = strongs[0] as CandidateScore;
    return {
      status: 'strong',
      method: winner.method,
      confidence: winner.confidence,
      requiresReview: false,
      reasons: [...winner.reasons],
      canonicalProductId: winner.product.id,
    };
  }

  if (strongs.length > 1) {
    // Equally strong matches for different products are ambiguous by definition.
    return {
      status: 'possible',
      method: strongest?.method ?? 'none',
      confidence: strongest?.confidence ?? CONFIDENCE.titleOnly,
      requiresReview: true,
      reasons: [`${strongs.length} canonical products matched equally strongly`],
      canonicalProductId: null,
    };
  }

  if (conflicts.length > 0) {
    const conflict = conflicts[0] as CandidateScore;
    return {
      status: 'conflict',
      method: conflict.method,
      confidence: CONFIDENCE.conflict,
      requiresReview: true,
      reasons: [...conflict.reasons],
      canonicalProductId: null,
    };
  }

  const possible = scores.filter((score) => score.status === 'possible');
  if (possible.length > 0) {
    const winner = possible.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    const equallyGood = possible.filter((score) => score.confidence === winner.confidence);

    return {
      status: 'possible',
      method: winner.method,
      confidence: winner.confidence,
      requiresReview: true,
      reasons:
        equallyGood.length > 1
          ? ['several canonical products are equally plausible']
          : [...winner.reasons],
      canonicalProductId: null,
    };
  }

  return {
    status: 'unmatched',
    method: 'none',
    confidence: CONFIDENCE.none,
    requiresReview: false,
    reasons: ['no deterministic rule matched'],
    canonicalProductId: null,
  };
}

export function createIdentityMatcher(options: {
  readonly store: CatalogueStore;
  /** Candidate cap keeps a pathological catalogue from turning into a scan. */
  readonly candidateLimit?: number;
}): IdentityMatcher {
  const limit = options.candidateLimit ?? 25;

  return {
    async match(
      hints: ListingIdentityHints,
      matchOptions: MatchOptions = {},
    ): Promise<MatchDecision> {
      const normalized = normalizeHints(hints);

      // An accessory is never the primary product, even with a perfect title.
      if (normalized.accessory) {
        return {
          status: 'conflict',
          method: 'none',
          confidence: CONFIDENCE.conflict,
          requiresReview: true,
          reasons: ['looks like an accessory, not the product'],
          canonicalProductId: null,
        };
      }

      const candidates = await options.store.findCandidates({
        ...(normalized.gtin ? { gtin: normalized.gtin } : {}),
        ...(normalized.mpn ? { mpn: normalized.mpn } : {}),
        ...(normalized.brandKey ? { brandKey: normalized.brandKey } : {}),
        ...(normalized.tokens.length > 0 ? { nameTokens: normalized.tokens.slice(0, 6) } : {}),
        ...(matchOptions.excludeIds && matchOptions.excludeIds.length > 0
          ? { excludeIds: matchOptions.excludeIds }
          : {}),
        limit,
      });

      const scores = candidates.map((product) => scoreCandidate(normalized, product));
      return decide(normalized, scores);
    },
  };
}
