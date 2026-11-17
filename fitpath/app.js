(function () {
  const STORAGE_KEY = "fitpath-logs-v1";
  const HERO_ROTATE_MS = 5500;
  const route = window.FITPATH_ROUTE || [];

  const els = {
    heroMedia: document.getElementById("hero-media"),
    heroCredit: document.getElementById("hero-credit"),
    heroThumbs: document.getElementById("hero-thumbs"),
    statusEyebrow: document.getElementById("status-eyebrow"),
    statusTitle: document.getElementById("status-title"),
    statusLede: document.getElementById("status-lede"),
    milesDone: document.getElementById("miles-done"),
    milesNext: document.getElementById("miles-next"),
    progressFill: document.getElementById("progress-fill"),
    progressLabel: document.getElementById("progress-label"),
    logForm: document.getElementById("log-form"),
    milesInput: document.getElementById("miles-input"),
    activitySelect: document.getElementById("activity-select"),
    noteInput: document.getElementById("note-input"),
    logFeedback: document.getElementById("log-feedback"),
    trail: document.getElementById("trail"),
    historyList: document.getElementById("history-list"),
    clearHistory: document.getElementById("clear-history"),
    totalStat: document.getElementById("total-stat"),
  };

  let heroTimer = null;
  let heroStopId = null;
  let heroIndex = 0;

  function loadLogs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveLogs(logs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  }

  function totalMiles(logs) {
    return logs.reduce((sum, entry) => sum + (Number(entry.miles) || 0), 0);
  }

  function formatMiles(n) {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function stopImages(stop) {
    if (!stop) return [];
    if (Array.isArray(stop.images) && stop.images.length) return stop.images;
    if (stop.image) return [{ src: stop.image, credit: stop.credit || "" }];
    return [];
  }

  function kindLabel(kind) {
    if (kind === "start") return "Start";
    if (kind === "park") return "Park";
    if (kind === "landmark") return "Landmark";
    if (kind === "city") return "City";
    return "Stop";
  }

  function getProgress(miles) {
    let current = route[0];
    let next = route[1] || null;
    let reached = [route[0]];

    for (let i = 1; i < route.length; i++) {
      if (miles >= route[i].milesFromStart) {
        current = route[i];
        reached.push(route[i]);
        next = route[i + 1] || null;
      } else {
        next = route[i];
        break;
      }
    }

    if (!next) {
      return {
        current,
        next: null,
        reached,
        milesIntoLeg: 0,
        legLength: 0,
        milesToNext: 0,
        legPct: 100,
        finished: true,
      };
    }

    const legStart = current.milesFromStart;
    const legLength = next.milesFromStart - legStart;
    const milesIntoLeg = Math.max(0, miles - legStart);
    const milesToNext = Math.max(0, next.milesFromStart - miles);
    const legPct = legLength > 0 ? Math.min(100, (milesIntoLeg / legLength) * 100) : 100;

    return {
      current,
      next,
      reached,
      milesIntoLeg,
      legLength,
      milesToNext,
      legPct,
      finished: false,
    };
  }

  function showHeroImage(stop, index) {
    const images = stopImages(stop);
    if (!images.length) return;
    const safeIndex = ((index % images.length) + images.length) % images.length;
    const shot = images[safeIndex];
    els.heroMedia.style.backgroundImage = `url("${shot.src}")`;
    els.heroCredit.textContent = shot.credit || "";
    if (els.heroThumbs) {
      els.heroThumbs.querySelectorAll("button").forEach((btn, i) => {
        btn.classList.toggle("is-active", i === safeIndex);
        btn.setAttribute("aria-pressed", i === safeIndex ? "true" : "false");
      });
    }
  }

  function renderHeroThumbs(stop) {
    if (!els.heroThumbs) return;
    const images = stopImages(stop);
    els.heroThumbs.innerHTML = "";
    if (images.length < 2) return;

    images.forEach((shot, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hero-thumb" + (i === heroIndex ? " is-active" : "");
      btn.style.backgroundImage = `url("${shot.src}")`;
      btn.setAttribute("aria-label", `Show photo ${i + 1} of ${images.length}`);
      btn.setAttribute("aria-pressed", i === heroIndex ? "true" : "false");
      btn.addEventListener("click", () => {
        heroIndex = i;
        showHeroImage(stop, heroIndex);
        restartHeroRotation(stop);
      });
      els.heroThumbs.appendChild(btn);
    });
  }

  function clearHeroRotation() {
    if (heroTimer) {
      clearInterval(heroTimer);
      heroTimer = null;
    }
  }

  function restartHeroRotation(stop) {
    clearHeroRotation();
    const images = stopImages(stop);
    if (images.length < 2) return;
    heroTimer = setInterval(() => {
      heroIndex = (heroIndex + 1) % images.length;
      showHeroImage(stop, heroIndex);
    }, HERO_ROTATE_MS);
  }

  function setHero(stop) {
    const images = stopImages(stop);
    if (!images.length) return;
    if (heroStopId !== stop.id) {
      heroStopId = stop.id;
      heroIndex = 0;
    }
    renderHeroThumbs(stop);
    showHeroImage(stop, heroIndex);
    restartHeroRotation(stop);
  }

  function renderStatus(progress, miles) {
    els.milesDone.textContent = formatMiles(miles);
    els.totalStat.textContent = formatMiles(miles);

    if (progress.finished) {
      els.statusEyebrow.textContent = "Journey complete";
      els.statusTitle.textContent = `You made it to ${progress.current.shortName}`;
      els.statusLede.textContent =
        "Yosemite is in the bag. Keep logging miles — or dream up the next FitPath.";
      els.milesNext.textContent = "0";
      els.progressFill.style.width = "100%";
      els.progressLabel.textContent = "Finish line reached";
      setHero(progress.current);
      return;
    }

    const next = progress.next;
    els.statusEyebrow.textContent = `En route from ${progress.current.shortName}`;
    els.statusTitle.textContent = `${formatMiles(progress.milesToNext)} miles to ${next.shortName}`;
    els.statusLede.textContent = next.blurb;
    els.milesNext.textContent = formatMiles(progress.milesToNext);
    els.progressFill.style.width = `${progress.legPct}%`;
    els.progressLabel.textContent = `${formatMiles(progress.milesIntoLeg)} of ${formatMiles(progress.legLength)} mi on this leg`;
    setHero(next);
  }

  function renderTrail(progress, miles) {
    els.trail.innerHTML = "";

    route.forEach((stop, index) => {
      const li = document.createElement("li");
      const done = miles >= stop.milesFromStart;
      const isNext = progress.next && progress.next.id === stop.id;
      const isCurrent = progress.current.id === stop.id && !progress.finished;
      const images = stopImages(stop);
      const primary = images[0];

      li.className = "trail-stop";
      if (done) li.classList.add("is-done");
      if (isNext) li.classList.add("is-next");
      if (isCurrent) li.classList.add("is-here");

      const legMiles =
        index === 0 ? 0 : stop.milesFromStart - route[index - 1].milesFromStart;

      const galleryHtml = images
        .map(
          (shot, i) =>
            `<button type="button" class="gallery-shot${i === 0 ? " is-active" : ""}" data-src="${shot.src}" data-credit="${escapeHtml(shot.credit || "")}" style="background-image:url('${shot.src}')" aria-label="Photo ${i + 1}"></button>`
        )
        .join("");

      li.innerHTML = `
        <div class="trail-marker" aria-hidden="true"></div>
        <article class="trail-card">
          <div class="trail-visual">
            <div class="trail-photo" style="background-image:url('${primary ? primary.src : ""}')"></div>
            ${images.length > 1 ? `<div class="trail-gallery">${galleryHtml}</div>` : ""}
          </div>
          <div class="trail-copy">
            <p class="trail-kind">${kindLabel(stop.kind)}</p>
            <h3>${stop.name}</h3>
            <p class="trail-meta">${stop.milesFromStart === 0 ? "Mile 0" : `Mile ${formatMiles(stop.milesFromStart)} · +${formatMiles(legMiles)} mi`}</p>
            <p class="trail-blurb">${stop.blurb}</p>
            <p class="trail-status">${
              done
                ? isCurrent && !progress.finished
                  ? "You are here"
                  : "Reached"
                : isNext
                  ? `${formatMiles(progress.milesToNext)} mi to go`
                  : "Ahead on the path"
            }</p>
            ${primary && primary.credit ? `<p class="trail-credit">${escapeHtml(primary.credit)}</p>` : ""}
          </div>
        </article>
      `;

      const photo = li.querySelector(".trail-photo");
      const credit = li.querySelector(".trail-credit");
      li.querySelectorAll(".gallery-shot").forEach((btn) => {
        btn.addEventListener("click", () => {
          photo.style.backgroundImage = `url("${btn.dataset.src}")`;
          if (credit) credit.textContent = btn.dataset.credit || "";
          li.querySelectorAll(".gallery-shot").forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
        });
      });

      els.trail.appendChild(li);
    });
  }

  function renderHistory(logs) {
    els.historyList.innerHTML = "";
    if (!logs.length) {
      els.historyList.innerHTML =
        '<li class="history-empty">No miles logged yet. Your first walk starts the journey.</li>';
      return;
    }

    const sorted = [...logs].sort((a, b) => b.at.localeCompare(a.at));
    sorted.forEach((entry) => {
      const li = document.createElement("li");
      const when = new Date(entry.at);
      const dateLabel = when.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      li.innerHTML = `
        <span class="history-miles">+${formatMiles(entry.miles)} mi</span>
        <span class="history-activity">${entry.activity}</span>
        <span class="history-date">${dateLabel}</span>
        ${entry.note ? `<span class="history-note">${escapeHtml(entry.note)}</span>` : ""}
      `;
      els.historyList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function refresh() {
    const logs = loadLogs();
    const miles = totalMiles(logs);
    const progress = getProgress(miles);
    renderStatus(progress, miles);
    renderTrail(progress, miles);
    renderHistory(logs);
  }

  els.logForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const miles = Number(els.milesInput.value);
    if (!Number.isFinite(miles) || miles <= 0) {
      els.logFeedback.textContent = "Enter a distance greater than zero.";
      return;
    }

    const logs = loadLogs();
    logs.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      miles,
      activity: els.activitySelect.value,
      note: (els.noteInput.value || "").trim(),
      at: new Date().toISOString(),
    });
    saveLogs(logs);

    els.logForm.reset();
    els.activitySelect.value = "walk";
    els.logFeedback.textContent = `Logged ${formatMiles(miles)} miles. Keep going.`;
    refresh();

    const nextStop = document.querySelector(".trail-stop.is-next, .trail-stop.is-here");
    if (nextStop) nextStop.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  els.clearHistory.addEventListener("click", () => {
    if (!loadLogs().length) return;
    const ok = window.confirm("Clear all logged miles? This only affects this browser.");
    if (!ok) return;
    saveLogs([]);
    els.logFeedback.textContent = "Log cleared.";
    refresh();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearHeroRotation();
    else if (heroStopId) {
      const stop = route.find((s) => s.id === heroStopId);
      if (stop) restartHeroRotation(stop);
    }
  });

  refresh();
})();
