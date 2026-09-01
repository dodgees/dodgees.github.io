import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  boardMemberAccessibleName,
  competitionSinceDay,
  formatWeightDelta,
  isMissingAvatarPathError,
  localDateISO,
  missingAvatarPathOperatorMessage,
  profileUpdateStatus,
  readBoardSortPreference,
  sortBoardMembers,
  weightLineFromSeries,
  weightPhraseForA11y,
  weightSummaryFromSeries,
  writeBoardSortPreference,
  loadBoardErrorShouldKeepBoard,
  personalProgressFromLogs,
  personalProgressUnavailable,
  BOARD_SORT_STORAGE_KEY,
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

describe("weightSummaryFromSeries", () => {
  it("exposes delta and glanceable primary/secondary for range summaries", () => {
    const series = [
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
    ];
    const summary = weightSummaryFromSeries(series);
    assert.equal(summary.kind, "range");
    assert.equal(summary.delta, -5);
    assert.equal(summary.primary, "−5.0 lbs");
    assert.equal(summary.secondary, "200 → 195 lbs");
    assert.equal(summary.text, weightLineFromSeries(series));
  });
});

describe("formatWeightDelta", () => {
  it("formats loss with minus and gain with plus", () => {
    assert.equal(formatWeightDelta(-5), "−5.0 lbs");
    assert.equal(formatWeightDelta(2.5), "+2.5 lbs");
    assert.equal(formatWeightDelta(0), "0.0 lbs");
    assert.equal(formatWeightDelta(null), null);
  });
});

describe("boardMemberAccessibleName", () => {
  it("builds a coherent ranked name with weight and exercise", () => {
    const name = boardMemberAccessibleName(1, {
      name: "Alex",
      mins: 30,
      weight: { kind: "range", delta: -5, latestLbs: 195, startLbs: 200 },
    });
    assert.equal(name, "1. Alex, down 5 pounds, 30 minutes exercise");
  });

  it("appends a self marker when isSelf is true", () => {
    const name = boardMemberAccessibleName(
      2,
      {
        name: "Erik",
        mins: 30,
        weight: { kind: "range", delta: -3, latestLbs: 197, startLbs: 200 },
      },
      true
    );
    assert.equal(name, "2. Erik, down 3 pounds, 30 minutes exercise, you");
  });

  it("handles empty weigh-ins and singular minute", () => {
    assert.equal(
      boardMemberAccessibleName(2, {
        name: "Bea",
        mins: 1,
        weight: { kind: "empty", delta: null },
      }),
      "2. Bea, no weigh-ins, 1 minute exercise"
    );
    assert.equal(
      weightPhraseForA11y({ kind: "single", delta: null, latestLbs: 180, startLbs: 180 }),
      "180 pounds"
    );
    assert.equal(
      weightPhraseForA11y({ kind: "range", delta: 2.5 }),
      "up 2.5 pounds"
    );
  });
});

describe("sortBoardMembers", () => {
  const members = [
    { name: "Ada", mins: 10, weight: { delta: -2 } },
    { name: "Bea", mins: 40, weight: { delta: -5 } },
    { name: "Cal", mins: 40, weight: { delta: null } },
    { name: "Dee", mins: 5, weight: { delta: 1 } },
  ];

  it("orders by exercise minutes then name", () => {
    const ordered = sortBoardMembers("exercise", members).map((m) => m.name);
    assert.deepEqual(ordered, ["Bea", "Cal", "Ada", "Dee"]);
  });

  it("orders by weight loss (most negative first), nulls last", () => {
    const ordered = sortBoardMembers("weight", members).map((m) => m.name);
    assert.deepEqual(ordered, ["Bea", "Ada", "Dee", "Cal"]);
  });
});

