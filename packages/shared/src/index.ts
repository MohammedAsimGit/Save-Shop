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
