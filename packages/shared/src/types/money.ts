/**
 * Money is always represented as an integer amount in the currency's minor unit
 * (paise, cents, ...) plus an ISO 4217 currency code.
 *
 * Monetary values are NEVER stored or transmitted as floating point numbers.
 */
export interface Money {
  /** Integer amount in the minor unit, e.g. 129900 = 1299.00 INR. */
  readonly amountMinor: number;
  /** ISO 4217 code, e.g. "INR", "USD". */
  readonly currency: string;
}
