import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_REFRESH_INTERVAL_MS,
  shouldPollOnVisibility,
  shouldRunLiveRefresh,
} from "../live-refresh.js";

describe("shouldRunLiveRefresh", () => {
  it("runs only when signed in, visible, and idle", () => {
    assert.equal(
      shouldRunLiveRefresh({
        signedIn: true,
        documentHidden: false,
        pollInFlight: false,
      }),
      true
    );
  });

  it("skips when signed out, hidden, or already polling", () => {
    assert.equal(
      shouldRunLiveRefresh({
        signedIn: false,
        documentHidden: false,
        pollInFlight: false,
      }),
      false
    );
    assert.equal(
      shouldRunLiveRefresh({
        signedIn: true,
        documentHidden: true,
        pollInFlight: false,
      }),
      false
    );
    assert.equal(
      shouldRunLiveRefresh({
        signedIn: true,
        documentHidden: false,
        pollInFlight: true,
      }),
      false
    );
  });

  it("exports a lightweight interval (under a minute)", () => {
    assert.ok(LIVE_REFRESH_INTERVAL_MS >= 15_000);
    assert.ok(LIVE_REFRESH_INTERVAL_MS <= 60_000);
  });
});

describe("shouldPollOnVisibility", () => {
  it("allows the first poll and then enforces the gap", () => {
    assert.equal(shouldPollOnVisibility(0, 10_000, 5_000), true);
    assert.equal(shouldPollOnVisibility(9_000, 10_000, 5_000), false);
    assert.equal(shouldPollOnVisibility(4_000, 10_000, 5_000), true);
  });
});
