import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_INVALID_MESSAGE,
  INVITE_MISSING_CONFIG_MESSAGE,
  INVITE_REQUIRED_MESSAGE,
  normalizeInviteCode,
  validateSignupInvite,
} from "../invite.js";

describe("normalizeInviteCode", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeInviteCode("  Family-Join  "), "family-join");
  });
});

describe("validateSignupInvite", () => {
  it("blocks signup when captain has not set a code", () => {
    assert.equal(validateSignupInvite("anything", ""), INVITE_MISSING_CONFIG_MESSAGE);
    assert.equal(validateSignupInvite("anything", undefined), INVITE_MISSING_CONFIG_MESSAGE);
  });

  it("requires an entered code when config has one", () => {
    assert.equal(validateSignupInvite("", "family-join"), INVITE_REQUIRED_MESSAGE);
    assert.equal(validateSignupInvite("   ", "family-join"), INVITE_REQUIRED_MESSAGE);
  });

  it("rejects the wrong code", () => {
    assert.equal(
      validateSignupInvite("wrong", "family-join"),
      INVITE_INVALID_MESSAGE
    );
  });

  it("accepts the correct code ignoring case and surrounding spaces", () => {
    assert.equal(validateSignupInvite("  Family-Join  ", "family-join"), null);
    assert.equal(validateSignupInvite("FAMILY-JOIN", "Family-Join"), null);
  });
});
