import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  competitionSinceDay,
  localDateISO,
  profileUpdateStatus,
  weightSummaryFromSeries,
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
  profileForm: document.getElementById("profile-form"),
  weightForm: document.getElementById("weight-form"),
  exerciseForm: document.getElementById("exercise-form"),
  leaderboard: document.getElementById("leaderboard"),
  boardError: document.getElementById("board-error"),
  myEntries: document.getElementById("my-entries"),
  status: document.getElementById("form-status"),
};

let supabase = null;
let session = null;

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
  el.textContent = msg;
  el.hidden = false;
  showStatus._hide = setTimeout(() => {
    el.classList.add("is-leaving");
    showStatus._clear = setTimeout(() => {
      el.hidden = true;
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
    if (input && !input.value) input.value = today;
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

function renderSignedOut() {
  els.auth.hidden = false;
  els.app.hidden = true;
}

function renderSignedIn(user) {
  els.auth.hidden = true;
  els.app.hidden = false;
  els.whoami.textContent = user.email || "Signed in";
  seedDates();
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  const name = data?.display_name || "";
  els.profileForm.display_name.value = name;
  if (name) {
    els.whoami.textContent = `${name} · ${session.user.email}`;
  }
}

function deltaClass(delta) {
  if (delta == null || Number.isNaN(delta) || delta === 0) return "";
  return delta < 0 ? " stat-value--delta-down" : " stat-value--delta-up";
}

async function loadBoard() {
  setBoardError("");
  els.leaderboard.innerHTML = '<p class="muted">Loading…</p>';

  const sinceDay = competitionSinceDay();

  const [profilesRes, weighRes, exerciseRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name").order("display_name"),
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
    els.leaderboard.innerHTML =
      '<p class="muted">No family members yet. Invite users in Supabase Auth.</p>';
    return;
  }

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

  const members = profiles.map((p) => {
    const series = weighByUser.get(p.id) || [];
    const weight = weightSummaryFromSeries(series);
    const mins = minutesByUser.get(p.id) || 0;
    return {
      id: p.id,
      name: p.display_name || "Family member",
      weight,
      mins,
    };
  });

  // Motivating scan order: most exercise minutes first, then name.
  members.sort((a, b) => {
    if (b.mins !== a.mins) return b.mins - a.mins;
    return a.name.localeCompare(b.name);
  });

  const cards = members.map((m, i) => {
    const exerciseText =
      m.mins > 0
        ? `${m.mins} minutes in the last 30 days`
        : "No exercise logged in the last 30 days";
    const weightClass = deltaClass(m.weight.delta);

    return `<article class="member-card">
      <div class="member-rank" aria-hidden="true">${i + 1}</div>
      <div class="member-body">
        <div class="member-name">${escapeHtml(m.name)}</div>
        <div class="member-stats">
          <div class="stat-line">
            <span class="stat-label">Weight</span>
            <span class="stat-value${weightClass}">${escapeHtml(m.weight.text)}</span>
          </div>
          <div class="stat-line">
            <span class="stat-label">Exercise</span>
            <span class="stat-value">${escapeHtml(exerciseText)}</span>
          </div>
        </div>
      </div>
    </article>`;
  });

  els.leaderboard.innerHTML = cards.join("");
}

async function loadMyEntries() {
  els.myEntries.innerHTML = '<p class="muted">Loading…</p>';
  const uid = session.user.id;

  const [w, e] = await Promise.all([
    supabase
      .from("weigh_ins")
      .select("weight_lbs, recorded_on, note, created_at")
      .eq("user_id", uid)
      .order("recorded_on", { ascending: false })
      .limit(8),
    supabase
      .from("exercise_logs")
      .select("activity, duration_minutes, recorded_on, note, created_at")
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
    rows.push({
      sort: row.recorded_on + "T" + (row.created_at || ""),
      html: `<div class="entry-row"><span>Weight ${escapeHtml(String(row.weight_lbs))} lbs${row.note ? " — " + escapeHtml(row.note) : ""}</span><span class="entry-meta">${escapeHtml(row.recorded_on)}</span></div>`,
    });
  }
  for (const row of e.data || []) {
    rows.push({
      sort: row.recorded_on + "T" + (row.created_at || ""),
      html: `<div class="entry-row"><span>${escapeHtml(row.activity)} · ${escapeHtml(String(row.duration_minutes))} min${row.note ? " — " + escapeHtml(row.note) : ""}</span><span class="entry-meta">${escapeHtml(row.recorded_on)}</span></div>`,
    });
  }
  rows.sort((a, b) => (a.sort < b.sort ? 1 : -1));

  els.myEntries.innerHTML = rows.length
    ? rows
        .slice(0, 12)
        .map((r) => r.html)
        .join("")
    : '<p class="muted">No entries yet — log a weigh-in or workout above.</p>';
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
      const { error } = await supabase.from("weigh_ins").insert(payload);
      if (error) {
        showStatus(error.message, "error");
        return;
      }
      els.weightForm.reset();
      seedDates();
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
      const { error } = await supabase.from("exercise_logs").insert(payload);
      if (error) {
        showStatus(error.message, "error");
        return;
      }
      els.exerciseForm.reset();
      seedDates();
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
