/** Fixed reaction set — must match schema.sql entry_reactions_emoji_allowed. */
export const REACTION_EMOJIS = Object.freeze(["👍", "❤️", "🎉", "💪", "🔥"]);

export const COMMENT_MAX_LENGTH = 280;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, body: string } | { ok: false, message: string }}
 */
export function normalizeCommentBody(raw) {
  const body = String(raw ?? "").trim();
  if (!body) {
    return { ok: false, message: "Write a short note first." };
  }
  if (body.length > COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep encouragement to ${COMMENT_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, body };
}

/**
 * Map app entry kind to the nullable FK columns used in SQL.
 * @param {"weight"|"exercise"} kind
 * @param {string} entryId
 * @returns {{ weigh_in_id: string|null, exercise_log_id: string|null } | null}
 */
export function entryTargetColumns(kind, entryId) {
  const id = String(entryId || "").trim();
  if (!id) return null;
  if (kind === "weight") {
    return { weigh_in_id: id, exercise_log_id: null };
  }
  if (kind === "exercise") {
    return { weigh_in_id: null, exercise_log_id: id };
  }
  return null;
}

/**
 * Stable entry key used when grouping comments/reactions client-side.
 * @param {"weight"|"exercise"} kind
 * @param {string} entryId
 */
export function entryKey(kind, entryId) {
  return `${kind}:${entryId}`;
}

/**
 * @param {{ weigh_in_id?: string|null, exercise_log_id?: string|null }} row
 * @returns {string|null}
 */
export function entryKeyFromRow(row) {
  if (row?.weigh_in_id) return entryKey("weight", row.weigh_in_id);
  if (row?.exercise_log_id) return entryKey("exercise", row.exercise_log_id);
  return null;
}

/**
 * Aggregate reaction rows into chips (fixed emoji order) with counts and mine flag.
 * @param {Array<{ id?: string, emoji: string, user_id: string }>} rows
 * @param {string|null|undefined} currentUserId
 * @returns {Array<{ emoji: string, count: number, mine: boolean, myIds: string[] }>}
 */
export function aggregateReactions(rows, currentUserId) {
  /** @type {Map<string, { count: number, mine: boolean, myIds: string[] }>} */
  const byEmoji = new Map();
  for (const emoji of REACTION_EMOJIS) {
    byEmoji.set(emoji, { count: 0, mine: false, myIds: [] });
  }
  for (const row of rows || []) {
    const bucket = byEmoji.get(row.emoji);
    if (!bucket) continue;
    bucket.count += 1;
    if (currentUserId && row.user_id === currentUserId) {
      bucket.mine = true;
      if (row.id) bucket.myIds.push(row.id);
    }
  }
  return REACTION_EMOJIS.map((emoji) => {
    const b = byEmoji.get(emoji);
    return {
      emoji,
      count: b.count,
      mine: b.mine,
      myIds: b.myIds,
    };
  });
}

/**
 * @param {Array<{ id: string, emoji: string, user_id: string }>} rows
 * @param {string} emoji
 * @param {string} currentUserId
 * @returns {string|null} reaction row id to delete, or null if none
 */
export function findOwnReactionId(rows, emoji, currentUserId) {
  const hit = (rows || []).find(
    (r) => r.emoji === emoji && r.user_id === currentUserId
  );
  return hit?.id || null;
}

/**
 * @param {Array<{ id: string }>} rows
 * @param {string} deletedId
 */
export function mergeReactionAfterDelete(rows, deletedId) {
  return (rows || []).filter((r) => r.id !== deletedId);
}

/**
 * @param {Array<{ id: string }>} rows
 * @param {{ id: string }} row
 */
export function mergeReactionAfterInsert(rows, row) {
  const current = rows || [];
  if (current.some((r) => r.id === row.id)) return current;
  return [...current, row];
}
