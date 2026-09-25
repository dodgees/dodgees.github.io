/** How often to refresh board + recent entries while the tab is visible. */
export const LIVE_REFRESH_INTERVAL_MS = 30_000;

/** Minimum gap between focus/visibility-triggered polls. */
export const LIVE_REFRESH_VISIBILITY_GAP_MS = 5_000;

/**
 * Whether a background live refresh should run now.
 * @param {{ signedIn: boolean, documentHidden: boolean, pollInFlight: boolean }} state
 */
export function shouldRunLiveRefresh(state) {
  if (!state?.signedIn) return false;
  if (state.documentHidden) return false;
  if (state.pollInFlight) return false;
  return true;
}

/**
 * Whether a focus/visibility poll should fire given the last one.
 * @param {number} lastStartedAt
 * @param {number} now
 * @param {number} [gapMs]
 */
export function shouldPollOnVisibility(lastStartedAt, now, gapMs = LIVE_REFRESH_VISIBILITY_GAP_MS) {
  const last = Number(lastStartedAt) || 0;
  const at = Number(now) || 0;
  return at - last >= gapMs;
}
