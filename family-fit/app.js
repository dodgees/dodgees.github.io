import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  AVATAR_BUCKET,
  avatarObjectPath,
  prepareAvatarFile,
  validateAvatarFile,
} from "./avatar.js";
import {
  boardMemberAccessibleName,
  competitionSinceDay,
  isMissingAvatarPathError,
  localDateISO,
  loadBoardErrorShouldKeepBoard,
  missingAvatarPathOperatorMessage,
  personalProgressFromSummary,
  personalProgressUnavailable,
  profileUpdateStatus,
  readBoardSortPreference,
  sortBoardMembers,
  weightSummaryFromSeries,
  writeBoardSortPreference,
} from "./board-math.js";
import {
  COMMENT_MAX_LENGTH,
  REACTION_EMOJIS,
  aggregateReactions,
  entryKey,
  entryKeyFromRow,
  entryTargetColumns,
  findOwnReactionId,
  normalizeCommentBody,
} from "./encouragement.js";

const cfg = window.FAMILY_FIT_CONFIG || {};
const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);

const els = {
  setup: document.getElementById("setup-banner"),
  auth: document.getElementById("auth-panel"),
  app: document.getElementById("app-panel"),
  authForm: document.getElementById("sign-in-form"),
  authError: document.getElementById("auth-error"),
  authNotice: document.getElementById("auth-notice"),
  authHint: document.getElementById("auth-hint"),
  authSubmitBtn: document.getElementById("auth-submit-btn"),
  authModeSignin: document.getElementById("auth-mode-signin"),
  authModeSignup: document.getElementById("auth-mode-signup"),
  confirmPasswordField: document.getElementById("confirm-password-field"),
  signOut: document.getElementById("sign-out-btn"),
  whoami: document.getElementById("whoami"),
  editNameBtn: document.getElementById("edit-name-btn"),
  profileEditor: document.getElementById("profile-editor"),
  profileForm: document.getElementById("profile-form"),
  profileAvatarInitials: document.getElementById("profile-avatar-initials"),
  profileAvatarImg: document.getElementById("profile-avatar-img"),
  whoamiInitials: document.getElementById("whoami-initials"),
  whoamiAvatarImg: document.getElementById("whoami-avatar-img"),
  avatarFileInput: document.getElementById("avatar-file-input"),
  avatarRemoveBtn: document.getElementById("avatar-remove-btn"),
  avatarError: document.getElementById("avatar-error"),
  weightForm: document.getElementById("weight-form"),
  exerciseForm: document.getElementById("exercise-form"),
  weightPanel: document.getElementById("weight-panel"),
  exercisePanel: document.getElementById("exercise-panel"),
  openWeightBtn: document.getElementById("open-weight-btn"),
  openExerciseBtn: document.getElementById("open-exercise-btn"),
  dockWeightBtn: document.getElementById("dock-weight-btn"),
  dockExerciseBtn: document.getElementById("dock-exercise-btn"),
  logSection: document.getElementById("log-section"),
  leaderboard: document.getElementById("leaderboard"),
  boardError: document.getElementById("board-error"),
  boardSortStatus: document.getElementById("board-sort-status"),
  sortExerciseBtn: document.getElementById("sort-exercise-btn"),
  sortWeightBtn: document.getElementById("sort-weight-btn"),
  recentEntries: document.getElementById("recent-entries"),
  personalProgress: document.getElementById("personal-progress"),
  status: document.getElementById("form-status"),
};

let supabase = null;
let session = null;
/** @type {"signin"|"signup"} */
let authMode = "signin";
/** @type {"weight"|"exercise"|null} */
let activeLog = null;
/** @type {{ kind: "weight"|"exercise", id: string } | null} */
let highlightTarget = null;
/** @type {"exercise"|"weight"} */
let boardSort = readBoardSortPreference();
/** @type {Array<{ id: string, name: string, weight: object, mins: number, avatarPath: string|null, avatarUrl: string|null }> | null} */
let boardMembers = null;
/** @type {string|null} */
let myAvatarPath = null;
/** @type {string|null} */
let myDisplayName = "";
/** Bumped on avatar upload/remove so in-flight profile/board loads cannot overwrite. */
let avatarRevision = 0;
/** Latest loadBoard call; older completions are discarded after a newer one renders. */
let loadBoardGeneration = 0;
/** Last loadBoard generation that rendered boardMembers. */
let loadBoardRenderedGeneration = 0;
/** Last committed board snapshot for keep-board when overlapping fetches fail. */
let lastRenderedBoardMembers = null;
/** Map entryKey → reaction rows for the visible feed. */
let reactionsByEntry = new Map();
/** Map entryKey → comment rows for the visible feed. */
let commentsByEntry = new Map();
/** Map profile id → display_name for feed authors. */
let profileNameById = new Map();
/** Prevent double-submit on reaction taps. */
let reactionBusyKey = null;
/**
 * Whether profiles.avatar_path exists in production.
 * null = unknown; false = missing (degrade to initials); true = OK.
 */
let avatarPathColumnOk = null;
/** Map storage path → signed URL (refreshed on each board/profile load). */
const avatarUrlByPath = new Map();
const avatarPathsInUse = new Set();
const AVATAR_SIGNED_URL_TTL_SEC = 3600;
const AVATAR_SIGNED_URL_REFRESH_MS = (AVATAR_SIGNED_URL_TTL_SEC - 600) * 1000;
/** @type {ReturnType<typeof setTimeout> | null} */
let avatarUrlRefreshTimer = null;

function clearAvatarUrlRefresh() {
  clearTimeout(avatarUrlRefreshTimer);
  avatarUrlRefreshTimer = null;
}

function scheduleAvatarUrlRefresh() {
  clearAvatarUrlRefresh();
  if (!avatarPathsInUse.size || !session || !supabase) return;
  avatarUrlRefreshTimer = setTimeout(refreshAvatarUrlsInUse, AVATAR_SIGNED_URL_REFRESH_MS);
}

async function refreshAvatarUrlsInUse() {
  if (!session || !supabase || !avatarPathsInUse.size) return;
  await resolveAvatarUrls([...avatarPathsInUse], { retainPaths: true });
  syncProfileAvatarUi();
  if (boardMembers) {
    boardMembers = boardMembers.map((m) => ({
      ...m,
      avatarUrl: m.avatarPath ? avatarUrlByPath.get(m.avatarPath) || null : null,
    }));
    renderBoard();
  }
  scheduleAvatarUrlRefresh();
}

function todayISO() {
  return localDateISO();
}

