import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_MAX_INPUT_BYTES,
  avatarObjectPath,
  validateAvatarFile,
} from "../avatar.js";

describe("validateAvatarFile", () => {
  it("rejects missing and unsupported files", () => {
    assert.equal(validateAvatarFile(null), "Choose a photo to upload.");
    assert.equal(
      validateAvatarFile({ type: "image/gif", size: 1000 }),
      "Use a JPEG, PNG, or WebP photo."
    );
  });

  it("rejects files over the input limit", () => {
    assert.equal(
      validateAvatarFile({
        type: "image/jpeg",
        size: AVATAR_MAX_INPUT_BYTES + 1,
      }),
      "Photo is too large. Choose one under 5 MB."
    );
  });

  it("accepts supported types within size limit", () => {
    assert.equal(
      validateAvatarFile({ type: "image/webp", size: 1024 }),
      null
    );
  });

  it("accepts known extensions when MIME type is missing or generic", () => {
    assert.equal(
      validateAvatarFile({ type: "", name: "photo.jpg", size: 1024 }),
      null
    );
    assert.equal(
      validateAvatarFile({ name: "photo.JPEG", size: 1024 }),
      null
    );
    assert.equal(
      validateAvatarFile({
        type: "application/octet-stream",
        name: "photo.jpg",
        size: 1024,
      }),
      null
    );
    assert.equal(
      validateAvatarFile({
        type: "image/jpg",
        name: "photo.jpg",
        size: 1024,
      }),
      null
    );
    assert.equal(
      validateAvatarFile({
        type: "image/x-png",
        name: "photo.png",
        size: 1024,
      }),
      null
    );
    assert.equal(
      validateAvatarFile({
        type: "image/pjpeg",
        name: "photo.jpeg",
        size: 1024,
      }),
      null
    );
    assert.equal(
      validateAvatarFile({
        type: "image/jfif",
        name: "photo.jpg",
        size: 1024,
      }),
      null
    );
  });
});

describe("avatarObjectPath", () => {
  it("stores avatars under the user id folder", () => {
    const uid = "11111111-1111-1111-1111-111111111111";
    assert.equal(avatarObjectPath(uid), `${uid}/avatar.webp`);
    assert.equal(avatarObjectPath(uid, "png"), `${uid}/avatar.png`);
  });
});
