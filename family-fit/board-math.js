/**
 * Pure board helpers for Family Fit (testable without Supabase).
 * Kept in sync with the competition-board math in app.js.
 */
export function localDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 30-day competition cutoff using local calendar (not UTC toISOString). */
export function competitionSinceDay(now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - 30);
  return localDateISO(since);
}

/**
 * Stable weigh-in series: recorded_on asc, then created_at asc.
 * Returns the weight line shown on the competition board.
 */
export function weightLineFromSeries(series) {
  const sorted = [...series].sort((a, b) => {
    if (a.recorded_on !== b.recorded_on) {
      return a.recorded_on < b.recorded_on ? -1 : 1;
    }
    const ca = a.created_at || "";
    const cb = b.created_at || "";
    if (ca === cb) return 0;
    return ca < cb ? -1 : 1;
  });
  if (!sorted.length) return "No weigh-ins in the last 30 days";
  if (sorted.length === 1) {
    return `Latest: ${sorted[0].weight_lbs} lbs (${sorted[0].recorded_on})`;
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const delta = Number(last.weight_lbs) - Number(first.weight_lbs);
  const sign = delta > 0 ? "+" : "";
  return `${first.weight_lbs} → ${last.weight_lbs} lbs (${sign}${delta.toFixed(1)} over 30 days)`;
}

/** Profile update: PostgREST can return [] with no error — treat as failure. */
export function profileUpdateStatus(data, error) {
  if (error) return { ok: false, message: error.message || String(error) };
  if (!data?.length) {
    return {
      ok: false,
      message:
        "No profile row for this account. Ask the captain to re-run family-fit/schema.sql (includes a profiles backfill).",
    };
  }
  return { ok: true, message: "Display name saved." };
}