function showStatus(msg, kind = "success") {
  const el = els.status;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("toast--success", "toast--error", "is-leaving");
    return;
  }
  clearTimeout(showStatus._hide);
  clearTimeout(showStatus._clear);
  el.classList.remove("is-leaving", "toast--success", "toast--error");
  el.classList.add(kind === "error" ? "toast--error" : "toast--success");
  // Unhide before text so aria-live polite can announce submit success.
  el.hidden = false;
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = msg;
  });
  showStatus._hide = setTimeout(() => {
    el.classList.add("is-leaving");
    showStatus._clear = setTimeout(() => {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-leaving", "toast--success", "toast--error");
    }, 220);
  }, 3200);
}

function setAuthError(msg) {
  els.authError.hidden = !msg;
  els.authError.textContent = msg || "";
}

function setAuthNotice(msg) {
  els.authNotice.hidden = !msg;
  els.authNotice.textContent = msg || "";
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "signin";
  const signup = authMode === "signup";
  els.authModeSignin.classList.toggle("is-active", !signup);
  els.authModeSignup.classList.toggle("is-active", signup);
  els.authModeSignin.setAttribute("aria-pressed", signup ? "false" : "true");
  els.authModeSignup.setAttribute("aria-pressed", signup ? "true" : "false");
  els.confirmPasswordField.hidden = !signup;
  const confirmInput = els.authForm.confirm_password;
  if (confirmInput) {
    confirmInput.required = signup;
    confirmInput.disabled = !signup;
    if (!signup) confirmInput.value = "";
  }
  const passwordInput = els.authForm.password;
  if (passwordInput) {
    passwordInput.autocomplete = signup ? "new-password" : "current-password";
    passwordInput.enterKeyHint = "go";
  }
  const submitLabel = signup ? "Create account" : "Sign in";
  els.authSubmitBtn.textContent = submitLabel;
  if (els.authSubmitBtn.dataset.label) {
    els.authSubmitBtn.dataset.label = submitLabel;
  }
  els.authHint.textContent = signup
    ? "Create an account with email and password. If email confirmation is on, check your inbox then sign in; otherwise the family board opens right away. Share this page only with family."
    : "Forgot your password? Ask the captain for help resetting it in Supabase — there’s no self-serve reset here.";
  setAuthError("");
  setAuthNotice("");
}

function authRedirectTo() {
  try {
    const url = new URL(window.location.href);
    let path = url.pathname;
    if (/\.html?$/i.test(path)) {
      path = path.replace(/[^/]+$/, "");
    } else if (!path.endsWith("/")) {
      path += "/";
    }
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return String(window.location.href).replace(/[?#].*$/, "");
  }
}

function setBoardError(msg, { soft = false } = {}) {
  els.boardError.hidden = !msg;
  els.boardError.textContent = msg || "";
  els.boardError.classList.toggle("error", Boolean(msg) && !soft);
  els.boardError.classList.toggle("hint", Boolean(msg) && soft);
  els.boardError.setAttribute("role", soft ? "status" : "alert");
}

function noteMissingAvatarPathColumn() {
  avatarPathColumnOk = false;
  myAvatarPath = null;
  setBoardError(missingAvatarPathOperatorMessage(), { soft: true });
}

function seedDates() {
  const today = todayISO();
  for (const form of [els.weightForm, els.exerciseForm]) {
    const input = form.querySelector('[name="recorded_on"]');
    if (input) input.value = today;
  }
}

function setSubmitting(form, busy) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving…";
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}

function setProfileEditorOpen(open) {
  els.profileEditor.hidden = !open;
  document.body.classList.toggle("profile-editor-open", open);
  els.editNameBtn.setAttribute("aria-expanded", open ? "true" : "false");
  els.editNameBtn.textContent = open ? "Cancel" : "Edit profile";
  if (open) {
    setAvatarError("");
    const input = els.profileForm.display_name;
    input.focus();
    input.select?.();
  }
}

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function setAvatarError(msg) {
  els.avatarError.hidden = !msg;
  els.avatarError.textContent = msg || "";
}

function showAvatarInitials(imgEl, initialsEl) {
  imgEl.onerror = null;
  imgEl.removeAttribute("src");
  imgEl.alt = "";
  imgEl.hidden = true;
  initialsEl.hidden = false;
}

function renderAvatarSlot(initialsEl, imgEl, { name, url }) {
  const initials = initialsFromName(name);
  initialsEl.textContent = initials;
  imgEl.onerror = null;
  if (url) {
    imgEl.onerror = () => showAvatarInitials(imgEl, initialsEl);
    imgEl.src = url;
    imgEl.alt = name ? `${name}'s avatar` : "Your avatar";
    imgEl.hidden = false;
    initialsEl.hidden = true;
  } else {
    showAvatarInitials(imgEl, initialsEl);
  }
}

function handleBoardAvatarError(ev) {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("member-avatar__img")) {
    return;
  }
  const avatar = img.closest(".member-avatar");
  if (!avatar || avatar.querySelector(".member-avatar__initials")) return;
  const name =
    img.closest(".member-card")?.querySelector(".member-name")?.textContent || "";
  img.remove();
  const span = document.createElement("span");
  span.className = "member-avatar__initials";
  span.textContent = initialsFromName(name);
  avatar.appendChild(span);
}

function reconcileMyAvatarPathFromBoard() {
  const selfId = session?.user?.id;
  if (!selfId || !boardMembers) return;
  const self = boardMembers.find((m) => m.id === selfId);
  if (self) myAvatarPath = self.avatarPath;
}

async function patchSelfBoardAvatar() {
  const selfId = session?.user?.id;
  if (!selfId || !boardMembers) return;
  const idx = boardMembers.findIndex((m) => m.id === selfId);
  if (idx < 0) return;
  const avatarPath = myAvatarPath;
  if (avatarPath && !avatarUrlByPath.has(avatarPath)) {
    await resolveAvatarUrls([avatarPath], { retainPaths: true });
  }
  boardMembers[idx] = {
    ...boardMembers[idx],
    avatarPath,
    avatarUrl: avatarPath ? avatarUrlByPath.get(avatarPath) || null : null,
  };
}

function syncProfileAvatarUi() {
  const url = myAvatarPath ? avatarUrlByPath.get(myAvatarPath) || null : null;
  renderAvatarSlot(els.profileAvatarInitials, els.profileAvatarImg, {
    name: myDisplayName,
    url,
  });
  renderAvatarSlot(els.whoamiInitials, els.whoamiAvatarImg, {
    name: myDisplayName,
    url,
  });
  els.avatarRemoveBtn.hidden = !myAvatarPath;
}

async function resolveAvatarUrls(paths, { retainPaths = false } = {}) {
  if (!retainPaths) {
    avatarUrlByPath.clear();
    avatarPathsInUse.clear();
  }
  const unique = [...new Set(paths.filter(Boolean))];
  for (const path of unique) avatarPathsInUse.add(path);
  if (!unique.length || !supabase) {
    scheduleAvatarUrlRefresh();
    return;
  }

  await Promise.all(
    unique.map(async (path) => {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SEC);
      if (!error && data?.signedUrl) avatarUrlByPath.set(path, data.signedUrl);
    })
  );
  scheduleAvatarUrlRefresh();
}

