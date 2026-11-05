import type { Money } from './money.js';

/** Planned user-facing domain types. No auth is implemented in Sprint 0. */
export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly displayName?: string;
  readonly createdAt: string;
}

export type SubscriptionTier = 'free' | 'premium';

export interface Subscription {
  readonly id: string;
  readonly userId: string;
  readonly tier: SubscriptionTier;
  readonly status: 'none' | 'active' | 'past_due' | 'cancelled';
  readonly currentPeriodEnd?: string;
}

export interface WishlistItem {
  readonly id: string;
  readonly userId: string;
  readonly productId: string;
  readonly variantId?: string;
  /** Optional target price the user wants to be notified about. */
  readonly targetPrice?: Money;
  readonly createdAt: string;
}
