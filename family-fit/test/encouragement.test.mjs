import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMMENT_MAX_LENGTH,
  REACTION_EMOJIS,
  aggregateReactions,
  entryKey,
  entryKeyFromRow,
  entryTargetColumns,
  findOwnReactionId,
  mergeReactionAfterDelete,
  mergeReactionAfterInsert,
  normalizeCommentBody,
} from "../encouragement.js";

describe("normalizeCommentBody", () => {
  it("rejects empty and whitespace-only", () => {
    assert.equal(normalizeCommentBody("").ok, false);
    assert.equal(normalizeCommentBody("   ").ok, false);
  });

  it("trims and accepts short notes", () => {
    const result = normalizeCommentBody("  Nice work!  ");
    assert.equal(result.ok, true);
    assert.equal(result.body, "Nice work!");
  });

  it("rejects over-long bodies", () => {
    const long = "x".repeat(COMMENT_MAX_LENGTH + 1);
    const result = normalizeCommentBody(long);
    assert.equal(result.ok, false);
    assert.match(result.message, /280/);
  });

  it("accepts exactly max length after trim", () => {
    const exact = "a".repeat(COMMENT_MAX_LENGTH);
    assert.equal(normalizeCommentBody(exact).ok, true);
  });
});

describe("entryTargetColumns / entryKey", () => {
  it("maps weight and exercise to xor FKs", () => {
    assert.deepEqual(entryTargetColumns("weight", "w1"), {
      weigh_in_id: "w1",
      exercise_log_id: null,
    });
    assert.deepEqual(entryTargetColumns("exercise", "e1"), {
      weigh_in_id: null,
      exercise_log_id: "e1",
    });
    assert.equal(entryTargetColumns("other", "x"), null);
    assert.equal(entryTargetColumns("weight", ""), null);
  });

  it("builds and parses entry keys", () => {
    assert.equal(entryKey("weight", "abc"), "weight:abc");
    assert.equal(entryKeyFromRow({ weigh_in_id: "abc" }), "weight:abc");
    assert.equal(entryKeyFromRow({ exercise_log_id: "xyz" }), "exercise:xyz");
    assert.equal(entryKeyFromRow({}), null);
  });
});

describe("aggregateReactions", () => {
  it("keeps fixed emoji order and marks mine", () => {
    const chips = aggregateReactions(
      [
        { id: "1", emoji: "❤️", user_id: "u1" },
        { id: "2", emoji: "❤️", user_id: "u2" },
        { id: "3", emoji: "💪", user_id: "u1" },
        { id: "4", emoji: "👻", user_id: "u1" },
      ],
      "u1"
    );
    assert.deepEqual(
      chips.map((c) => c.emoji),
      [...REACTION_EMOJIS]
    );
    const heart = chips.find((c) => c.emoji === "❤️");
    assert.equal(heart.count, 2);
    assert.equal(heart.mine, true);
    assert.deepEqual(heart.myIds, ["1"]);
    const tada = chips.find((c) => c.emoji === "🎉");
    assert.equal(tada.count, 0);
    assert.equal(tada.mine, false);
  });
});

describe("findOwnReactionId", () => {
  it("returns own reaction id for emoji or null", () => {
    const rows = [
      { id: "a", emoji: "👍", user_id: "me" },
      { id: "b", emoji: "👍", user_id: "other" },
    ];
    assert.equal(findOwnReactionId(rows, "👍", "me"), "a");
    assert.equal(findOwnReactionId(rows, "❤️", "me"), null);
  });
});

describe("reaction cache merge", () => {
  it("insert merges onto current rows, not a stale snapshot", () => {
    const stale = [{ id: "1", emoji: "👍", user_id: "u1" }];
    const current = [...stale, { id: "2", emoji: "❤️", user_id: "u1" }];
    const merged = mergeReactionAfterInsert(current, {
      id: "3",
      emoji: "🎉",
      user_id: "u1",
    });
    assert.equal(merged.length, 3);
    assert.deepEqual(
      merged.map((r) => r.id),
      ["1", "2", "3"]
    );
  });

  it("delete merges onto current rows", () => {
    const current = [
      { id: "1", emoji: "👍", user_id: "u1" },
      { id: "2", emoji: "❤️", user_id: "u1" },
    ];
    const merged = mergeReactionAfterDelete(current, "1");
    assert.deepEqual(
      merged.map((r) => r.id),
      ["2"]
    );
  });
});
