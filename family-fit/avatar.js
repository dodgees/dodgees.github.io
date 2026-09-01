/**
 * Avatar upload helpers for Family Fit (testable without Supabase).
 */

export const AVATAR_BUCKET = "avatars";

/** Max bytes after client compression (512 KiB). */
export const AVATAR_MAX_BYTES = 512 * 1024;

/** Max raw file size before compression (5 MiB). */
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Longest edge after resize (px). */
export const AVATAR_MAX_DIMENSION = 512;

export const AVATAR_ACCEPTED_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ACCEPTED_SET = new Set(AVATAR_ACCEPTED_TYPES);
const ACCEPTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const EXTENSION_FALLBACK_MIMES = new Set([
  "",
  "application/octet-stream",
  "image/jpg",
  "image/jfif",
  "image/x-png",
  "image/pjpeg",
]);

function hasAcceptedAvatarExtension(file) {
  const name = String(file.name || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return ACCEPTED_EXTENSIONS.has(name.slice(dot));
}

function isAcceptedAvatarType(file) {
  if (ACCEPTED_SET.has(file.type)) return true;
  if (
    EXTENSION_FALLBACK_MIMES.has(file.type || "") &&
    hasAcceptedAvatarExtension(file)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {File | null | undefined} file
 * @returns {string | null} user-facing error, or null if OK
 */
export function validateAvatarFile(file) {
  if (!file) return "Choose a photo to upload.";
  if (!isAcceptedAvatarType(file)) {
    return "Use a JPEG, PNG, or WebP photo.";
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    return "Photo is too large. Choose one under 5 MB.";
  }
  return null;
}

/**
 * @param {string | null | undefined} userId
 * @param {"webp"|"jpeg"|"png"} ext
 */
export function avatarObjectPath(userId, ext = "webp") {
  return `${userId}/avatar.${ext}`;
}

/**
 * Resize/compress an image file in the browser.
 * @param {File} file
 * @returns {Promise<{ blob: Blob, contentType: string, ext: "webp"|"jpeg"|"png" }>}
 */
async function decodeImageBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

export async function prepareAvatarFile(file) {
  const err = validateAvatarFile(file);
  if (err) throw new Error(err);

  const bitmap = await decodeImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      AVATAR_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare photo.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const preferWebp = file.type !== "image/png";
    const attempts = preferWebp
      ? [
          { type: "image/webp", ext: "webp", quality: 0.82 },
          { type: "image/jpeg", ext: "jpeg", quality: 0.85 },
        ]
      : [
          { type: "image/png", ext: "png", quality: undefined },
          { type: "image/webp", ext: "webp", quality: 0.82 },
        ];

    for (const attempt of attempts) {
      const blob = await canvasToBlob(canvas, attempt.type, attempt.quality);
      if (blob.size <= AVATAR_MAX_BYTES) {
        return { blob, contentType: attempt.type, ext: attempt.ext };
      }
    }

    throw new Error(
      "Photo is still too large after compression. Try a smaller image."
    );
  } finally {
    bitmap.close?.();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not compress photo."));
        else resolve(blob);
      },
      type,
      quality
    );
  });
}
