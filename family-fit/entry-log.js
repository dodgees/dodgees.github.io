/** Field limits aligned with family-fit/index.html inputs and schema.sql checks. */
export const NOTE_MAX_LENGTH = 120;
export const ACTIVITY_MAX_LENGTH = 80;

/**
 * @param {{ weightLbs: unknown, recordedOn: unknown, note?: unknown }} fields
 * @returns {{ ok: true, payload: { weight_lbs: number, recorded_on: string, note: string|null } } | { ok: false, message: string }}
 */
export function normalizeWeightPayload(fields) {
  const weight = Number(fields?.weightLbs);
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 1000) {
    return { ok: false, message: "Enter a weight between 0 and 1000 lbs." };
  }
  const recorded_on = String(fields?.recordedOn ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recorded_on)) {
    return { ok: false, message: "Pick a valid date." };
  }
  const noteRaw = String(fields?.note ?? "").trim();
  if (noteRaw.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep notes to ${NOTE_MAX_LENGTH} characters.`,
    };
  }
  return {
    ok: true,
    payload: {
      weight_lbs: weight,
      recorded_on,
      note: noteRaw || null,
    },
  };
}

/**
 * @param {{ activity: unknown, durationMinutes: unknown, recordedOn: unknown, note?: unknown }} fields
 * @returns {{ ok: true, payload: { activity: string, duration_minutes: number, recorded_on: string, note: string|null } } | { ok: false, message: string }}
 */
export function normalizeExercisePayload(fields) {
  const activity = String(fields?.activity ?? "").trim();
  if (!activity) {
    return { ok: false, message: "Enter an activity." };
  }
  if (activity.length > ACTIVITY_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep activity names to ${ACTIVITY_MAX_LENGTH} characters.`,
    };
  }
  const duration = Number(fields?.durationMinutes);
  if (
    !Number.isFinite(duration) ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 1440
  ) {
    return { ok: false, message: "Enter minutes between 1 and 1440." };
  }
  const recorded_on = String(fields?.recordedOn ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recorded_on)) {
    return { ok: false, message: "Pick a valid date." };
  }
  const noteRaw = String(fields?.note ?? "").trim();
  if (noteRaw.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep notes to ${NOTE_MAX_LENGTH} characters.`,
    };
  }
  return {
    ok: true,
    payload: {
      activity,
      duration_minutes: duration,
      recorded_on,
      note: noteRaw || null,
    },
  };
}

/**
 * @param {unknown} weightLbs
 * @param {unknown} note
 */
export function formatWeightDetail(weightLbs, note) {
  const notePart = note ? ` — ${note}` : "";
  return `${weightLbs} lbs${notePart}`;
}

/**
 * @param {unknown} activity
 * @param {unknown} durationMinutes
 * @param {unknown} note
 */
export function formatExerciseDetail(activity, durationMinutes, note) {
  const notePart = note ? ` — ${note}` : "";
  return `${activity} · ${durationMinutes} min${notePart}`;
}
