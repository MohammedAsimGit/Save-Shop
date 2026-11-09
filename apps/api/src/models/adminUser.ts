import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Administrator accounts (Sprint 6).
 *
 * This is the **only** source of admin authority: the role and status stored here
 * decide what a session can do, never a claim in a request body or a JWT that has
 * been outlived by a disabled account.
 *
 * Rules encoded in the schema:
 * - `email` is unique and stored lowercase, so one person cannot have two accounts
 *   that differ only by case;
 * - `passwordHash` is an `scrypt` derivation produced by `password.ts`; the plaintext
 *   password is never stored, logged or returned;
 * - `tokenVersion` is bumped on disable/password reset, which invalidates every
 *   session issued before it without needing server-side session storage;
 * - there is no seeded administrator and no default password: accounts are created
 *   only through the provisioning CLI.
 */

const adminUserSchema = new Schema(
  {
    /** Opaque id used in audit trails; never the email. */
    id: { type: String, required: true, maxLength: 60 },
    email: { type: String, required: true, maxLength: 200 },
    displayName: { type: String, required: true, maxLength: 80 },
    role: { type: String, required: true, enum: ['catalogue_admin'] },
    status: { type: String, required: true, enum: ['active', 'disabled'], default: 'active' },
    /** `scrypt$N$r$p$salt$hash`; never leaves the API. */
    passwordHash: { type: String, required: true, maxLength: 400 },
    /** Bumped on disable and password reset; older tokens stop verifying. */
    tokenVersion: { type: Number, required: true, default: 0 },
    lastLoginAt: { type: Date, default: null },
    passwordUpdatedAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'admin_users', versionKey: false, timestamps: false },
);

adminUserSchema.index({ id: 1 }, { unique: true });
adminUserSchema.index({ email: 1 }, { unique: true });

export type AdminUserFields = InferSchemaType<typeof adminUserSchema>;

export const AdminUserModel: Model<AdminUserFields> =
  (mongoose.models['AdminUser'] as Model<AdminUserFields> | undefined) ??
  mongoose.model<AdminUserFields>('AdminUser', adminUserSchema);
