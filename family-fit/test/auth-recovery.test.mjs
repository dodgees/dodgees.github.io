import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RECOVERY_LINK_FAILED_NOTICE,
  resolvePendingPasswordRecovery,
} from "../auth-recovery.js";

describe("resolvePendingPasswordRecovery", () => {
  it("continues when recovery is not pending", () => {
    assert.equal(resolvePendingPasswordRecovery(false, null), "continue");
    assert.equal(resolvePendingPasswordRecovery(false, { user: {} }), "continue");
  });

  it("shows the choose-new-password form when a recovery session exists", () => {
    assert.equal(
      resolvePendingPasswordRecovery(true, { user: { id: "u1" } }),
      "show-recovery"
    );
  });

  it("treats a recovery URL with no session as a failed or expired link", () => {
    // After getSession (auth init finished), type=recovery in the URL with null
    // session must not keep the "Opening your reset link…" trap.
    assert.equal(resolvePendingPasswordRecovery(true, null), "link-failed");
    assert.equal(resolvePendingPasswordRecovery(true, undefined), "link-failed");
  });
});

describe("RECOVERY_LINK_FAILED_NOTICE", () => {
  it("points families back to Forgot password?", () => {
    assert.match(RECOVERY_LINK_FAILED_NOTICE, /Forgot password\?/);
    assert.match(RECOVERY_LINK_FAILED_NOTICE, /expired|already used/i);
  });
});
