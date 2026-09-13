/**
 * Shared family invite code for Create account (public config secret).
 * Sign-in does not use this gate.
 */

export const INVITE_MISSING_CONFIG_MESSAGE =
  "Create account is locked until the captain sets an invite code in config.js.";

export const INVITE_REQUIRED_MESSAGE =
  "Enter the family invite code from the captain to create an account.";

export const INVITE_INVALID_MESSAGE =
  "That invite code is not correct. Ask the captain for the current code.";

/**
 * Normalize invite input for comparison (trim + case-insensitive).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeInviteCode(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Validate invite code for Create account only.
 * Returns an error message, or null when signup may proceed.
 *
 * @param {unknown} entered - value from the Create account form
 * @param {unknown} expected - FAMILY_FIT_CONFIG.inviteCode
 * @returns {string|null}
 */
export function validateSignupInvite(entered, expected) {
  const want = normalizeInviteCode(expected);
  if (!want) return INVITE_MISSING_CONFIG_MESSAGE;
  const got = normalizeInviteCode(entered);
  if (!got) return INVITE_REQUIRED_MESSAGE;
  if (got !== want) return INVITE_INVALID_MESSAGE;
  return null;
}