async function uploadAvatar(file) {
  setAvatarError("");
  if (avatarPathColumnOk === false) {
    throw new Error(missingAvatarPathOperatorMessage());
  }
  const prepared = await prepareAvatarFile(file);
  const path = avatarObjectPath(session.user.id, prepared.ext);
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, prepared.blob, {
      upsert: true,
      contentType: prepared.contentType,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", session.user.id)
    .select("id, avatar_path");
  if (isMissingAvatarPathError(error)) {
    noteMissingAvatarPathColumn();
    throw new Error(missingAvatarPathOperatorMessage());
  }
  const result = profileUpdateStatus(data, error);
  if (!result.ok) throw new Error(result.message);
  avatarPathColumnOk = true;

  avatarRevision += 1;
  myAvatarPath = path;
  await resolveAvatarUrls([path], { retainPaths: true });
  syncProfileAvatarUi();
  const boardRefreshed = await loadBoard();
  showStatus(
    boardRefreshed
      ? "Profile photo updated."
      : "Profile photo saved, but the board could not be refreshed.",
    boardRefreshed ? "success" : "error"
  );
}

async function removeAvatar() {
  setAvatarError("");
  if (!myAvatarPath) return;
  if (avatarPathColumnOk === false) {
    throw new Error(missingAvatarPathOperatorMessage());
  }

  const oldPath = myAvatarPath;
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", session.user.id)
    .select("id");
  if (isMissingAvatarPathError(error)) {
    noteMissingAvatarPathColumn();
    throw new Error(missingAvatarPathOperatorMessage());
  }
  const result = profileUpdateStatus(data, error);
  if (!result.ok) throw new Error(result.message);

  avatarRevision += 1;
  myAvatarPath = null;
  syncProfileAvatarUi();

  let removeError = null;
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", session.user.id)
    .maybeSingle();
  if ((currentProfile?.avatar_path || null) !== oldPath) {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
    removeError = error;
  }

  const boardRefreshed = await loadBoard();
  if (!boardRefreshed) {
    showStatus("Photo removed from profile, but the board could not be refreshed.", "error");
  } else if (removeError) {
    showStatus("Photo removed from profile; storage cleanup may have failed.", "error");
  } else {
    showStatus("Profile photo removed.", "success");
  }
}

function setLogMode(mode, { scroll = true, focus = true } = {}) {
  const next = mode === "weight" || mode === "exercise" ? mode : null;
  const entering = Boolean(next && next !== activeLog);
  activeLog = next;

  const weightOpen = activeLog === "weight";
  const exerciseOpen = activeLog === "exercise";

  els.weightPanel.hidden = !weightOpen;
  els.exercisePanel.hidden = !exerciseOpen;

  els.openWeightBtn.classList.toggle("is-active", weightOpen);
  els.openExerciseBtn.classList.toggle("is-active", exerciseOpen);
  els.openWeightBtn.setAttribute("aria-selected", weightOpen ? "true" : "false");
  els.openExerciseBtn.setAttribute("aria-selected", exerciseOpen ? "true" : "false");

  if (!activeLog) return;

  if (entering) {
    seedDates();
  }

  if (scroll) {
    els.logSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (focus) {
    const form = activeLog === "weight" ? els.weightForm : els.exerciseForm;
    const first = form.querySelector(
      activeLog === "weight" ? '[name="weight_lbs"]' : '[name="activity"]'
    );
    requestAnimationFrame(() => first?.focus());
  }
}

function collapseLogForms() {
  setLogMode(null);
}

function renderSignedOut() {
  els.auth.hidden = false;
  els.app.hidden = true;
  document.body.classList.remove("has-log-dock");
  myAvatarPath = null;
  myDisplayName = "";
  avatarRevision = 0;
  avatarPathColumnOk = null;
  loadBoardGeneration = 0;
  loadBoardRenderedGeneration = 0;
  lastRenderedBoardMembers = null;
  avatarUrlByPath.clear();
  avatarPathsInUse.clear();
  clearAvatarUrlRefresh();
  setProfileEditorOpen(false);
  collapseLogForms();
  if (els.personalProgress) {
    els.personalProgress.innerHTML = '<p class="muted">Loading…</p>';
  }
}

function renderSignedIn(user) {
  els.auth.hidden = true;
  els.app.hidden = false;
  document.body.classList.add("has-log-dock");
  els.whoami.textContent = user.email || "Signed in";
  setProfileEditorOpen(false);
  collapseLogForms();
  seedDates();
}

async function fetchOwnProfile(includeAvatarPath) {
  const cols = includeAvatarPath
    ? "display_name, avatar_path"
    : "display_name";
  return supabase
    .from("profiles")
    .select(cols)
    .eq("id", session.user.id)
    .maybeSingle();
}

async function fetchProfiles(includeAvatarPath) {
  const cols = includeAvatarPath
    ? "id, display_name, avatar_path"
    : "id, display_name";
  return supabase.from("profiles").select(cols).order("display_name");
}

async function loadProfile() {
  const avatarRevAtStart = avatarRevision;
  const wantAvatar = avatarPathColumnOk !== false;
  let { data, error } = await fetchOwnProfile(wantAvatar);
  if (isMissingAvatarPathError(error)) {
    noteMissingAvatarPathColumn();
    ({ data, error } = await fetchOwnProfile(false));
  } else if (!error && wantAvatar) {
    avatarPathColumnOk = true;
  }
  if (error) throw error;
  const name = data?.display_name || "";
  myDisplayName = name;
  if (avatarRevAtStart === avatarRevision) {
    myAvatarPath =
      avatarPathColumnOk === false ? null : data?.avatar_path || null;
  }
  els.profileForm.display_name.value = name;
  if (name) {
    els.whoami.textContent = `${name} · ${session.user.email}`;
  }
  await resolveAvatarUrls(myAvatarPath ? [myAvatarPath] : [], { retainPaths: true });
}

function deltaClass(delta) {
  if (delta == null || Number.isNaN(delta) || delta === 0) return "";
  return delta < 0 ? " member-delta--down" : " member-delta--up";
}

function sortLabel(mode) {
  return mode === "weight" ? "weight change" : "exercise";
}

function syncSortControls() {
  const byExercise = boardSort === "exercise";
  els.sortExerciseBtn.classList.toggle("is-active", byExercise);
  els.sortWeightBtn.classList.toggle("is-active", !byExercise);
  els.sortExerciseBtn.setAttribute("aria-pressed", byExercise ? "true" : "false");
  els.sortWeightBtn.setAttribute("aria-pressed", byExercise ? "false" : "true");
  els.boardSortStatus.textContent = `Sorted by ${sortLabel(boardSort)}`;
}

function setBoardSort(mode) {
  boardSort = writeBoardSortPreference(mode);
  syncSortControls();
  if (boardMembers) renderBoard();
}

function emptyStateHtml({ title, body, ctaLabel, logMode, compact = false }) {
  const cls = compact ? "empty-state empty-state--compact" : "empty-state";
  const cta =
    ctaLabel && logMode
      ? `<button type="button" class="btn-primary empty-state__cta" data-open-log="${escapeHtml(logMode)}">${escapeHtml(ctaLabel)}</button>`
      : "";
  return `<div class="${cls}">
    <p class="empty-state__title">${escapeHtml(title)}</p>
    <p class="empty-state__body">${escapeHtml(body)}</p>
    ${cta}
  </div>`;
}

function progressHeroClass(changeTone) {
  if (changeTone === "down") return " personal-progress__hero--down";
  if (changeTone === "up") return " personal-progress__hero--up";
  return "";
}

function renderPersonalProgress(progress) {
  if (!els.personalProgress) return;
  if (!progress) {
    els.personalProgress.innerHTML = '<p class="muted">Loading…</p>';
    return;
  }

  if (progress.kind === "empty" || progress.kind === "unavailable") {
    const exerciseNote =
      progress.kind === "empty" && progress.exerciseMinutes > 0
        ? `<p class="personal-progress__exercise-alone">${escapeHtml(progress.exerciseLabel)} exercise so far — add a weigh-in to track weight change.</p>`
        : "";
    els.personalProgress.innerHTML =
      emptyStateHtml({
        title: progress.emptyTitle,
        body: progress.emptyBody,
        ctaLabel: progress.cta?.label,
        logMode: progress.cta?.logMode,
      }) + exerciseNote;
    return;
  }

  const heroBlock =
    progress.hero != null
      ? `<div class="personal-progress__hero-wrap">
          <p class="personal-progress__hero${progressHeroClass(progress.changeTone)}">${escapeHtml(progress.hero)}</p>
          <p class="personal-progress__hero-caption">${escapeHtml(progress.heroCaption)}</p>
        </div>`
      : `<div class="personal-progress__hero-wrap personal-progress__hero-wrap--pending">
          <p class="personal-progress__hero-caption">${escapeHtml(progress.heroCaption)}</p>
        </div>`;

  const cta =
    progress.cta != null
      ? `<button type="button" class="btn-primary personal-progress__cta" data-open-log="${escapeHtml(progress.cta.logMode)}">${escapeHtml(progress.cta.label)}</button>`
      : "";

  els.personalProgress.innerHTML = `<div class="personal-progress__card">
    ${heroBlock}
    <dl class="personal-progress__stats">
      <div class="personal-progress__stat">
        <dt>Starting</dt>
        <dd>${escapeHtml(progress.startDisplay || "—")}</dd>
      </div>
      <div class="personal-progress__stat">
        <dt>Latest</dt>
        <dd>${escapeHtml(progress.latestDisplay || "—")}</dd>
      </div>
      <div class="personal-progress__stat personal-progress__stat--exercise">
        <dt>Exercise</dt>
        <dd>${escapeHtml(progress.exerciseLabel)}</dd>
      </div>
    </dl>
    ${cta}
  </div>`;
}

function renderBoard() {
  if (!boardMembers) return;

  if (!boardMembers.length) {
    els.leaderboard.innerHTML = emptyStateHtml({
      title: "The board is waiting",
      body: "You’re first here. Log a weigh-in to put a number on the board — family will show up as they join.",
      ctaLabel: "Log a weigh-in",
      logMode: "weight",
    });
    return;
  }

  const selfId = session?.user?.id || null;
  const ordered = sortBoardMembers(boardSort, boardMembers);
  const maxMins = Math.max(0, ...ordered.map((m) => m.mins));

  const cards = ordered.map((m, i) => {
    const rank = i + 1;
    const isSelf = selfId && m.id === selfId;
    const weightClass = deltaClass(m.weight.delta);
    const exerciseLabel = m.mins > 0 ? `${m.mins} min` : "0 min";
    const barPct =
      maxMins > 0 && m.mins > 0
        ? Math.max(8, Math.round((m.mins / maxMins) * 100))
        : 0;
    const selfAttr = isSelf ? ' data-self="true"' : "";
    const selfClass = isSelf ? " is-self" : "";
    const youBadge = isSelf
      ? '<span class="member-you" aria-hidden="true">You</span>'
      : "";
    const a11yName = boardMemberAccessibleName(rank, m, isSelf);
    const avatarHtml = m.avatarUrl
      ? `<img class="member-avatar__img" src="${escapeHtml(m.avatarUrl)}" alt="" loading="lazy" decoding="async">`
      : `<span class="member-avatar__initials">${escapeHtml(initialsFromName(m.name))}</span>`;

    return `<li class="leaderboard-item">
      <article class="member-card${selfClass}"${selfAttr} aria-label="${escapeHtml(a11yName)}">
        <div class="member-rank" aria-hidden="true">${rank}</div>
        <div class="member-avatar" aria-hidden="true">${avatarHtml}</div>
        <div class="member-body" aria-hidden="true">
          <div class="member-top">
            <div class="member-name">${escapeHtml(m.name)}</div>
            ${youBadge}
          </div>
          <div class="member-delta${weightClass}">${escapeHtml(m.weight.primary)}</div>
          <div class="member-range">${escapeHtml(m.weight.secondary)}</div>
          <div class="member-exercise" title="${m.mins} minutes in the last 30 days">
            <span class="exercise-chip">${escapeHtml(exerciseLabel)}</span>
            <span class="exercise-bar"><span class="exercise-bar__fill" style="width:${barPct}%"></span></span>
          </div>
        </div>
      </article>
    </li>`;
  });

  const soloNudge =
    boardMembers.length === 1
      ? emptyStateHtml({
          title: "Just you for now",
          body: "Start the competition with today’s workout — more family will appear here as they sign in.",
          ctaLabel: "Log exercise",
          logMode: "exercise",
          compact: true,
        })
      : "";

  els.leaderboard.innerHTML =
    soloNudge +
    `<ul class="leaderboard-list" aria-label="Competition board ranked list">${cards.join("")}</ul>`;
}

function loadBoardResultIsStale(generation) {
  return generation < loadBoardRenderedGeneration;
}

function commitLoadBoardRender(generation) {
  loadBoardRenderedGeneration = generation;
  lastRenderedBoardMembers = boardMembers
    ? boardMembers.map((m) => ({ ...m }))
    : boardMembers;
  if (avatarPathColumnOk === false) {
    setBoardError(missingAvatarPathOperatorMessage(), { soft: true });
  } else {
    setBoardError("");
  }
}

function syncPersonalProgressFromBoard() {
  const uid = session?.user?.id;
  if (!uid || !boardMembers) {
    renderPersonalProgress(personalProgressFromSummary(null, 0));
    return;
  }
  const self = boardMembers.find((m) => m.id === uid);
  if (!self) {
    renderPersonalProgress(personalProgressFromSummary(null, 0));
    return;
  }
  renderPersonalProgress(personalProgressFromSummary(self.weight, self.mins));
}

async function loadBoard() {
  const generation = ++loadBoardGeneration;
  const avatarRevAtStart = avatarRevision;
  const previousRenderedGeneration = loadBoardRenderedGeneration;
  setBoardError("");
  els.leaderboard.innerHTML = '<p class="muted">Loading…</p>';
  renderPersonalProgress(null);
  boardMembers = null;

  const sinceDay = competitionSinceDay();
  const wantAvatar = avatarPathColumnOk !== false;

  const [profilesRes0, weighRes, exerciseRes] = await Promise.all([
    fetchProfiles(wantAvatar),
    supabase
      .from("weigh_ins")
      .select("user_id, weight_lbs, recorded_on, created_at")
      .gte("recorded_on", sinceDay)
      .order("recorded_on", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("exercise_logs")
      .select("user_id, duration_minutes, recorded_on, activity")
      .gte("recorded_on", sinceDay),
  ]);

  let profilesRes = profilesRes0;
  let missingAvatarColumn = false;
  if (isMissingAvatarPathError(profilesRes.error)) {
    missingAvatarColumn = true;
    noteMissingAvatarPathColumn();
    profilesRes = await fetchProfiles(false);
  } else if (!profilesRes.error && wantAvatar) {
    avatarPathColumnOk = true;
  }

  if (profilesRes.error || weighRes.error || exerciseRes.error) {
    if (loadBoardResultIsStale(generation)) return true;
    if (generation !== loadBoardGeneration) {
      if (boardMembers !== null) return true;
      if (loadBoardGeneration > generation) return true;
      return generation <= loadBoardRenderedGeneration;
    }
    if (
      loadBoardErrorShouldKeepBoard(
        generation,
        lastRenderedBoardMembers,
        previousRenderedGeneration
      )
    ) {
      boardMembers = lastRenderedBoardMembers.map((m) => ({ ...m }));
      await patchSelfBoardAvatar();
      commitLoadBoardRender(generation);
      renderBoard();
      syncPersonalProgressFromBoard();
      return true;
    }
    if (boardMembers !== null) return true;
    const err = profilesRes.error || weighRes.error || exerciseRes.error;
    setBoardError(
      isMissingAvatarPathError(err)
        ? missingAvatarPathOperatorMessage()
        : err.message
    );
    els.leaderboard.innerHTML = "";
    renderPersonalProgress(personalProgressUnavailable());
    return false;
  }

  if (missingAvatarColumn || avatarPathColumnOk === false) {
    setBoardError(missingAvatarPathOperatorMessage(), { soft: true });
  }

  const profiles = profilesRes.data || [];
  if (!profiles.length) {
    if (loadBoardResultIsStale(generation)) return true;
    boardMembers = [];
    commitLoadBoardRender(generation);
    renderBoard();
    syncPersonalProgressFromBoard();
    return true;
  }

  if (loadBoardResultIsStale(generation)) return true;
  const avatarPaths =
    avatarPathColumnOk === false
      ? []
      : profiles.map((p) => p.avatar_path);
  if (myAvatarPath && !avatarPaths.includes(myAvatarPath)) {
    avatarPaths.push(myAvatarPath);
  }
  await resolveAvatarUrls(avatarPaths);
  if (loadBoardResultIsStale(generation)) return true;

  const weighByUser = new Map();
  for (const row of weighRes.data || []) {
    if (!weighByUser.has(row.user_id)) weighByUser.set(row.user_id, []);
    weighByUser.get(row.user_id).push(row);
  }

  const minutesByUser = new Map();
  for (const row of exerciseRes.data || []) {
    minutesByUser.set(
      row.user_id,
      (minutesByUser.get(row.user_id) || 0) + Number(row.duration_minutes)
    );
  }

  boardMembers = profiles.map((p) => {
    const series = weighByUser.get(p.id) || [];
    const weight = weightSummaryFromSeries(series);
    const mins = minutesByUser.get(p.id) || 0;
    const avatarPath =
      avatarPathColumnOk === false ? null : p.avatar_path || null;
    return {
      id: p.id,
      name: p.display_name || "Family member",
      weight,
      mins,
      avatarPath,
      avatarUrl: avatarPath ? avatarUrlByPath.get(avatarPath) || null : null,
    };
  });

  if (avatarRevAtStart !== avatarRevision) {
    await patchSelfBoardAvatar();
    if (loadBoardResultIsStale(generation)) return true;
  }

  commitLoadBoardRender(generation);
  syncSortControls();
  renderBoard();
  syncPersonalProgressFromBoard();
  return true;
}

async function loadRecentEntries() {
  const mark = highlightTarget;
  highlightTarget = null;
  const listEl = els.recentEntries;
  if (!listEl) return;

  listEl.innerHTML = '<p class="muted">Loading…</p>';
  const uid = session.user.id;

  const [w, e, profilesRes] = await Promise.all([
    supabase
      .from("weigh_ins")
      .select("id, user_id, weight_lbs, recorded_on, note, created_at")
      .order("recorded_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(16),
    supabase
      .from("exercise_logs")
      .select("id, user_id, activity, duration_minutes, recorded_on, note, created_at")
      .order("recorded_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(16),
    supabase.from("profiles").select("id, display_name"),
  ]);

  if (w.error || e.error) {
    listEl.innerHTML = `<p class="error">${escapeHtml((w.error || e.error).message)}</p>`;
    return;
  }

  profileNameById = new Map();
  for (const p of profilesRes.data || []) {
    profileNameById.set(p.id, p.display_name || "Family member");
  }
  if (profilesRes.error && boardMembers) {
    for (const m of boardMembers) profileNameById.set(m.id, m.name);
  }

  /** @type {Array<{ kind: "weight"|"exercise", id: string, userId: string, sort: string, detail: string, recordedOn: string }>} */
  const rows = [];
  for (const row of w.data || []) {
    const note = row.note ? " — " + row.note : "";
    rows.push({
      kind: "weight",
      id: row.id,
      userId: row.user_id,
      sort: row.recorded_on + "T" + (row.created_at || ""),
      detail: `${row.weight_lbs} lbs${note}`,
      recordedOn: row.recorded_on,
    });
  }
  for (const row of e.data || []) {
    const note = row.note ? " — " + row.note : "";
    rows.push({
      kind: "exercise",
      id: row.id,
      userId: row.user_id,
      sort: row.recorded_on + "T" + (row.created_at || ""),
      detail: `${row.activity} · ${row.duration_minutes} min${note}`,
      recordedOn: row.recorded_on,
    });
  }
  rows.sort((a, b) => (a.sort < b.sort ? 1 : -1));
  const visible = rows.slice(0, 14);

  if (!visible.length) {
    reactionsByEntry = new Map();
    commentsByEntry = new Map();
    listEl.innerHTML = emptyStateHtml({
      title: "No entries yet",
      body: "Family weigh-ins and workouts will show up here. Log one to get started — then cheer each other on.",
      ctaLabel: "Log a weigh-in",
      logMode: "weight",
    });
    return;
  }

  const weighIds = visible.filter((r) => r.kind === "weight").map((r) => r.id);
  const exerciseIds = visible.filter((r) => r.kind === "exercise").map((r) => r.id);

  const [commentsRes, reactionsRes] = await Promise.all([
    fetchEncouragementRows("entry_comments", weighIds, exerciseIds),
    fetchEncouragementRows("entry_reactions", weighIds, exerciseIds),
  ]);

  commentsByEntry = groupByEntryKey(commentsRes.rows || []);
  reactionsByEntry = groupByEntryKey(reactionsRes.rows || []);

  const encourageError = commentsRes.error || reactionsRes.error;
  let marked = false;
  listEl.innerHTML =
    (encourageError
      ? `<p class="error">${escapeHtml(
          encourageError.message ||
            "Could not load comments or reactions. Ask the captain to re-run schema.sql."
        )}</p>`
      : "") +
    visible
      .map((r) => {
        let html = renderEntryCard(r, uid);
        if (mark && !marked && r.kind === mark.kind && r.id === mark.id) {
          marked = true;
          html = html.replace('class="entry-row"', 'class="entry-row is-fresh"');
        }
        return html;
      })
      .join("");

  if (marked) {
    const fresh = listEl.querySelector(".entry-row.is-fresh");
    fresh?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/**
 * @param {"entry_comments"|"entry_reactions"} table
 * @param {string[]} weighIds
 * @param {string[]} exerciseIds
 */
async function fetchEncouragementRows(table, weighIds, exerciseIds) {
  const select =
    table === "entry_comments"
      ? "id, author_id, weigh_in_id, exercise_log_id, body, created_at, updated_at"
      : "id, user_id, weigh_in_id, exercise_log_id, emoji, created_at";

  const queries = [];
  if (weighIds.length) {
    queries.push(
      supabase.from(table).select(select).in("weigh_in_id", weighIds)
    );
  }
  if (exerciseIds.length) {
    queries.push(
      supabase.from(table).select(select).in("exercise_log_id", exerciseIds)
    );
  }
  if (!queries.length) return { rows: [], error: null };

  const results = await Promise.all(queries);
  const error = results.find((r) => r.error)?.error || null;
  if (error) return { rows: [], error };
  return { rows: results.flatMap((r) => r.data || []), error: null };
}

/** @param {Array<{ weigh_in_id?: string|null, exercise_log_id?: string|null }>} rows */
function groupByEntryKey(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = entryKeyFromRow(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }
  return map;
}

/**
 * @param {{ kind: "weight"|"exercise", id: string, userId: string, detail: string, recordedOn: string }} entry
 * @param {string} currentUserId
 */
function renderEntryCard(entry, currentUserId) {
  const key = entryKey(entry.kind, entry.id);
  const name = profileNameById.get(entry.userId) || "Family member";
  const isSelf = entry.userId === currentUserId;
  const who = isSelf
    ? `${escapeHtml(name)} <span class="entry-who__you">(you)</span>`
    : escapeHtml(name);
  const badgeClass =
    entry.kind === "weight" ? "entry-badge entry-badge--weight" : "entry-badge entry-badge--exercise";
  const badgeLabel = entry.kind === "weight" ? "Weight" : "Exercise";

  return `<article class="entry-row" data-kind="${escapeHtml(entry.kind)}" data-id="${escapeHtml(entry.id)}" data-entry-key="${escapeHtml(key)}">
    <div class="entry-row__top">
      <span class="${badgeClass}">${badgeLabel}</span>
      <div class="entry-main">
        <span class="entry-who">${who}</span>
        <span class="entry-detail">${escapeHtml(entry.detail)}</span>
        <span class="entry-meta">${escapeHtml(entry.recordedOn)}</span>
      </div>
    </div>
    <div class="entry-encourage">
      ${renderReactionRow(key, currentUserId)}
      ${renderCommentBlock(key, currentUserId)}
    </div>
  </article>`;
}

function renderReactionRow(key, currentUserId) {
  const chips = aggregateReactions(reactionsByEntry.get(key) || [], currentUserId);
  return `<div class="reaction-row" role="group" aria-label="Reactions">
    ${chips
      .map((c) => {
        const countHtml =
          c.count > 0
            ? `<span class="reaction-chip__count">${escapeHtml(String(c.count))}</span>`
            : `<span class="reaction-chip__count" hidden>0</span>`;
        const pressed = c.mine ? "true" : "false";
        const mineClass = c.mine ? " is-mine" : "";
        const label = c.mine
          ? `Remove ${c.emoji} reaction`
          : `Add ${c.emoji} reaction`;
        return `<button type="button" class="reaction-chip${mineClass}" data-react-emoji="${escapeHtml(c.emoji)}" aria-pressed="${pressed}" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${c.emoji}</span>${countHtml}</button>`;
      })
      .join("")}
  </div>`;
}

function renderCommentBlock(key, currentUserId) {
  const comments = commentsByEntry.get(key) || [];
  let listHtml;
  if (!comments.length) {
    listHtml = `<p class="comment-list__empty">No notes yet — be the first to cheer them on.</p>`;
  } else {
    listHtml = `<ul class="comment-list">${comments
      .map((c) => {
        const author = profileNameById.get(c.author_id) || "Family member";
        const mine = c.author_id === currentUserId;
        const actions = mine
          ? `<span class="comment-item__actions">
              <button type="button" data-comment-edit="${escapeHtml(c.id)}">Edit</button>
              <button type="button" data-comment-delete="${escapeHtml(c.id)}">Delete</button>
            </span>`
          : "";
        return `<li class="comment-item" data-comment-id="${escapeHtml(c.id)}">
          <div class="comment-item__head">
            <span class="comment-item__author">${escapeHtml(author)}</span>
            ${actions}
          </div>
          <p class="comment-item__body">${escapeHtml(c.body)}</p>
        </li>`;
      })
      .join("")}</ul>`;
  }

  return `${listHtml}
    <form class="comment-form" data-comment-form>
      <div class="comment-form__row">
        <input type="text" name="body" maxlength="${COMMENT_MAX_LENGTH}" placeholder="Short encouragement…" enterkeyhint="send" autocomplete="off" aria-label="Encouragement comment">
        <button type="submit" class="comment-form__submit">Post</button>
      </div>
      <p class="comment-form__hint">Up to ${COMMENT_MAX_LENGTH} characters.</p>
    </form>`;
}

async function toggleReaction(kind, entryId, emoji) {
  const key = entryKey(kind, entryId);
  const busy = `${key}:${emoji}`;
  if (reactionBusyKey === busy) return;
  reactionBusyKey = busy;
  const uid = session.user.id;
  const rows = reactionsByEntry.get(key) || [];
  const existingId = findOwnReactionId(rows, emoji, uid);
  try {
    if (existingId) {
      const { error } = await supabase.from("entry_reactions").delete().eq("id", existingId);
      if (error) {
        showStatus(error.message, "error");
        return;
      }
      reactionsByEntry.set(
        key,
        rows.filter((r) => r.id !== existingId)
      );
    } else {
      if (!REACTION_EMOJIS.includes(emoji)) {
        showStatus("That reaction isn’t available.", "error");
        return;
      }
      const target = entryTargetColumns(kind, entryId);
      if (!target) return;
      const payload = { user_id: uid, emoji, ...target };
      const { data, error } = await supabase
        .from("entry_reactions")
        .insert(payload)
        .select("id, user_id, weigh_in_id, exercise_log_id, emoji, created_at")
        .single();
      if (error) {
        showStatus(error.message, "error");
        return;
      }
      reactionsByEntry.set(key, [...rows, data]);
    }
    refreshEntryEncourageUi(key);
  } finally {
    reactionBusyKey = null;
  }
}

async function submitComment(kind, entryId, rawBody, form) {
  const normalized = normalizeCommentBody(rawBody);
  if (!normalized.ok) {
    showStatus(normalized.message, "error");
    return;
  }
  const target = entryTargetColumns(kind, entryId);
  if (!target) return;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const { data, error } = await supabase
      .from("entry_comments")
      .insert({
        author_id: session.user.id,
        body: normalized.body,
        ...target,
      })
      .select("id, author_id, weigh_in_id, exercise_log_id, body, created_at, updated_at")
      .single();
    if (error) {
      showStatus(error.message, "error");
      return;
    }
    const key = entryKey(kind, entryId);
    const list = commentsByEntry.get(key) || [];
    commentsByEntry.set(key, [...list, data]);
    form.reset();
    refreshEntryEncourageUi(key);
    showStatus("Encouragement posted.", "success");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function editComment(commentId) {
  const key = [...commentsByEntry.keys()].find((k) =>
    (commentsByEntry.get(k) || []).some((c) => c.id === commentId)
  );
  if (!key) return;
  const comment = (commentsByEntry.get(key) || []).find((c) => c.id === commentId);
  if (!comment || comment.author_id !== session.user.id) return;
  const next = window.prompt("Edit your note", comment.body);
  if (next == null) return;
  const normalized = normalizeCommentBody(next);
  if (!normalized.ok) {
    showStatus(normalized.message, "error");
    return;
  }
  const { data, error } = await supabase
    .from("entry_comments")
    .update({ body: normalized.body, updated_at: new Date().toISOString() })
    .eq("id", commentId)
    .select("id, author_id, weigh_in_id, exercise_log_id, body, created_at, updated_at")
    .single();
  if (error) {
    showStatus(error.message, "error");
    return;
  }
  commentsByEntry.set(
    key,
    (commentsByEntry.get(key) || []).map((c) => (c.id === commentId ? data : c))
  );
  refreshEntryEncourageUi(key);
  showStatus("Note updated.", "success");
}

async function deleteComment(commentId) {
  const key = [...commentsByEntry.keys()].find((k) =>
    (commentsByEntry.get(k) || []).some((c) => c.id === commentId)
  );
  if (!key) return;
  const comment = (commentsByEntry.get(key) || []).find((c) => c.id === commentId);
  if (!comment || comment.author_id !== session.user.id) return;
  if (!window.confirm("Delete this note?")) return;
  const { error } = await supabase.from("entry_comments").delete().eq("id", commentId);
  if (error) {
    showStatus(error.message, "error");
    return;
  }
  commentsByEntry.set(
    key,
    (commentsByEntry.get(key) || []).filter((c) => c.id !== commentId)
  );
  refreshEntryEncourageUi(key);
  showStatus("Note deleted.", "success");
}

function refreshEntryEncourageUi(key) {
  const card = els.recentEntries?.querySelector(`[data-entry-key="${cssEscapeAttr(key)}"]`);
  if (!card) return;
  const block = card.querySelector(".entry-encourage");
  if (!block) return;
  const uid = session.user.id;
  block.innerHTML = `${renderReactionRow(key, uid)}${renderCommentBlock(key, uid)}`;
}

function cssEscapeAttr(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshAppData() {
  const avatarRevAtStart = avatarRevision;
  await Promise.all([loadProfile(), loadBoard(), loadRecentEntries()]);
  if (avatarRevAtStart === avatarRevision) {
    reconcileMyAvatarPathFromBoard();
  }
  if (myAvatarPath) {
    await resolveAvatarUrls([myAvatarPath], { retainPaths: true });
  }
  syncProfileAvatarUi();
}

async function onSession(next) {
  const wasSignedIn = Boolean(session);
  session = next;
  if (!session) {
    if (wasSignedIn) setAuthMode("signin");
    renderSignedOut();
    return;
  }
  renderSignedIn(session.user);
  try {
    await refreshAppData();
  } catch (err) {
    if (isMissingAvatarPathError(err)) {
      noteMissingAvatarPathColumn();
    } else {
      setBoardError(err.message || String(err));
    }
  }
}

function wireForms() {
  els.authModeSignin.addEventListener("click", () => setAuthMode("signin"));
  els.authModeSignup.addEventListener("click", () => setAuthMode("signup"));

  els.authForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setSubmitting(els.authForm, true);
    const fd = new FormData(els.authForm);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    try {
      if (authMode === "signup") {
        const confirm = String(fd.get("confirm_password") || "");
        if (password !== confirm) {
          setAuthError("Passwords do not match.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectTo() },
        });
        if (error) {
          setAuthError(error.message);
          return;
        }
        // Immediate session = email confirm off (or already confirmed). Else ask to check inbox.
        if (data.session) return;
        setAuthMode("signin");
        els.authForm.email.value = email;
        els.authForm.password.value = "";
        // Confirm-email ON + already-registered email: error=null, session=null, identities=[].
        if (!data.user?.identities?.length) {
          setAuthNotice(
            "This email may already have an account. Sign in here, or ask the captain to reset your password in Supabase."
          );
          return;
        }
        setAuthNotice(
          "Account created. Check your email to confirm, then sign in here. If no email arrives, ask the captain to turn off “Confirm email” in Supabase Auth."
        );
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } finally {
      setSubmitting(els.authForm, false);
    }
  });

  els.signOut.addEventListener("click", async () => {
    els.signOut.disabled = true;
    try {
      await supabase.auth.signOut();
    } finally {
      els.signOut.disabled = false;
    }
  });

  els.editNameBtn.addEventListener("click", () => {
    setProfileEditorOpen(els.profileEditor.hidden);
  });

  els.avatarFileInput.addEventListener("change", async () => {
    const file = els.avatarFileInput.files?.[0];
    els.avatarFileInput.value = "";
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    els.avatarFileInput.disabled = true;
    els.avatarRemoveBtn.disabled = true;
    try {
      await uploadAvatar(file);
    } catch (err) {
      setAvatarError(err.message || String(err));
    } finally {
      els.avatarFileInput.disabled = false;
      els.avatarRemoveBtn.disabled = false;
    }
  });

  els.avatarRemoveBtn.addEventListener("click", async () => {
    els.avatarFileInput.disabled = true;
    els.avatarRemoveBtn.disabled = true;
    try {
      await removeAvatar();
    } catch (err) {
      setAvatarError(err.message || String(err));
    } finally {
      els.avatarFileInput.disabled = false;
      els.avatarRemoveBtn.disabled = false;
    }
  });

  const openWeight = () => setLogMode(activeLog === "weight" ? null : "weight");
  const openExercise = () => setLogMode(activeLog === "exercise" ? null : "exercise");

  els.openWeightBtn.addEventListener("click", openWeight);
  els.openExerciseBtn.addEventListener("click", openExercise);
  els.dockWeightBtn.addEventListener("click", () => setLogMode("weight"));
  els.dockExerciseBtn.addEventListener("click", () => setLogMode("exercise"));

  document.querySelectorAll(".cancel-log-btn").forEach((btn) => {
    btn.addEventListener("click", () => collapseLogForms());
  });

  els.sortExerciseBtn.addEventListener("click", () => setBoardSort("exercise"));
  els.sortWeightBtn.addEventListener("click", () => setBoardSort("weight"));
  els.leaderboard.addEventListener("error", handleBoardAvatarError, true);

  els.app.addEventListener("click", (ev) => {
    const openLogBtn = ev.target.closest("[data-open-log]");
    if (openLogBtn && els.app.contains(openLogBtn)) {
      const mode = openLogBtn.getAttribute("data-open-log");
      if (mode === "weight" || mode === "exercise") setLogMode(mode);
      return;
    }

    const reactBtn = ev.target.closest("[data-react-emoji]");
    if (reactBtn && els.app.contains(reactBtn)) {
      const card = reactBtn.closest(".entry-row");
      const kind = card?.getAttribute("data-kind");
      const id = card?.getAttribute("data-id");
      const emoji = reactBtn.getAttribute("data-react-emoji");
      if ((kind === "weight" || kind === "exercise") && id && emoji) {
        toggleReaction(kind, id, emoji);
      }
      return;
    }

    const editBtn = ev.target.closest("[data-comment-edit]");
    if (editBtn && els.app.contains(editBtn)) {
      const commentId = editBtn.getAttribute("data-comment-edit");
      if (commentId) editComment(commentId);
      return;
    }

    const deleteBtn = ev.target.closest("[data-comment-delete]");
    if (deleteBtn && els.app.contains(deleteBtn)) {
      const commentId = deleteBtn.getAttribute("data-comment-delete");
      if (commentId) deleteComment(commentId);
    }
  });

  els.app.addEventListener("submit", (ev) => {
    const form = ev.target.closest("[data-comment-form]");
    if (!form || !els.app.contains(form)) return;
    ev.preventDefault();
    const card = form.closest(".entry-row");
    const kind = card?.getAttribute("data-kind");
    const id = card?.getAttribute("data-id");
    if ((kind !== "weight" && kind !== "exercise") || !id) return;
    const body = String(new FormData(form).get("body") || "");
    submitComment(kind, id, body, form);
  });

  els.profileForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setSubmitting(els.profileForm, true);
    try {
      const display_name = String(els.profileForm.display_name.value || "").trim();
      const { data, error } = await supabase
        .from("profiles")
        .update({ display_name })
        .eq("id", session.user.id)
        .select("id");
      const result = profileUpdateStatus(data, error);
      showStatus(result.message, result.ok ? "success" : "error");
      if (!result.ok) return;
      myDisplayName = display_name;
      syncProfileAvatarUi();
      setProfileEditorOpen(false);
      await refreshAppData();
    } finally {
      setSubmitting(els.profileForm, false);
    }
  });

  els.weightForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setSubmitting(els.weightForm, true);
    try {
      const fd = new FormData(els.weightForm);
      const payload = {
        user_id: session.user.id,
        weight_lbs: Number(fd.get("weight_lbs")),
        recorded_on: String(fd.get("recorded_on")),
        note: String(fd.get("note") || "").trim() || null,
      };
      const { data, error } = await supabase
        .from("weigh_ins")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        showStatus(error.message, "error");
        return;
      }
      els.weightForm.reset();
      seedDates();
      if (data?.id) highlightTarget = { kind: "weight", id: data.id };
      collapseLogForms();
      showStatus("Weigh-in logged.", "success");
      await refreshAppData();
    } finally {
      setSubmitting(els.weightForm, false);
    }
  });

  els.exerciseForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setSubmitting(els.exerciseForm, true);
    try {
      const fd = new FormData(els.exerciseForm);
      const payload = {
        user_id: session.user.id,
        activity: String(fd.get("activity") || "").trim(),
        duration_minutes: Number(fd.get("duration_minutes")),
        recorded_on: String(fd.get("recorded_on")),
        note: String(fd.get("note") || "").trim() || null,
      };
      const { data, error } = await supabase
        .from("exercise_logs")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        showStatus(error.message, "error");
        return;
      }
      els.exerciseForm.reset();
      seedDates();
      if (data?.id) highlightTarget = { kind: "exercise", id: data.id };
      collapseLogForms();
      showStatus("Exercise logged.", "success");
      await refreshAppData();
    } finally {
      setSubmitting(els.exerciseForm, false);
    }
  });
}

async function main() {
  if (!configured) {
    els.setup.hidden = false;
    els.auth.hidden = true;
    els.app.hidden = true;
    document.body.classList.remove("has-log-dock");
    return;
  }

  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  setAuthMode("signin");
  wireForms();
  syncSortControls();

  const { data } = await supabase.auth.getSession();
  await onSession(data.session);

  supabase.auth.onAuthStateChange((_event, next) => {
    onSession(next);
  });
}

main().catch((err) => {
  els.setup.hidden = false;
  els.setup.querySelector("p").textContent =
    "Could not start Family Fit: " + (err.message || String(err));
});
