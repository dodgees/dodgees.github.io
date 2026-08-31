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
 * Spoken weight phrase for board accessible names.
 * @param {{ kind?: string, delta: number|null, primary?: string }} weight
 */
export function weightPhraseForA11y(weight) {
  if (!weight || weight.kind === "empty") return "no weigh-ins";
  if (weight.kind === "single") {
    const lbs = weight.latestLbs ?? weight.startLbs;
    if (lbs == null || Number.isNaN(lbs)) return "one weigh-in logged";
    return `${lbs} pounds`;
  }
  const delta = weight.delta;
  if (delta == null || Number.isNaN(delta)) return "no weight change recorded";
  const mag = Math.abs(delta);
  const pounds = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  if (delta < 0) return `down ${pounds} pounds`;
  if (delta > 0) return `up ${pounds} pounds`;
  return "no weight change";
}

/**
 * Coherent ranked accessible name, e.g. "1. Alex, down 5 pounds, 30 minutes exercise".
 * @param {number} rank 1-based
 * @param {{ name: string, mins: number, weight: object }} member
 * @param {boolean} [isSelf] when true, append a self marker for the signed-in user
 */
export function boardMemberAccessibleName(rank, member, isSelf = false) {
  const name = member?.name || "Family member";
  const weightPart = weightPhraseForA11y(member?.weight);
  const mins = Number(member?.mins) || 0;
  const exercisePart = `${mins} ${mins === 1 ? "minute" : "minutes"} exercise`;
  const selfPart = isSelf ? ", you" : "";
  return `${rank}. ${name}, ${weightPart}, ${exercisePart}${selfPart}`;
}

/**
 * Structured weigh-in summary for the competition board.
 * Stable order: recorded_on asc, then created_at asc.
 * Board cards use primary (glance delta/latest) and secondary (start→latest);
 * text remains the legacy full sentence.
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
 * Sort competition-board members for display order.
 * exercise: most minutes first, then name.
 * weight: most weight loss (most negative delta) first; null/NaN deltas last; then name.
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
 * Legacy full-sentence weight summary (`weightSummaryFromSeries(...).text`).
 * Board cards render primary/secondary instead.
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

/** Whether a failed loadBoard should restore the last rendered snapshot. */
export function loadBoardErrorShouldKeepBoard(
  generation,
  previousBoardMembers,
  previousRenderedGeneration
) {
  return (
    previousBoardMembers !== null && generation > previousRenderedGeneration
  );
}
