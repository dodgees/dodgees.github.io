/** Shown when a recovery email link yields no session after auth init. */
export const RECOVERY_LINK_FAILED_NOTICE =
  "That reset link expired or was already used. Use Forgot password? to get a new one.";

/**
 * Outcome for the pending-password-recovery gate after getSession / auth events.
 * getSession awaits detectSessionInUrl, so a recovery URL with no session means the link failed.
 *
 * @param {boolean} pending
 * @param {object|null|undefined} session
 * @returns {"continue" | "show-recovery" | "link-failed"}
 */
export function resolvePendingPasswordRecovery(pending, session) {
  if (!pending) return "continue";
  if (session) return "show-recovery";
  return "link-failed";
}
