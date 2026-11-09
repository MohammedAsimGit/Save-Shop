export type { Money } from './types/money.js';
export type {
  Product,
  ProductIdentifiers,
  ProductVariant,
  Marketplace,
  ProductListing,
  ListingAvailability,
  PriceSnapshot,
  PriceSource,
} from './types/catalog.js';
export type { UserProfile, SubscriptionTier, Subscription, WishlistItem } from './types/user.js';

export type {
  SuccessEnvelope,
  ErrorEnvelope,
  ResponseMeta,
  FieldError,
  ApiErrorCode,
} from './contracts/api.js';
export { isErrorEnvelope } from './contracts/api.js';

export { dependencyStatusSchema, healthResponseSchema } from './contracts/health.js';
export type { HealthResponse, DependencyStatus } from './contracts/health.js';

// Price comparison contracts and the source-independent ranking engine.
export {
  marketSourceKindSchema,
  sourceVerificationSchema,
  sourcePermissionStatusSchema,
  moneySchema,
  marketSourceSchema,
  offerAvailabilitySchema,
  offerSnapshotSchema,
  exclusionReasonSchema,
  freshnessSchema,
  comparedOfferSchema,
  excludedOfferSchema,
  comparisonStatusSchema,
  comparisonResultSchema,
  comparedProductSchema,
  productComparisonResponseSchema,
  sourceCoverageResponseSchema,
} from './contracts/comparison.js';
export type {
  MarketSourceKind,
  MarketSource,
  OfferAvailability,
  OfferSnapshot,
  ExclusionReason,
  Freshness,
  ComparedOffer,
  ExcludedOffer,
  ComparisonResult,
  ProductComparisonResponse,
  SourceCoverageResponse,
} from './contracts/comparison.js';
export { compareOffers, withProduct } from './comparison/engine.js';
export type { CompareOffersParams } from './comparison/engine.js';

// Price history contracts (Sprint 3). Sample and verified history stay separated.
export {
  historyPeriodSchema,
  HISTORY_PERIOD_DAYS,
  DEFAULT_HISTORY_PERIOD,
  HISTORY_MAX_OBSERVATIONS,
  priceHistoryQuerySchema,
  historyObservationSchema,
  historyPricePointSchema,
  historyGroupSummarySchema,
  historySummarySchema,
  historyStatusSchema,
  priceHistoryResponseSchema,
} from './contracts/history.js';
export { isoDateTimeSchema, httpUrlSchema } from './contracts/comparison.js';
export type {
  HistoryPeriod,
  PriceHistoryQuery,
  HistoryObservation,
  HistoryPricePoint,
  HistoryGroupSummary,
  HistorySummary,
  HistoryStatus,
  PriceHistoryResponse,
} from './contracts/history.js';

// Daily rollups (Sprint 4). Aggregates are a distinct type, never an observation.
export {
  rollupDateSchema,
  rollupAvailabilitySchema,
  dailyRollupSchema,
  historyRollupSchema,
  HISTORY_MAX_ROLLUP_DAYS,
} from './contracts/rollups.js';
export type { RollupAvailability, DailyRollup, HistoryRollup } from './contracts/rollups.js';

// Canonical catalogue and product identity (Sprint 5).
export {
  catalogueStatusSchema,
  catalogueProvenanceSchema,
  catalogueCategorySchema,
  catalogueProductIdSchema,
  gtinSchema,
  mpnSchema,
  modelSchema,
  specificationsSchema,
  variantAttributesSchema,
  canonicalProductSchema,
  matchStatusSchema,
  matchMethodSchema,
  listingMatchSchema,
  CATALOGUE_MATCHER_VERSION,
  reviewDecisionTypeSchema,
  listingReviewSchema,
  marketplaceListingSchema,
  listingSummarySchema,
  catalogueSearchQuerySchema,
  catalogueSearchResponseSchema,
  catalogueProductResponseSchema,
  productListingsResponseSchema,
  MAX_LISTINGS_PER_PRODUCT,
} from './contracts/catalogue.js';
export type {
  CatalogueStatus,
  CatalogueProvenance,
  CanonicalProduct,
  MatchStatus,
  MatchMethod,
  ListingMatch,
  ReviewDecisionType,
  ListingReview,
  MarketplaceListing,
  ListingSummary,
  CatalogueSearchQuery,
  CatalogueSearchResponse,
  CatalogueProductResponse,
  ProductListingsResponse,
} from './contracts/catalogue.js';

// Catalogue administration: sessions, review queue, human decisions, merges, audit.
export {
  adminRoleSchema,
  adminStatusSchema,
  adminProfileSchema,
  adminLoginRequestSchema,
  adminSessionResponseSchema,
  reviewQueueScopeSchema,
  reviewQueueSortSchema,
  reviewQueueQuerySchema,
  reviewCandidateSchema,
  reviewQueueItemSchema,
  reviewQueueResponseSchema,
  reviewDecisionRecordSchema,
  listingDetailResponseSchema,
  acceptMatchRequestSchema,
  rejectMatchRequestSchema,
  reassignMatchRequestSchema,
  deferMatchRequestSchema,
  reopenMatchRequestSchema,
  reviewDecisionResponseSchema,
  mergeRequestSchema,
  mergePreviewQuerySchema,
  mergePreviewResponseSchema,
  mergeRunStatusSchema,
  mergeResponseSchema,
  auditActionSchema,
  auditTargetTypeSchema,
  auditEventSchema,
  auditQuerySchema,
  auditResponseSchema,
} from './contracts/admin.js';
export type {
  AdminRole,
  AdminStatus,
  AdminProfile,
  AdminLoginRequest,
  AdminSessionResponse,
  ReviewQueueQuery,
  ReviewCandidate,
  ReviewQueueItem,
  ReviewQueueResponse,
  ReviewDecisionRecord,
  ListingDetailResponse,
  AcceptMatchRequest,
  RejectMatchRequest,
  ReassignMatchRequest,
  DeferMatchRequest,
  ReopenMatchRequest,
  ReviewDecisionResponse,
  MergeRequest,
  MergePreviewQuery,
  MergePreviewResponse,
  MergeResponse,
  AuditAction,
  AuditEvent,
  AuditQuery,
  AuditResponse,
} from './contracts/admin.js';

// Deterministic identity normalization, shared by ingestion, matching and search.
export {
  normalizeText,
  normalizeKey,
  tokenizeText,
  gtinCheckDigit,
  normalizeGtin,
  isValidGtin,
  normalizeCapacity,
  normalizeColor,
  extractGenerationTokens,
  hasGenerationConflict,
  detectAccessory,
  extractVariantHints,
  titleSimilarity,
  normalizeMpn,
} from './catalogue/normalize.js';
export type { VariantHints } from './catalogue/normalize.js';

export {
  palette,
  themes,
  colors,
  spacing,
  radii,
  fontSizes,
  lineHeights,
  fontWeights,
  elevation,
  layout,
  type ThemeName,
  type ThemeColors,
  type AppColors,
  type AppSpacing,
  type AppTheme,
} from './theme/tokens.js';

// Demo catalogue: clearly-labelled sample data shared by both clients.
export * from './demo/catalog.js';
