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
  localDateISO,
  profileUpdateStatus,
  readBoardSortPreference,
  sortBoardMembers,
  weightSummaryFromSeries,
  writeBoardSortPreference,
} from "./board-math.js";

const cfg = window.FAMILY_FIT_CONFIG || {};
const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);

const els = {
  setup: document.getElementById("setup-banner"),
  auth: document.getElementById("auth-panel"),
  app: document.getElementById("app-panel"),
  authForm: document.getElementById("sign-in-form"),
  authError: document.getElementById("auth-error"),
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
  myEntries: document.getElementById("my-entries"),
  status: document.getElementById("form-status"),
};

let supabase = null;
let session = null;
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

function setBoardError(msg) {
  els.boardError.hidden = !msg;
  els.boardError.textContent = msg || "";
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
  const result = profileUpdateStatus(data, error);
  if (!result.ok) throw new Error(result.message);

  myAvatarPath = path;
  await resolveAvatarUrls([path]);
  syncProfileAvatarUi();
  await loadBoard();
  showStatus("Profile photo updated.", "success");
}

async function removeAvatar() {
  setAvatarError("");
  if (!myAvatarPath) return;

  const oldPath = myAvatarPath;
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", session.user.id)
    .select("id");
  const result = profileUpdateStatus(data, error);
  if (!result.ok) throw new Error(result.message);

  myAvatarPath = null;
  syncProfileAvatarUi();

  const { error: removeError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([oldPath]);
  if (removeError) {
    showStatus("Photo removed from profile; storage cleanup may have failed.", "error");
  } else {
    showStatus("Profile photo removed.", "success");
  }

  await loadBoard();
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
  avatarUrlByPath.clear();
  avatarPathsInUse.clear();
  clearAvatarUrlRefresh();
  setProfileEditorOpen(false);
  collapseLogForms();
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

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_path")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  const name = data?.display_name || "";
  myDisplayName = name;
  myAvatarPath = data?.avatar_path || null;
  els.profileForm.display_name.value = name;
  if (name) {
    els.whoami.textContent = `${name} · ${session.user.email}`;
  }
  await resolveAvatarUrls(myAvatarPath ? [myAvatarPath] : [], { retainPaths: true });
  syncProfileAvatarUi();
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
  return `<div class="${cls}">
    <p class="empty-state__title">${escapeHtml(title)}</p>
    <p class="empty-state__body">${escapeHtml(body)}</p>
    <button type="button" class="btn-primary empty-state__cta" data-open-log="${logMode}">${escapeHtml(ctaLabel)}</button>
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

async function loadBoard() {
  setBoardError("");
  els.leaderboard.innerHTML = '<p class="muted">Loading…</p>';
  boardMembers = null;

  const sinceDay = competitionSinceDay();

  const [profilesRes, weighRes, exerciseRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_path").order("display_name"),
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

  if (profilesRes.error || weighRes.error || exerciseRes.error) {
    const err = profilesRes.error || weighRes.error || exerciseRes.error;
    setBoardError(err.message);
    els.leaderboard.innerHTML = "";
    return;
  }

  const profiles = profilesRes.data || [];
  if (!profiles.length) {
    boardMembers = [];
    renderBoard();
    return;
  }

  await resolveAvatarUrls(profiles.map((p) => p.avatar_path));

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
    const avatarPath = p.avatar_path || null;
    return {
      id: p.id,
      name: p.display_name || "Family member",
      weight,
      mins,
      avatarPath,
      avatarUrl: avatarPath ? avatarUrlByPath.get(avatarPath) || null : null,
    };
  });

  syncSortControls();
  renderBoard();
}

async function loadMyEntries() {
  const mark = highlightTarget;
  highlightTarget = null;

  els.myEntries.innerHTML = '<p class="muted">Loading…</p>';
  const uid = session.user.id;

  const [w, e] = await Promise.all([
    supabase
      .from("weigh_ins")
      .select("id, weight_lbs, recorded_on, note, created_at")
      .eq("user_id", uid)
      .order("recorded_on", { ascending: false })
      .limit(8),
    supabase
      .from("exercise_logs")
      .select("id, activity, duration_minutes, recorded_on, note, created_at")
      .eq("user_id", uid)
      .order("recorded_on", { ascending: false })
      .limit(8),
  ]);

  if (w.error || e.error) {
    els.myEntries.innerHTML = `<p class="error">${escapeHtml((w.error || e.error).message)}</p>`;
    return;
  }

  const rows = [];
  for (const row of w.data || []) {
    const note = row.note ? " — " + escapeHtml(row.note) : "";
    rows.push({
      kind: "weight",
      id: row.id,
      sort: row.recorded_on + "T" + (row.created_at || ""),
      html: `<div class="entry-row" data-kind="weight" data-id="${escapeHtml(row.id)}">
        <span class="entry-badge entry-badge--weight">Weight</span>
        <div class="entry-main">
          <span class="entry-detail">${escapeHtml(String(row.weight_lbs))} lbs${note}</span>
          <span class="entry-meta">${escapeHtml(row.recorded_on)}</span>
        </div>
      </div>`,
    });
  }
  for (const row of e.data || []) {
    const note = row.note ? " — " + escapeHtml(row.note) : "";
    rows.push({
      kind: "exercise",
      id: row.id,
      sort: row.recorded_on + "T" + (row.created_at || ""),
      html: `<div class="entry-row" data-kind="exercise" data-id="${escapeHtml(row.id)}">
        <span class="entry-badge entry-badge--exercise">Exercise</span>
        <div class="entry-main">
          <span class="entry-detail">${escapeHtml(row.activity)} · ${escapeHtml(String(row.duration_minutes))} min${note}</span>
          <span class="entry-meta">${escapeHtml(row.recorded_on)}</span>
        </div>
      </div>`,
    });
  }
  rows.sort((a, b) => (a.sort < b.sort ? 1 : -1));

  if (!rows.length) {
    els.myEntries.innerHTML = emptyStateHtml({
      title: "No entries yet",
      body: "Your weigh-ins and workouts will show up here. Add one to get started.",
      ctaLabel: "Log a weigh-in",
      logMode: "weight",
    });
    return;
  }

  let marked = false;
  els.myEntries.innerHTML = rows
    .slice(0, 12)
    .map((r) => {
      if (mark && !marked && r.kind === mark.kind && r.id === mark.id) {
        marked = true;
        return r.html.replace('class="entry-row"', 'class="entry-row is-fresh"');
      }
      return r.html;
    })
    .join("");

  if (marked) {
    const fresh = els.myEntries.querySelector(".entry-row.is-fresh");
    fresh?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshAppData() {
  await Promise.all([loadProfile(), loadBoard(), loadMyEntries()]);
}

async function onSession(next) {
  session = next;
  if (!session) {
    renderSignedOut();
    return;
  }
  renderSignedIn(session.user);
  try {
    await refreshAppData();
  } catch (err) {
    setBoardError(err.message || String(err));
  }
}

function wireForms() {
  els.authForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setAuthError("");
    setSubmitting(els.authForm, true);
    const fd = new FormData(els.authForm);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    try {
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
    els.avatarRemoveBtn.disabled = true;
    try {
      await removeAvatar();
    } catch (err) {
      setAvatarError(err.message || String(err));
    } finally {
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
    const btn = ev.target.closest("[data-open-log]");
    if (!btn || !els.app.contains(btn)) return;
    const mode = btn.getAttribute("data-open-log");
    if (mode === "weight" || mode === "exercise") setLogMode(mode);
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
