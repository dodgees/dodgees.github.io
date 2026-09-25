import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  formatExerciseDetail,
  formatWeightDetail,
  normalizeExercisePayload,
  normalizeWeightPayload,
} from "../entry-log.js";

describe("normalizeWeightPayload", () => {
  it("accepts a valid weigh-in", () => {
    const result = normalizeWeightPayload({
      weightLbs: "182.5",
      recordedOn: "2026-09-25",
      note: "  morning  ",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.payload, {
      weight_lbs: 182.5,
      recorded_on: "2026-09-25",
      note: "morning",
    });
  });

  it("rejects out-of-range weight and bad dates", () => {
    assert.equal(
      normalizeWeightPayload({ weightLbs: 0, recordedOn: "2026-09-25" }).ok,
      false
    );
    assert.equal(
      normalizeWeightPayload({ weightLbs: 1000, recordedOn: "2026-09-25" }).ok,
      false
    );
    assert.equal(
      normalizeWeightPayload({ weightLbs: 180, recordedOn: "09/25/2026" }).ok,
      false
    );
  });

  it("rejects over-long notes and empties optional note", () => {
    const long = "x".repeat(NOTE_MAX_LENGTH + 1);
    assert.equal(
      normalizeWeightPayload({
        weightLbs: 180,
        recordedOn: "2026-09-25",
        note: long,
      }).ok,
      false
    );
    const empty = normalizeWeightPayload({
      weightLbs: 180,
      recordedOn: "2026-09-25",
      note: "   ",
    });
    assert.equal(empty.ok, true);
    assert.equal(empty.payload.note, null);
  });
});

describe("normalizeExercisePayload", () => {
  it("accepts a valid exercise log", () => {
    const result = normalizeExercisePayload({
      activity: "  Walk  ",
      durationMinutes: "45",
      recordedOn: "2026-09-25",
      note: "",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.payload, {
      activity: "Walk",
      duration_minutes: 45,
      recorded_on: "2026-09-25",
      note: null,
    });
  });

  it("rejects empty activity, non-integer minutes, and over-long activity", () => {
    assert.equal(
      normalizeExercisePayload({
        activity: "  ",
        durationMinutes: 30,
        recordedOn: "2026-09-25",
      }).ok,
      false
    );
    assert.equal(
      normalizeExercisePayload({
        activity: "Run",
        durationMinutes: 30.5,
        recordedOn: "2026-09-25",
      }).ok,
      false
    );
    assert.equal(
      normalizeExercisePayload({
        activity: "a".repeat(ACTIVITY_MAX_LENGTH + 1),
        durationMinutes: 30,
        recordedOn: "2026-09-25",
      }).ok,
      false
    );
  });
});

describe("format details", () => {
  it("formats weight and exercise detail strings", () => {
    assert.equal(formatWeightDetail(180, null), "180 lbs");
    assert.equal(formatWeightDetail(180, "am"), "180 lbs — am");
    assert.equal(formatExerciseDetail("Walk", 30, null), "Walk · 30 min");
    assert.equal(
      formatExerciseDetail("Walk", 30, "park"),
      "Walk · 30 min — park"
    );
  });
});