describe("board sort preference storage", () => {
  it("defaults to exercise and round-trips weight", () => {
    const store = new Map();
    const fake = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };
    assert.equal(readBoardSortPreference(fake), "exercise");
    assert.equal(writeBoardSortPreference("weight", fake), "weight");
    assert.equal(store.get(BOARD_SORT_STORAGE_KEY), "weight");
    assert.equal(readBoardSortPreference(fake), "weight");
    assert.equal(writeBoardSortPreference("exercise", fake), "exercise");
    assert.equal(readBoardSortPreference(fake), "exercise");
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

  it("rewrites missing avatar_path errors to the captain SQL message", () => {
    const res = profileUpdateStatus(null, {
      code: "42703",
      message: "column profiles.avatar_path does not exist",
    });
    assert.equal(res.ok, false);
    assert.match(res.message, /migrate-avatar-path\.sql/);
    assert.match(res.message, /Weigh-ins, exercise, and the board still work/i);
    assert.equal(res.message, missingAvatarPathOperatorMessage());
  });
});

describe("isMissingAvatarPathError", () => {
  it("detects Postgres undefined_column and PostgREST schema-cache misses", () => {
    assert.equal(
      isMissingAvatarPathError({
        code: "42703",
        message: 'column "avatar_path" of relation "profiles" does not exist',
      }),
      true
    );
    assert.equal(
      isMissingAvatarPathError({
        code: "PGRST204",
        message: "Could not find the 'avatar_path' column of 'profiles' in the schema cache",
      }),
      true
    );
    assert.equal(
      isMissingAvatarPathError({
        message: "column profiles.avatar_path does not exist",
      }),
      true
    );
    assert.equal(
      isMissingAvatarPathError({ message: "permission denied for table profiles" }),
      false
    );
    assert.match(missingAvatarPathOperatorMessage(), /migrate-avatar-path\.sql/);
  });
});

describe("personalProgressFromLogs", () => {
  it("shows empty CTA state with no weigh-ins and sums exercise", () => {
    const progress = personalProgressFromLogs([], 45);
    assert.equal(progress.kind, "empty");
    assert.equal(progress.exerciseMinutes, 45);
    assert.equal(progress.exerciseLabel, "45 minutes");
    assert.equal(progress.cta?.logMode, "weight");
    assert.match(progress.emptyTitle, /progress/i);
    assert.equal(progress.hero, null);
  });

  it("uses earliest→latest delta as hero with total lost/gained wording", () => {
    const series = [
      {
        weight_lbs: 200,
        recorded_on: "2026-08-01",
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        weight_lbs: 187.6,
        recorded_on: "2026-08-20",
        created_at: "2026-08-20T10:00:00Z",
      },
    ];
    const progress = personalProgressFromLogs(series, 120);
    assert.equal(progress.kind, "range");
    assert.equal(progress.hero, "−12.4 lbs");
    assert.equal(progress.heroCaption, "total lost");
    assert.equal(progress.changeTone, "down");
    assert.equal(progress.startDisplay, "200.0 lbs");
    assert.equal(progress.latestDisplay, "187.6 lbs");
    assert.equal(progress.exerciseLabel, "120 minutes");
    assert.equal(progress.cta, null);
    // Same delta as board summary
    assert.equal(progress.weight.delta, weightSummaryFromSeries(series).delta);
  });

  it("labels gains and prompts for a second weigh-in when only one exists", () => {
    const gain = personalProgressFromLogs(
      [
        {
          weight_lbs: 180,
          recorded_on: "2026-08-01",
          created_at: "2026-08-01T10:00:00Z",
        },
        {
          weight_lbs: 182.5,
          recorded_on: "2026-08-15",
          created_at: "2026-08-15T10:00:00Z",
        },
      ],
      1
    );
    assert.equal(gain.hero, "+2.5 lbs");
    assert.equal(gain.heroCaption, "total gained");
    assert.equal(gain.changeTone, "up");
    assert.equal(gain.exerciseLabel, "1 minute");

    const single = personalProgressFromLogs(
      [
        {
          weight_lbs: 190,
          recorded_on: "2026-08-10",
          created_at: "2026-08-10T10:00:00Z",
        },
      ],
      0
    );
    assert.equal(single.kind, "single");
    assert.equal(single.hero, null);
    assert.equal(single.startDisplay, "190.0 lbs");
    assert.equal(single.latestDisplay, "190.0 lbs");
    assert.equal(single.cta?.label, "Log another weigh-in");
  });
});

describe("personalProgressUnavailable", () => {
  it("is distinct from empty and has no log CTA", () => {
    const unavailable = personalProgressUnavailable();
    const empty = personalProgressFromLogs([], 0);
    assert.equal(unavailable.kind, "unavailable");
    assert.equal(unavailable.cta, null);
    assert.notEqual(unavailable.kind, empty.kind);
    assert.notEqual(unavailable.emptyTitle, empty.emptyTitle);
    assert.equal(empty.cta?.logMode, "weight");
  });
});

describe("loadBoardErrorShouldKeepBoard", () => {
  it("keeps the prior board when a superseding refresh fails", () => {
    const previousBoard = [{ id: "a", name: "Alex" }];
    assert.equal(loadBoardErrorShouldKeepBoard(2, previousBoard, 1), true);
    assert.equal(loadBoardErrorShouldKeepBoard(2, null, 1), false);
    assert.equal(loadBoardErrorShouldKeepBoard(1, previousBoard, 1), false);
  });
});
