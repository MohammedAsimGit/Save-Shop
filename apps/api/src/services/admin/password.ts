import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Administrator password hashing.
 *
 * `scrypt` is the KDF built into Node, so this uses a standard, reviewed
 * construction (random salt, memory-hard derivation, constant-time comparison)
 * rather than inventing cryptography. Parameters are stored with the hash, so a
 * future increase does not invalidate existing credentials.
 *
 * Format: `scrypt$N$r$p$<salt base64url>$<derived key base64url>`.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Tuned for an interactive login on a server; ~50-100 ms on a small instance. */
const PARAMS = { N: 16_384, r: 8, p: 1, keyLength: 64 } as const;

function encode(value: Buffer): string {
  return value.toString('base64url');
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return scrypt(password.normalize('NFKC'), salt, PARAMS.keyLength);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, encode(salt), encode(derived)].join('$');
}

/**
 * Verifies a password against a stored hash. Returns false for every malformed
 * input, never throwing: an authentication failure must not be distinguishable
 * from a corrupt record by the client, and never crashes a request.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, n, r, p, saltPart, hashPart] = parts;
    if (n !== String(PARAMS.N) || r !== String(PARAMS.r) || p !== String(PARAMS.p)) {
      // A record written with different parameters is not verifiable by this build;
      // the honest answer is "no", and the CLI can reset the credential.
      return false;
    }

    const salt = Buffer.from(saltPart ?? '', 'base64url');
    const expected = Buffer.from(hashPart ?? '', 'base64url');
    if (salt.length === 0 || expected.length !== PARAMS.keyLength) return false;

    const actual = await scrypt(password.normalize('NFKC'), salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly problems: readonly string[];
}

/**
 * Password policy for provisioned administrators.
 *
 * Length is the dominant factor, so the floor is 12 characters; a letter and a
 * digit are required to reject obvious placeholders. Nothing here is presented as
 * a guarantee against a targeted attacker - the login throttle and the scrypt cost
 * are the actual controls.
 */
export function checkPasswordPolicy(password: string, email?: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < 12) problems.push('password must be at least 12 characters');
  if (password.length > 200) problems.push('password must be at most 200 characters');
  if (!/[A-Za-z]/.test(password)) problems.push('password must contain a letter');
  if (!/\d/.test(password)) problems.push('password must contain a digit');
  if (email && password.toLowerCase().includes(email.toLowerCase())) {
    problems.push('password must not contain the email address');
  }

  return { valid: problems.length === 0, problems };
}

/**
 * A real hash of an unusable placeholder value, compared against when an email is
 * unknown so a login attempt costs the same whether or not the account exists. It
 * is not a credential: no password verifies against it.
 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$VkTPB27g0ubuwonGNxZhUQ$ryeaD_u3C1LE8d1-C448IMHtUhhQ2k9wXOyQkmHYGel_eVWEOj1y9SVSwwWHNgGbQCCLE_Hq8J78ERj9kMEuNg';
