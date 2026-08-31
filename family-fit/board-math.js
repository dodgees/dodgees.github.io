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

function sortWeighSeries(series) {
  return [...series].sort((a, b) => {
    if (a.recorded_on !== b.recorded_on) {
      return a.recorded_on < b.recorded_on ? -1 : 1;
    }
    const ca = a.created_at || "";
    const cb = b.created_at || "";
    if (ca === cb) return 0;
    return ca < cb ? -1 : 1;
  });
}

/** Display label for a weight delta in lbs (e.g. "−5.0 lbs"). */
export function formatWeightDelta(delta) {
  if (delta == null || Number.isNaN(delta)) return null;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const mag = Math.abs(delta).toFixed(1);
  return `${sign}${mag} lbs`;
}

/**
 * Structured weigh-in summary for the competition board.
 * Stable order: recorded_on asc, then created_at asc.
 */
export function weightSummaryFromSeries(series) {
  const sorted = sortWeighSeries(series);
  if (!sorted.length) {
    return {
      kind: "empty",
      text: "No weigh-ins in the last 30 days",
      delta: null,
      startLbs: null,
      latestLbs: null,
      primary: "—",
      secondary: "No weigh-ins in the last 30 days",
    };
  }
  if (sorted.length === 1) {
    const only = sorted[0];
    const lbs = Number(only.weight_lbs);
    return {
      kind: "single",
      text: `Latest: ${only.weight_lbs} lbs (${only.recorded_on})`,
      delta: null,
      startLbs: lbs,
      latestLbs: lbs,
      primary: `${only.weight_lbs} lbs`,
      secondary: `Latest · ${only.recorded_on}`,
    };
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startLbs = Number(first.weight_lbs);
  const latestLbs = Number(last.weight_lbs);
  const delta = latestLbs - startLbs;
  const sign = delta > 0 ? "+" : "";
  const deltaLabel = formatWeightDelta(delta);
  return {
    kind: "range",
    text: `${first.weight_lbs} → ${last.weight_lbs} lbs (${sign}${delta.toFixed(1)} over 30 days)`,
    delta,
    startLbs,
    latestLbs,
    primary: deltaLabel,
    secondary: `${first.weight_lbs} → ${last.weight_lbs} lbs`,
  };
}

/**
 * Sort competition-board members.
 * @param {"exercise"|"weight"} mode
 * @param {Array<{ name: string, mins: number, weight: { delta: number|null } }>} members
 */
export function sortBoardMembers(mode, members) {
  const list = [...members];
  if (mode === "weight") {
    list.sort((a, b) => {
      const da = a.weight?.delta;
      const db = b.weight?.delta;
      const aHas = da != null && !Number.isNaN(da);
      const bHas = db != null && !Number.isNaN(db);
      if (aHas && bHas && da !== db) return da - db; // more loss (more negative) first
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }
  // Default: most exercise minutes first
  list.sort((a, b) => {
    if (b.mins !== a.mins) return b.mins - a.mins;
    return a.name.localeCompare(b.name);
  });
  return list;
}

export const BOARD_SORT_STORAGE_KEY = "family-fit.boardSort";

/** @returns {"exercise"|"weight"} */
export function readBoardSortPreference(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(BOARD_SORT_STORAGE_KEY);
    return raw === "weight" ? "weight" : "exercise";
  } catch {
    return "exercise";
  }
}

/** @param {"exercise"|"weight"} mode */
export function writeBoardSortPreference(mode, storage = globalThis.localStorage) {
  const next = mode === "weight" ? "weight" : "exercise";
  try {
    storage?.setItem?.(BOARD_SORT_STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

/**
 * Stable weigh-in series: recorded_on asc, then created_at asc.
 * Returns the weight line shown on the competition board.
 */
export function weightLineFromSeries(series) {
  return weightSummaryFromSeries(series).text;
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
