import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  competitionSinceDay,
  localDateISO,
  profileUpdateStatus,
  weightLineFromSeries,
} from "../board-math.js";

describe("competitionSinceDay (local calendar)", () => {
  it("matches local Y-M-D arithmetic and can diverge from UTC ISO date", () => {
    // 2026-08-30 20:00 in local TZ (CST/CDT offset observed in evidence env)
    const evening = new Date(2026, 7, 30, 20, 0, 0);
    const sinceDay = competitionSinceDay(evening);
    const since = new Date(evening);
    since.setDate(since.getDate() - 30);
    assert.equal(sinceDay, localDateISO(since));
    assert.match(sinceDay, /^\d{4}-\d{2}-\d{2}$/);
    const utcSlice = since.toISOString().slice(0, 10);
    // In US Central (offset 300), this fixture's UTC calendar day differs.
    if (evening.getTimezoneOffset() === 300) {
      assert.notEqual(
        sinceDay,
        utcSlice,
        "local sinceDay must not use UTC toISOString slice when they diverge"
      );
      assert.equal(sinceDay, "2026-07-31");
      assert.equal(utcSlice, "2026-08-01");
    }
  });
});

describe("weightLineFromSeries (stable same-day order)", () => {
  it("uses earliest created_at as start when two weigh-ins share recorded_on", () => {
    const line = weightLineFromSeries([
      {
        weight_lbs: 198,
        recorded_on: "2026-08-20",
        created_at: "2026-08-20T18:00:00Z",
      },
      {
        weight_lbs: 200,
        recorded_on: "2026-08-20",
        created_at: "2026-08-20T10:00:00Z",
      },
      {
        weight_lbs: 195,
        recorded_on: "2026-08-25",
        created_at: "2026-08-25T12:00:00Z",
      },
    ]);
    assert.equal(line, "200 → 195 lbs (-5.0 over 30 days)");
  });

  it("does not flip delta if same-day rows arrive out of order", () => {
    const flippedInput = weightLineFromSeries([
      {
        weight_lbs: 195,
        recorded_on: "2026-08-25",
        created_at: "2026-08-25T12:00:00Z",
      },
      {
        weight_lbs: 200,
        recorded_on: "2026-08-20",
        created_at: "2026-08-20T18:00:00Z",
      },
      {
        weight_lbs: 190,
        recorded_on: "2026-08-20",
        created_at: "2026-08-20T09:00:00Z",
      },
    ]);
    // earliest same-day is 190 at 09:00, latest overall 195 → +5.0
    assert.equal(flippedInput, "190 → 195 lbs (+5.0 over 30 days)");
  });
});

describe("profileUpdateStatus (zero-row is failure)", () => {
  it("treats empty select payload as failure, not success", () => {
    const res = profileUpdateStatus([], null);
    assert.equal(res.ok, false);
    assert.match(res.message, /No profile row/i);
    assert.equal(/Display name saved/i.test(res.message), false);
  });

  it("succeeds only when a row is returned", () => {
    const res = profileUpdateStatus([{ id: "abc" }], null);
    assert.equal(res.ok, true);
    assert.equal(res.message, "Display name saved.");
  });
});
