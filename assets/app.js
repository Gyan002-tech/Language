/* Lexicon — vocabulary learning platform.
   Vanilla JS SPA (no build step, runs from file://). Sections:
     1. utils   2. datasets   3. state   4. deck/SRS   5. achievements
     6. router + shell   7. views   8. init
   The engine is book-agnostic: everything reads from the active dataset. */

(function () {
  "use strict";

  /* ---------------- 1. utils ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const oc = (origin) => "o-" + (origin === "greek" ? "greek" : origin === "french" ? "french" : "latin");
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  const DAY = 86400000;

  function linkifyExamples(text) {
    return text.replace(/\b[a-z]+(?:-[a-z]+)*\b/gi, (match) => {
      const lower = match.toLowerCase();
      const found = findWord(lower);
      if (found) {
        return `<button class="goto-word-link" data-goto="${esc(lower)}" title="Jump to word details">${esc(match)}</button>`;
      }
      return match;
    });
  }

  function toast(msg, icon) {
    let wrap = $(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = (icon ? `<span class="ic">${icon}</span>` : "") + esc(msg);
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* ---------------- 2. datasets ---------------- */
  const DATASETS = window.VocabDatasets || [];
  function datasetById(id) { return DATASETS.find((d) => d.id === id) || DATASETS[0]; }
  function allWords(ds) {
    const out = [];
    ds.roots.forEach((r) => r.words.forEach((w) => out.push(Object.assign({ rootId: r.id, origin: r.origin }, w))));
    return out;
  }
  function wordKey(w) { return w.word.toLowerCase(); }
  // "Chapter 3 · Session 1" (or compact "Ch 3 · S1"). Empty for custom/undated entries.
  function unitTag(w, compact) {
    if (!w || w.custom) return "";
    const s = w.unit; if (s == null) return "";
    const ch = DS.chapterOf ? DS.chapterOf[s] : null;
    if (compact) return (ch != null ? "Ch " + ch + " · " : "") + "S" + s;
    return (ch != null ? "Chapter " + ch + " · " : "") + (DS.unitLabel || "Session") + " " + s;
  }

  /* ---------------- 3. state ---------------- */
  const GKEY = "vocabApp:v1:global";
  let G = load(GKEY, { theme: "system", datasetId: (DATASETS[0] || {}).id, navSeen: false, sessionSize: "all" });

  function skey(id) { return "vocabApp:v1:" + id; }
  function load(k, fallback) { try { return Object.assign({}, fallback, JSON.parse(localStorage.getItem(k)) || {}); } catch (e) { return Object.assign({}, fallback); } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function saveG() { save(GKEY, G); }

  let DS = datasetById(G.datasetId);
  let S = loadState();

  // Cloud Storage (Firebase Firestore) Configuration
  let db = null;
  let cloudStatus = "local"; // "local" | "syncing" | "synced" | "error"

  let firebaseConfig = window.FIREBASE_CONFIG;
  if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
    try {
      const stored = localStorage.getItem("vocabApp:v1:firebaseConfig");
      if (stored) firebaseConfig = JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse stored Firebase config:", e);
    }
  }

  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    } catch (e) {
      console.error("Firebase initialization failed:", e);
    }
  }

  function loadState() {
    const st = load(skey(DS.id), { cards: {}, words: {}, log: [], days: {}, achievements: {}, settings: {}, custom: null, updatedAt: 0 });
    if (!st.cards) st.cards = {}; if (!st.words) st.words = {};
    if (!st.log) st.log = []; if (!st.days) st.days = {}; if (!st.achievements) st.achievements = {};
    if (!st.custom) st.custom = { roots: [], words: [] };
    return st;
  }

  function persist() {
    S.updatedAt = Date.now();
    save(skey(DS.id), S);
    pushLocalToCloud();
  }

  async function pushLocalToCloud() {
    if (!db) return;
    try {
      cloudStatus = "syncing";
      updateCloudIndicator();
      await db.collection("users").doc("Gyan").set({
        state: S,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      cloudStatus = "synced";
      updateCloudIndicator();
    } catch (e) {
      console.error("Cloud push failed:", e);
      cloudStatus = "error";
      updateCloudIndicator();
    }
  }

  async function syncCloud(forcePull = false) {
    if (!db) return;
    try {
      cloudStatus = "syncing";
      updateCloudIndicator();
      const docRef = db.collection("users").doc("Gyan");
      const doc = await docRef.get();
      let cloudState = null;
      let cloudTime = 0;

      if (doc.exists) {
        const data = doc.data();
        cloudState = data.state;
        cloudTime = data.updatedAt ? (data.updatedAt.toMillis ? data.updatedAt.toMillis() : data.updatedAt) : 0;
      }

      const localTime = S.updatedAt || 0;

      if (cloudState && (cloudTime > localTime || forcePull)) {
        S = Object.assign({}, S, cloudState);
        save(skey(DS.id), S);
        rebuildContent();
        cloudStatus = "synced";
        updateCloudIndicator();
        toast("Cloud progress synchronized", "☁️");
        route();
      } else {
        S.updatedAt = Date.now();
        await docRef.set({
          state: S,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        cloudStatus = "synced";
        updateCloudIndicator();
      }
    } catch (e) {
      console.error("Cloud sync failed:", e);
      cloudStatus = "error";
      updateCloudIndicator();
    }
  }

  function updateCloudIndicator() {
    const el = $("#cloudIndicator");
    if (!el) return;
    if (!db) {
      el.style.display = "none";
      return;
    }
    el.style.display = "inline-block";
    if (cloudStatus === "local") {
      el.innerHTML = "☁️";
      el.title = "Connected, click to manual sync";
    } else if (cloudStatus === "syncing") {
      el.innerHTML = "🔄";
      el.title = "Syncing with cloud...";
    } else if (cloudStatus === "synced") {
      el.innerHTML = "☁️ ✅";
      el.title = "Cloud Synced";
    } else if (cloudStatus === "error") {
      el.innerHTML = "☁️ ⚠️";
      el.title = "Cloud Sync Error. Click to retry.";
    }
  }

  /* Merged content = book dataset + user's custom layer. Everything that reads
     vocabulary reads from `content`, never from DS directly, so custom words
     appear everywhere (Roots, Quiz, Flashcards, Stats) automatically. */
  let content;
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root"; }
  function rebuildContent() {
    const custom = S.custom || { roots: [], words: [] };
    // Deep-ish copy so we never mutate the source dataset objects.
    const roots = DS.roots.map((r) => ({ id: r.id, label: r.label, origin: r.origin, meaning: r.meaning,
      words: r.words.map((w) => Object.assign({}, w, { related: (w.related || []).slice() })) }));
    const byId = {}; roots.forEach((r) => { byId[r.id] = r; });
    (custom.roots || []).forEach((cr) => {
      if (!byId[cr.id]) { const nr = { id: cr.id, label: cr.label, origin: cr.origin, meaning: cr.meaning, words: [], custom: true }; roots.push(nr); byId[cr.id] = nr; }
    });
    (custom.words || []).forEach((cw) => {
      const r = byId[cw.rootId];
      if (r) r.words.push(Object.assign({}, cw, { custom: true, related: (cw.related || []).slice() }));
    });
    // Make all "related" links two-way (fixes one-way book links + custom links).
    const idx = {}; roots.forEach((r) => r.words.forEach((w) => { idx[w.word.toLowerCase()] = w; }));
    roots.forEach((r) => r.words.forEach((w) => {
      (w.related || []).forEach((rk) => {
        const t = idx[rk.toLowerCase()];
        if (t) { t.related = t.related || []; if (!t.related.some((x) => x.toLowerCase() === w.word.toLowerCase())) t.related.push(w.word); }
      });
    }));
    content = { roots: roots, morphology: DS.morphology };
  }

  function wordState(key) {
    if (!S.words[key]) S.words[key] = { bookmarked: false };
    return S.words[key];
  }

  /* ---------------- 4. deck / SRS ---------------- */
  // Card ids: `${wordKey}::p` (production), `${wordKey}::r` (recognition)
  function cardId(key, kind) { return key + "::" + kind; }
  function getCard(id) { if (!S.cards[id]) S.cards[id] = srsNewCard(); return S.cards[id]; }

  function buildDeck(ds) {
    const cards = [];
    allWords(ds).forEach((w) => {
      const k = wordKey(w);
      cards.push({ id: cardId(k, "p"), kind: "production", w: w });
      cards.push({ id: cardId(k, "r"), kind: "recognition", w: w });
    });
    return cards;
  }

  function dueCards(ds, now) {
    now = now || Date.now();
    return buildDeck(ds).filter((c) => srsIsDue(getCard(c.id), now));
  }

  // A word's status derived from its production card (single source of truth).
  function wordStatus(key) {
    const c = S.cards[cardId(key, "p")];
    if (!c || c.reps === 0 && c.phase === "learning") return "new";
    if (srsIsMature(c)) return "mastered";
    return "learning";
  }

  function gradeCard(id, grade, correct) {
    S.cards[id] = srsGrade(getCard(id), grade);
    S.log.push({ t: Date.now(), grade: grade, correct: !!correct });
    if (S.log.length > 4000) S.log = S.log.slice(-4000);
    S.days[dayKey(Date.now())] = (S.days[dayKey(Date.now())] || 0) + 1;
    persist();
    checkAchievements();
  }

  function counts(ds) {
    let mastered = 0, learning = 0, seen = 0;
    allWords(ds).forEach((w) => {
      const s = wordStatus(wordKey(w));
      if (s === "mastered") mastered++; else if (s === "learning") learning++;
      if (s !== "new") seen++;
    });
    const total = allWords(ds).length;
    return { total, mastered, learning, new: total - seen, seen };
  }

  function streak() {
    let n = 0; let t = Date.now();
    if (!S.days[dayKey(t)]) t -= DAY; // allow "yesterday" to keep streak alive today
    while (S.days[dayKey(t)]) { n++; t -= DAY; }
    return n;
  }

  function accuracy() {
    if (!S.log.length) return null;
    const c = S.log.filter((x) => x.correct).length;
    return Math.round((c / S.log.length) * 100);
  }

  /* ---------------- 5. achievements ---------------- */
  const ACHS = [
    { id: "first", ic: "🌱", t: "First Step", d: "Complete your first review", test: () => S.log.length >= 1 },
    { id: "r25", ic: "📚", t: "Getting Started", d: "25 reviews", test: () => S.log.length >= 25 },
    { id: "r100", ic: "🔥", t: "Dedicated", d: "100 reviews", test: () => S.log.length >= 100 },
    { id: "r500", ic: "🏛️", t: "Scholar", d: "500 reviews", test: () => S.log.length >= 500 },
    { id: "m1", ic: "⭐", t: "First Mastery", d: "Master a word", test: (c) => c.mastered >= 1 },
    { id: "m25", ic: "🎓", t: "Word Master", d: "Master 25 words", test: (c) => c.mastered >= 25 },
    { id: "m100", ic: "👑", t: "Lexicon", d: "Master 100 words", test: (c) => c.mastered >= 100 },
    { id: "book", ic: "📖", t: "Bookworm", d: "Bookmark 10 words", test: () => Object.values(S.words).filter((w) => w.bookmarked).length >= 10 },
    { id: "s3", ic: "📅", t: "Consistent", d: "3-day streak", test: () => streak() >= 3 },
    { id: "s7", ic: "🗓️", t: "On a Roll", d: "7-day streak", test: () => streak() >= 7 },
    { id: "s30", ic: "🌟", t: "Unstoppable", d: "30-day streak", test: () => streak() >= 30 },
    { id: "perfect", ic: "🎯", t: "Sharpshooter", d: "20 correct in a row", test: () => {
        let run = 0; for (let i = S.log.length - 1; i >= 0; i--) { if (S.log[i].correct) run++; else break; } return run >= 20; } }
  ];
  function checkAchievements() {
    const c = counts(content); let earned = null;
    ACHS.forEach((a) => { if (!S.achievements[a.id] && a.test(c)) { S.achievements[a.id] = Date.now(); earned = a; } });
    if (earned) { persist(); toast("Achievement: " + earned.t, earned.ic); }
  }

  /* ---------------- 6. router + shell ---------------- */
  const ROUTES = [
    { id: "dashboard", label: "Dashboard", icon: "◆" },
    { id: "explore", label: "Roots", icon: "❦" },
    { id: "morphology", label: "Morphology", icon: "⚙" },
    { id: "quiz", label: "Quiz", icon: "✎" },
    { id: "flashcards", label: "Flashcards", icon: "▤" },
    { id: "add", label: "Add Content", icon: "＋" },
    { id: "stats", label: "Progress", icon: "▲" }
  ];

  function currentRoute() { return (location.hash.replace(/^#\/?/, "") || "dashboard").split("/")[0]; }

  function applyTheme() {
    const mode = G.theme;
    const sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = mode === "dark" || (mode === "system" && sysDark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const b = $("#themeBtn"); if (b) b.textContent = mode === "system" ? "◐" : mode === "dark" ? "☾" : "☀";
  }

  function renderShell() {
    const dsOpts = DATASETS.map((d) => `<option value="${esc(d.id)}" ${d.id === DS.id ? "selected" : ""}>${esc(d.title)}</option>`).join("");
    document.body.innerHTML = `
      <header class="appbar">
        <div class="appbar-inner">
          <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menu">☰</button>
          <div class="brand"><span class="brand-mark">L</span><span class="brand-text">Lexicon</span></div>
          <nav class="nav" id="nav">
            ${ROUTES.map((r) => `<a href="#/${r.id}" data-route="${r.id}">${r.label}</a>`).join("")}
          </nav>
          <div class="appbar-tools">
            ${DATASETS.length > 1 ? `<select class="dataset-switch" id="dsSwitch">${dsOpts}</select>` : ""}
            <span id="cloudIndicator" style="font-size:0.9rem;margin-right:0.6rem;cursor:pointer;display:none" title="Cloud Sync Status"></span>
            <button class="icon-btn" id="themeBtn" title="Theme">◐</button>
          </div>
        </div>
      </header>
      <main id="view"></main>`;

    $("#themeBtn").addEventListener("click", () => {
      G.theme = G.theme === "system" ? "light" : G.theme === "light" ? "dark" : "system";
      saveG(); applyTheme();
    });
    $("#navToggle").addEventListener("click", () => $("#nav").classList.toggle("open"));
    $("#nav").addEventListener("click", (e) => { if (e.target.tagName === "A") $("#nav").classList.remove("open"); });
    const sw = $("#dsSwitch");
    if (sw) sw.addEventListener("change", () => {
      G.datasetId = sw.value; saveG(); DS = datasetById(sw.value); S = loadState(); rebuildContent();
      toast("Switched to " + DS.title, "📚"); route();
      if (db) syncCloud();
    });
    const ci = $("#cloudIndicator");
    if (ci) {
      ci.addEventListener("click", () => {
        toast("Manual sync triggered...", "🔄");
        syncCloud(true);
      });
    }
    updateCloudIndicator();
    applyTheme();
  }

  function setActiveNav() {
    const r = currentRoute();
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
  }

  const VIEWS = {};
  function route() {
    setActiveNav();
    const r = currentRoute();
    const view = $("#view");
    view.innerHTML = "";
    (VIEWS[r] || VIEWS.dashboard)(view);
    window.scrollTo(0, 0);
  }

  /* ---------------- 7. views ---------------- */

  /* Progress ring SVG */
  function ring(pct, label) {
    const r = 42, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<div class="ring"><svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--rule)" stroke-width="8"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--good)" stroke-width="8"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg><span class="ring-num">${label}</span></div>`;
  }

  // ---- Dashboard ----
  VIEWS.dashboard = function (view) {
    const c = counts(content);
    const due = dueCards(content).length;
    const pct = c.total ? Math.round((c.mastered / c.total) * 100) : 0;
    const st = streak();
    const acc = accuracy();
    const earned = ACHS.filter((a) => S.achievements[a.id]);

    view.className = "view";
    view.innerHTML = `
      <div class="view-head">
        <h1>${greeting()}</h1>
        <p>${DS.title} · ${DS.author}</p>
      </div>
      <div class="grid cols-2" style="align-items:stretch">
        <div class="card">
          <div class="ring-wrap">
            ${ring(pct, pct + "%")}
            <div>
              <div style="font-family:var(--serif);font-size:1.3rem;font-weight:700">${c.mastered} / ${c.total} mastered</div>
              <div style="color:var(--ink-soft);font-size:.85rem;margin-top:.2rem">${c.learning} learning · ${c.new} not started</div>
              <div class="stacked" style="margin-top:.7rem">
                <i style="width:${bar(c.mastered, c.total)}%;background:var(--good)"></i>
                <i style="width:${bar(c.learning, c.total)}%;background:var(--warn)"></i>
              </div>
            </div>
          </div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;justify-content:center;text-align:center">
          <div style="font-size:2.4rem">${due ? "📝" : "✅"}</div>
          <div style="font-family:var(--serif);font-size:1.4rem;font-weight:700;margin:.3rem 0">
            ${due ? due + " card" + (due === 1 ? "" : "s") + " due" : "All caught up"}</div>
          <p style="color:var(--ink-soft);margin:.1rem 0 .9rem">${due ? "Time for today's review." : "Come back later or study ahead."}</p>
          <a class="btn ${due ? "" : "ghost"} block" href="#/quiz">${due ? "Start review" : "Study anyway"}</a>
        </div>
      </div>

      <div class="grid cols-4" style="margin-top:1rem">
        ${statTile(st, "day streak", st ? "🔥 keep it up" : "start today")}
        ${statTile(S.log.length, "total reviews", "")}
        ${statTile(acc == null ? "—" : acc + "%", "accuracy", "")}
        ${statTile(Object.values(S.words).filter((w) => w.bookmarked).length, "bookmarked", "")}
      </div>

      <div class="card" style="margin-top:1rem">
        <div class="card-lead"><h3>Achievements</h3><a href="#/stats" style="font-size:.82rem">View all →</a></div>
        <div class="ach-grid">
          ${(earned.length ? earned : ACHS).slice(0, 6).map(achCard).join("")}
        </div>
      </div>`;
  };
  function greeting() { const h = new Date().getHours(); return (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + "."; }
  function bar(n, d) { return d ? (n / d) * 100 : 0; }
  function statTile(n, l, sub) { return `<div class="card stat"><div class="n">${n}</div><div class="l">${l}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`; }
  function achCard(a) { return `<div class="ach ${S.achievements[a.id] ? "earned o-latin" : ""}"><div class="ic">${a.ic}</div><div class="t">${esc(a.t)}</div><div class="d">${esc(a.d)}</div></div>`; }

  // ---- Explore (roots) ----
  let exState = { q: "", origin: "all", status: "all", bookmarked: false, sel: {} };
  VIEWS.explore = function (view) {
    view.className = "view";
    const origins = Array.from(new Set(content.roots.map((r) => r.origin)));
    view.innerHTML = `
      <div class="view-head"><h1>Roots</h1><p>Search a root or word, open a family, tap any word for its detail.</p></div>
      <div class="toolbar">
        <input class="search" id="exSearch" placeholder="Search — e.g. ego, altercation, hate…" value="${esc(exState.q)}">
        <div class="filters">
          <button class="pill ${exState.origin === "all" ? "active" : ""}" data-f="origin" data-v="all">All origins</button>
          ${origins.map((o) => `<button class="pill ${exState.origin === o ? "active" : ""}" data-f="origin" data-v="${esc(o)}">${cap(o)}</button>`).join("")}
          <span style="width:1px;height:20px;background:var(--rule)"></span>
          <button class="pill ${exState.status === "all" ? "active" : ""}" data-f="status" data-v="all">Any status</button>
          <button class="pill ${exState.status === "new" ? "active" : ""}" data-f="status" data-v="new">New</button>
          <button class="pill ${exState.status === "learning" ? "active" : ""}" data-f="status" data-v="learning">Learning</button>
          <button class="pill ${exState.status === "mastered" ? "active" : ""}" data-f="status" data-v="mastered">Mastered</button>
          <button class="pill ${exState.bookmarked ? "active" : ""}" data-f="bookmarked" data-v="toggle">★ Bookmarked</button>
          <span class="filter-count" id="exCount"></span>
        </div>
      </div>
      <div class="root-list" id="rootList"></div>`;

    const search = $("#exSearch");
    search.addEventListener("input", () => { exState.q = search.value; drawRoots(); });
    search.addEventListener("keydown", (e) => { if (e.key === "Escape") { exState.q = ""; search.value = ""; drawRoots(); } });
    view.querySelectorAll(".pill").forEach((p) => p.addEventListener("click", () => {
      const f = p.dataset.f;
      if (f === "bookmarked") exState.bookmarked = !exState.bookmarked;
      else exState[f] = p.dataset.v;
      VIEWS.explore(view);
    }));
    drawRoots();
  };

  function wordMatchesFilters(w) {
    const key = wordKey(w);
    if (exState.status !== "all" && wordStatus(key) !== exState.status) return false;
    if (exState.bookmarked && !wordState(key).bookmarked) return false;
    return true;
  }

  function drawRoots() {
    const list = $("#rootList"); if (!list) return;
    const q = exState.q.trim().toLowerCase();
    let shownRoots = 0, shownWords = 0;
    list.innerHTML = content.roots.map((root) => {
      if (exState.origin !== "all" && root.origin !== exState.origin) return "";
      const words = root.words.filter(wordMatchesFilters);
      const searchWords = words.filter((w) => !q || (w.word + " " + w.meaning + " " + root.label + " " + root.meaning).toLowerCase().includes(q));
      
      const isEmptyRoot = root.words.length === 0;
      let shouldShowEmpty = false;
      if (isEmptyRoot) {
        const matchesSearch = !q || (root.label + " " + root.meaning).toLowerCase().includes(q);
        const matchesStatus = exState.status === "all" || exState.status === "new";
        const matchesBookmarked = !exState.bookmarked;
        shouldShowEmpty = matchesSearch && matchesStatus && matchesBookmarked;
      }

      if (searchWords.length === 0 && !shouldShowEmpty) return "";
      shownRoots++; shownWords += searchWords.length;
      const mastered = root.words.length ? root.words.filter((w) => wordStatus(wordKey(w)) === "mastered").length : 0;
      const open = !!q || exState.status !== "all" || exState.bookmarked;
      
      let chips = "";
      if (isEmptyRoot) {
        chips = `<div class="empty-note" style="padding:.5rem 0;text-align:left;font-size:0.85rem">No words in this root yet.</div>`;
      } else {
        chips = searchWords.map((w) => {
          const key = wordKey(w);
          const star = wordState(key).bookmarked ? " ★" : "";
          const matchCls = q && (w.word.toLowerCase().includes(q)) ? " match" : "";
          const mine = w.custom ? " chip-mine" : "";
          return `<button class="chip${matchCls}${mine}" data-word="${esc(key)}" data-root="${esc(root.id)}" ${w.custom ? 'title="Added by you"' : ""}>
            <span class="status-dot st-${wordStatus(key)}"></span>${esc(w.word)}${star}${w.custom ? ' <span class="mine-mark">✎</span>' : ""}</button>`;
        }).join("");
      }
      
      return `<div class="root-card ${oc(root.origin)} ${open ? "open" : ""}" data-root="${esc(root.id)}">
        <button class="root-head">
          <span class="root-title"><span class="root-label">${esc(root.label)}</span>
            <span class="root-gloss">“${esc(root.meaning)}”</span></span>
          <span class="root-meta">
            <span class="root-progress" title="${mastered}/${root.words.length} mastered"><i style="width:${root.words.length ? bar(mastered, root.words.length) : 0}%"></i></span>
            <span class="badge">${cap(root.origin)}</span>
            <span class="count-badge">${root.words.length}</span>
            <span class="chevron">▸</span>
          </span>
        </button>
        <div class="root-body"><div class="chips">${chips}</div>
          <div class="detail empty" data-detail="${esc(root.id)}">
            ${isEmptyRoot ? `No words added to this root yet.
            <div style="margin-top:.6rem">
              <button class="mini-btn on-good" data-add-to-root="${esc(root.id)}">＋ Add a word to this root</button>
            </div>` : 'Tap a word above to see its meaning, an example, and related words.'}
          </div>
        </div>
      </div>`;
    }).join("") || `<div class="empty-note">No words match these filters.</div>`;

    const cnt = $("#exCount"); if (cnt) cnt.textContent = `${shownRoots} roots · ${shownWords} words`;

    list.querySelectorAll(".root-head").forEach((h) => h.addEventListener("click", () => h.closest(".root-card").classList.toggle("open")));
    list.querySelectorAll(".chip").forEach((ch) => ch.addEventListener("click", () => selectWord(ch.dataset.root, ch.dataset.word)));
    list.addEventListener("click", (e) => {
      const link = e.target.closest("[data-goto]"); if (link) { e.stopPropagation(); openWord(link.dataset.goto); return; }
      const act = e.target.closest("[data-act]"); if (act) { e.stopPropagation(); wordAction(act.dataset.act, act.dataset.word); return; }
      const addToRoot = e.target.closest("[data-add-to-root]");
      if (addToRoot) {
        e.stopPropagation();
        preselectedRootId = addToRoot.dataset.addToRoot;
        addViewMode = "word";
        addDraft = null;
        rootDraft = null;
        location.hash = "#/add";
      }
    });
  }

  function findWord(key) {
    for (const r of content.roots) for (const w of r.words) if (wordKey(w) === key) return { root: r, w: w };
    return null;
  }

  function selectWord(rootId, key) {
    const card = document.querySelector(`.root-card[data-root="${rootId}"]`);
    if (!card) return;
    card.querySelectorAll(".chip").forEach((c) => c.classList.toggle("selected", c.dataset.word === key));
    const box = card.querySelector(`[data-detail="${rootId}"]`);
    const found = findWord(key); if (!box || !found) return;
    box.classList.remove("empty");
    box.innerHTML = detailHTML(found.w);
  }

  function detailHTML(w) {
    const key = wordKey(w);
    const ws = wordState(key);
    const status = wordStatus(key);
    const contrast = w.contrast ? `<div class="contrast">💡 <strong>${esc(w.word)}</strong> — ${esc(w.contrast)}</div>` : "";
    const example = w.example ? `<p class="detail-ex">“${esc(w.example)}”</p>` : "";
    const related = (w.related && w.related.length)
      ? `<div class="seealso">↔ see also ${w.related.map((r) => `<button data-goto="${esc(r.toLowerCase())}">${esc(r)}</button>`).join(" · ")}</div>` : "";
    const img = w.image ? `<div style="margin-top:.6rem"><img src="${esc(w.image.url)}" alt="${esc(w.image.alt || w.word)}" style="max-width:180px;border-radius:8px;border:1px solid var(--rule)"><div style="font-size:.68rem;color:var(--ink-faint)">${esc(w.image.credit || "")}</div></div>` : "";
    const mineBadge = w.custom ? '<span class="badge o-greek" style="--oc:var(--greek);--oc-soft:var(--greek-soft)">✎ added by me</span>' : "";
    return `<div class="detail-top">
        <span class="detail-word">${esc(w.word)}</span>
        <span class="detail-pos">${esc(w.pos || "")}</span>
        <span class="status-dot st-${status}" title="${status}"></span>
        ${mineBadge}
        <span class="detail-actions">
          <button class="mini-btn ${ws.bookmarked ? "on" : ""}" data-act="bookmark" data-word="${esc(key)}">${ws.bookmarked ? "★ Saved" : "☆ Save"}</button>
        </span>
      </div>
      <p class="detail-mean">${esc(w.meaning || "")}</p>
      ${example}${contrast}${related}${img}
      ${w.custom ? "" : `<div style="font-size:.72rem;color:var(--ink-faint);margin-top:.6rem">${esc(unitTag(w))}</div>`}`;
  }

  function wordAction(act, key) {
    if (act === "bookmark") {
      const ws = wordState(key); ws.bookmarked = !ws.bookmarked; persist(); checkAchievements();
      // re-render the open detail + chip star
      const found = findWord(key); if (found) { selectWord(found.root.id, key); drawStar(found.root.id, key, ws.bookmarked); }
      toast(ws.bookmarked ? "Bookmarked" : "Removed bookmark", ws.bookmarked ? "★" : "☆");
    }
  }
  function drawStar(rootId, key, on) {
    const chip = document.querySelector(`.chip[data-word="${key}"][data-root="${rootId}"]`);
    const fw = findWord(key); if (!chip || !fw) return;
    chip.innerHTML = `<span class="status-dot st-${wordStatus(key)}"></span>${esc(fw.w.word)}${on ? " ★" : ""}${fw.w.custom ? ' <span class="mine-mark">✎</span>' : ""}`;
  }

  // Global navigation to any word (used by cross-links)
  window.openWord = function (key) {
    location.hash = "#/explore";
    setTimeout(() => {
      const found = findWord(key); if (!found) return;
      exState.q = ""; exState.origin = "all"; exState.status = "all"; exState.bookmarked = false;
      const searchEl = $("#exSearch"); if (searchEl) searchEl.value = "";
      drawRoots();
      const card = document.querySelector(`.root-card[data-root="${found.root.id}"]`);
      if (card) {
        card.classList.add("open"); selectWord(found.root.id, key);
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
      }
    }, 30);
  };

  // ---- Morphology ----
  // ---- Morphology Restructured Data ----
  const NOUN_TO_ADJ_PAIRS = [
    { base: "Altruism", basePos: "n", target: "Altruistic", targetPos: "adj", root: "altru", baseSuff: "ism", targetSuff: "istic", desc: "Altruistic describes actions showing a disinterested and selfless concern for the well-being of others (Altruism)." },
    { base: "Philanthropy", basePos: "n", target: "Philanthropic", targetPos: "adj", root: "philanthrop", baseSuff: "y", targetSuff: "ic", desc: "Philanthropic describes charitable acts or organizations. The suffix -y (abstract noun) drops, and -ic (adjective suffix) is appended." },
    { base: "Misanthropy", basePos: "n", target: "Misanthropic", targetPos: "adj", root: "misanthrop", baseSuff: "y", targetSuff: "ic", desc: "Misanthropic describes a hatred or distrust of humankind. Drop the noun suffix -y, and append -ic." },
    { base: "Anthropology", basePos: "n", target: "Anthropological", targetPos: "adj", root: "anthropolog", baseSuff: "y", targetSuff: "ical", desc: "Anthropological describes the study of human development and cultures. Drop -y and add -ical." },
    { base: "Gynecology", basePos: "n", target: "Gynecological", targetPos: "adj", root: "gynecolog", baseSuff: "y", targetSuff: "ical", desc: "Gynecological relates to the medical specialty of women's health. Drop -y and add -ical." },
    { base: "Monogamy", basePos: "n", target: "Monogamous", targetPos: "adj", root: "monogam", baseSuff: "y", targetSuff: "ous", desc: "Monogamous describes marriage/relations with one spouse at a time. Drop -y and add -ous." },
    { base: "Polygamy", basePos: "n", target: "Polygamous", targetPos: "adj", root: "polygam", baseSuff: "y", targetSuff: "ous", desc: "Polygamous describes marriage/relations with multiple spouses. Drop -y and add -ous." },
    { base: "Misogyny", basePos: "n", target: "Misogynous", targetPos: "adj", root: "misogyn", baseSuff: "y", targetSuff: "ous", desc: "Misogynous (or misogynistic) describes hatred or prejudice against women. Drop -y and add -ous." }
  ];

  const ADJ_TO_NOUN_PAIRS = [
    { base: "Dexterous", basePos: "adj", target: "Dexterity", targetPos: "n", root: "dexter", baseSuff: "ous", targetSuff: "ity", desc: "Add -ity to adjectives ending in -ous to form the abstract noun representing the quality (note: the 'o' in -ous drops out, yielding -ity)." },
    { base: "Ambidextrous", basePos: "adj", target: "Ambidexterity", targetPos: "n", root: "ambidexter", baseSuff: "ous", targetSuff: "ity", desc: "Add -ity to adjectives ending in -ous to form the abstract noun representing the quality (note: the 'o' in -ous drops out, yielding -ity)." },
    { base: "Adroit", basePos: "adj", target: "Adroitness", targetPos: "n", root: "adroit", baseSuff: "", targetSuff: "ness", desc: "Append suffix -ness to form the abstract noun representing mental or physical skill." },
    { base: "Gauche", basePos: "adj", target: "Gaucherie", targetPos: "n", root: "gauch", baseSuff: "e", targetSuff: "erie", desc: "Append the French-derived suffix -erie to the base root." }
  ];

  let morphMode = "pos"; // "pos" | "pathways"
  let activeNounToAdjIndex = 0;
  let activeAdjToNounIndex = 0;

  function renderWorkbench(pair) {
    const baseLink = linkifyExamples(pair.base);
    const targetLink = linkifyExamples(pair.target);
    return `
      <div class="workbench">
        <div class="workbench-header">Interactive Suffix Morphing Workbench</div>
        <div class="workbench-display">
          <span class="workbench-part">
            <span class="root-part">${esc(pair.root)}</span><span class="suffix-part base-suff">${esc(pair.baseSuff || "∅")}</span>
            <span class="pos-badge">${esc(pair.basePos)}</span>
          </span>
          <span class="workbench-arrow">──▶</span>
          <span class="workbench-part">
            <span class="root-part">${esc(pair.root)}</span><span class="suffix-part target-suff">${esc(pair.targetSuff)}</span>
            <span class="pos-badge">${esc(pair.targetPos)}</span>
          </span>
        </div>
        <div class="workbench-desc">
          <strong>Rule:</strong> ${esc(pair.desc)}
          <div class="workbench-links" style="margin-top:.6rem">
            Explore: <strong>${baseLink}</strong> (base) or <strong>${targetLink}</strong> (derived)
          </div>
        </div>
      </div>
    `;
  }

  function renderNounToAdjTable() {
    const rows = NOUN_TO_ADJ_PAIRS.map((p, idx) => {
      const activeCls = idx === activeNounToAdjIndex ? 'class="active-row"' : '';
      return `
        <tr ${activeCls} data-noun-adj-idx="${idx}">
          <td style="font-weight:600;font-family:var(--serif);font-size:1.05rem;color:var(--accent)">${esc(p.base)} <span style="font-size:.75rem;font-weight:normal;color:var(--ink-soft);font-family:var(--sans)">(${p.basePos})</span></td>
          <td style="font-size:1.1rem;color:var(--ink-soft)">──▶</td>
          <td style="font-weight:600;font-family:var(--serif);font-size:1.05rem;color:var(--good)">${esc(p.target)} <span style="font-size:.75rem;font-weight:normal;color:var(--ink-soft);font-family:var(--sans)">(${p.targetPos})</span></td>
          <td style="font-family:monospace;color:var(--ink-soft)">-${esc(p.baseSuff || "∅")} ──▶ -${esc(p.targetSuff)}</td>
        </tr>
      `;
    }).join("");
    return `
      <table class="pathway-table">
        <thead>
          <tr>
            <th>Base Noun</th>
            <th></th>
            <th>Derived Adjective</th>
            <th>Suffix Shift</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  function renderAdjToNounTable() {
    const rows = ADJ_TO_NOUN_PAIRS.map((p, idx) => {
      const activeCls = idx === activeAdjToNounIndex ? 'class="active-row"' : '';
      return `
        <tr ${activeCls} data-adj-noun-idx="${idx}">
          <td style="font-weight:600;font-family:var(--serif);font-size:1.05rem;color:var(--greek)">${esc(p.base)} <span style="font-size:.75rem;font-weight:normal;color:var(--ink-soft);font-family:var(--sans)">(${p.basePos})</span></td>
          <td style="font-size:1.1rem;color:var(--ink-soft)">──▶</td>
          <td style="font-weight:600;font-family:var(--serif);font-size:1.05rem;color:var(--accent)">${esc(p.target)} <span style="font-size:.75rem;font-weight:normal;color:var(--ink-soft);font-family:var(--sans)">(${p.targetPos})</span></td>
          <td style="font-family:monospace;color:var(--ink-soft)">-${esc(p.baseSuff || "∅")} ──▶ -${esc(p.targetSuff)}</td>
        </tr>
      `;
    }).join("");
    return `
      <table class="pathway-table">
        <thead>
          <tr>
            <th>Base Adjective</th>
            <th></th>
            <th>Derived Noun</th>
            <th>Suffix Shift</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  VIEWS.morphology = function (view) {
    view.className = "view";
    
    let html = `
      <div class="view-head">
        <h1>Morphology & Word Building</h1>
        <p>The generative grammar of English — prefixes, suffixes, and part-of-speech conversion guidelines.</p>
      </div>
      
      <div class="pill-row" style="margin-bottom: 1.4rem">
        <button class="pill ${morphMode === 'pos' ? 'active' : ''}" id="morphPosBtn">Browse by POS</button>
        <button class="pill ${morphMode === 'pathways' ? 'active' : ''}" id="morphPathBtn">Conversion Pathways</button>
      </div>
    `;
    
    if (morphMode === "pos") {
      // Browse by POS layout
      html += `
        <div class="grid cols-2" style="align-items:start">
          <div class="card">
            <h3 style="color:var(--accent);margin-bottom:.8rem;font-family:var(--serif)">Noun-Forming Elements</h3>
            <p style="color:var(--ink-soft);font-size:.85rem;margin-bottom:1rem">Suffixes and prefixes that construct nouns (representing people, roles, practices, or qualities).</p>
            
            <div class="detail" style="margin-bottom:.8rem">
              <div style="font-weight:700;font-size:.9rem;color:var(--ink)">-ist (Agent Suffix)</div>
              <div style="font-size:.85rem;color:var(--ink-soft)">Denotes a person who practices, believes, or specializes in something.</div>
              <div style="font-size:.82rem;margin-top:.3rem;color:var(--ink-faint)">
                Examples: ${linkifyExamples("altruist, misanthrope, egocentric, egoist, egotist, bigamist, monogamist, polygamist, anthropologist, gynecologist")}
              </div>
            </div>

            <div class="detail" style="margin-bottom:.8rem">
              <div style="font-weight:700;font-size:.9rem;color:var(--ink)">-y / -ism (Abstract Suffixes)</div>
              <div style="font-size:.85rem;color:var(--ink-soft)">Denotes a practice, state, condition, or philosophy.</div>
              <div style="font-size:.82rem;margin-top:.3rem;color:var(--ink-faint)">
                Examples: ${linkifyExamples("altruism, philanthropy, monogamy, bigamy, polygamy, polyandry, asceticism, misogyny, gaucherie")}
              </div>
            </div>

            <div class="detail">
              <div style="font-weight:700;font-size:.9rem;color:var(--ink)">-ity / -ness (Quality/State Suffixes)</div>
              <div style="font-size:.85rem;color:var(--ink-soft)">Denotes a quality, condition, or level of skill.</div>
              <div style="font-size:.82rem;margin-top:.3rem;color:var(--ink-faint)">
                Examples: ${linkifyExamples("dexterity, adroitness, egocentricity, ambidexterity, alternative, alteration")}
              </div>
            </div>
          </div>

          <div class="card">
            <h3 style="color:var(--greek);margin-bottom:.8rem;font-family:var(--serif)">Adjective-Forming Elements</h3>
            <p style="color:var(--ink-soft);font-size:.85rem;margin-bottom:1rem">Suffixes and prefixes that construct descriptive adjectives (expressing characteristics, tendencies, or directions).</p>

            <div class="detail" style="margin-bottom:.8rem">
              <div style="font-weight:700;font-size:.9rem;color:var(--ink)">-ic / -ical (Descriptive Suffixes)</div>
              <div style="font-size:.85rem;color:var(--ink-soft)">Means "pertaining to" or "having the nature of".</div>
              <div style="font-size:.82rem;margin-top:.3rem;color:var(--ink-faint)">
                Examples: ${linkifyExamples("altruistic, misanthropic, philanthropic, egomaniacal, anthropological, gynecological")}
              </div>
            </div>

            <div class="detail" style="margin-bottom:.8rem">
              <div style="font-weight:700;font-size:.9rem;color:var(--ink)">-ous / -ious (Descriptive Suffixes)</div>
              <div style="font-size:.85rem;color:var(--ink-soft)">Means "full of" or "possessing the qualities of".</div>
              <div style="font-size:.82rem;margin-top:.3rem;color:var(--ink-faint)">
                Examples: ${linkifyExamples("monogamous, bigamous, polygamous, polyandrous, dexterous, sinister, misogynous")}
              </div>
            </div>

            <div class="detail">
              <div style="font-weight:700;font-size:.9rem;color:var(--ink)">intro- / extro- / ambi- (Direction Prefixes)</div>
              <div style="font-size:.85rem;color:var(--ink-soft)">Indicates where thoughts or physical skills are turned.</div>
              <div style="font-size:.82rem;margin-top:.3rem;color:var(--ink-faint)">
                Examples: ${linkifyExamples("introvert, extrovert, ambivert, ambidextrous, adroit, gauche")}
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (morphMode === "pathways") {
      // Conversion Pathways
      const nounToAdjPair = NOUN_TO_ADJ_PAIRS[activeNounToAdjIndex];
      const adjToNounPair = ADJ_TO_NOUN_PAIRS[activeAdjToNounIndex];
      
      html += `
        <div class="grid cols-2" style="align-items:start">
          <div class="card">
            <h3 style="margin-bottom:.8rem;font-family:var(--serif)">Noun ──▶ Adjective</h3>
            <p style="color:var(--ink-soft);font-size:.85rem;margin-bottom:1rem">Understand how abstract concepts (nouns) transition into descriptive traits (adjectives).</p>
            ${renderWorkbench(nounToAdjPair)}
            <div style="margin-top:1rem">
              <div style="font-weight:700;font-size:.78rem;text-transform:uppercase;color:var(--ink-soft);margin-bottom:.4rem">Select an example to load:</div>
              ${renderNounToAdjTable()}
            </div>
          </div>

          <div class="card">
            <h3 style="margin-bottom:.8rem;font-family:var(--serif)">Adjective ──▶ Noun</h3>
            <p style="color:var(--ink-soft);font-size:.85rem;margin-bottom:1rem">Understand how qualities and descriptions (adjectives) are turned into abstract quality nouns.</p>
            ${renderWorkbench(adjToNounPair)}
            <div style="margin-top:1rem">
              <div style="font-weight:700;font-size:.78rem;text-transform:uppercase;color:var(--ink-soft);margin-bottom:.4rem">Select an example to load:</div>
              ${renderAdjToNounTable()}
            </div>
          </div>
        </div>
      `;
    }
    
    view.innerHTML = html;
    
    // Wire up events
    $("#morphPosBtn").addEventListener("click", () => { morphMode = "pos"; route(); });
    $("#morphPathBtn").addEventListener("click", () => { morphMode = "pathways"; route(); });
    
    // Handle goto link click delegation
    view.addEventListener("click", (e) => {
      const link = e.target.closest("[data-goto]");
      if (link) {
        e.stopPropagation();
        window.openWord(link.dataset.goto);
      }
    });
    
    // Wire up row selections for workbenches
    if (morphMode === "pathways") {
      view.querySelectorAll("tr[data-noun-adj-idx]").forEach((tr) => {
        tr.addEventListener("click", () => {
          activeNounToAdjIndex = parseInt(tr.dataset.nounAdjIdx, 10);
          route();
        });
      });
      view.querySelectorAll("tr[data-adj-noun-idx]").forEach((tr) => {
        tr.addEventListener("click", () => {
          activeAdjToNounIndex = parseInt(tr.dataset.adjNounIdx, 10);
          route();
        });
      });
    }
  };

  // ---- Quiz ----
  let quiz = null;
  VIEWS.quiz = function (view) {
    view.className = "view";
    if (!quiz) { renderQuizStart(view); return; }
    renderQuizCard(view);
  };
  function renderQuizStart(view) {
    const due = dueCards(content);
    const savedStr = localStorage.getItem("lexicon_quiz_save_" + DS.id);
    let saved = null;
    try {
      if (savedStr) saved = JSON.parse(savedStr);
    } catch (e) {
      localStorage.removeItem("lexicon_quiz_save_" + DS.id);
    }

    const hasSaved = saved && saved.queue && saved.queue.length > 0;
    let stageContent = "";

    if (hasSaved) {
      stageContent = `
        <div class="card" style="text-align:center;border-color:var(--accent)">
          <div style="font-size:2.6rem">💾</div>
          <div style="font-family:var(--serif);font-size:1.5rem;font-weight:700;margin:.4rem 0">Saved Session Found</div>
          <p style="color:var(--ink-soft)">You completed ${saved.done} out of ${saved.total} cards in your previous session.</p>
          <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-top:1rem">
            <button class="btn lg" id="resumeQuiz">Resume Session</button>
            <button class="btn ghost lg" id="discardQuiz" style="color:var(--bad)">Discard Progress</button>
          </div>
        </div>
      `;
    } else {
      stageContent = `
        <div class="card" style="text-align:center">
          <div style="font-size:2.6rem">${due.length ? "📝" : "✅"}</div>
          <div style="font-family:var(--serif);font-size:1.5rem;font-weight:700;margin:.4rem 0">
            ${due.length ? due.length + " cards due" : "Nothing due right now"}</div>
          <p style="color:var(--ink-soft)">${due.length ? "These are scheduled for today." : "You can still study ahead in cram mode."}</p>
          <div class="session-size-selector" style="margin:1.2rem 0;font-size:0.85rem;color:var(--ink-soft);display:flex;justify-content:center;align-items:center;gap:0.4rem">
            <span>Session size:</span>
            <button class="pill sm ${G.sessionSize === '10' ? 'active' : ''}" data-size="10">10</button>
            <button class="pill sm ${G.sessionSize === '25' ? 'active' : ''}" data-size="25">25</button>
            <button class="pill sm ${G.sessionSize === '50' ? 'active' : ''}" data-size="50">50</button>
            <button class="pill sm ${G.sessionSize === 'all' ? 'active' : ''}" data-size="all">All</button>
          </div>
          <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-top:1rem">
            <button class="btn lg" id="startDue" ${due.length ? "" : "disabled"}>Start review</button>
            <button class="btn ghost lg" id="startCram">Cram (all cards)</button>
          </div>
        </div>
      `;
    }

    view.innerHTML = `
      <div class="view-head"><h1>Quiz</h1><p>Spaced-repetition review. Production cards ask you to produce the word; recognition cards check meaning.</p></div>
      <div class="quiz-stage">
        ${stageContent}
      </div>`;

    if (hasSaved) {
      $("#resumeQuiz").addEventListener("click", () => {
        const reQueue = saved.queue.map((q) => {
          const found = findWord(q.word);
          return found ? { id: q.id, kind: q.kind, w: found.w } : null;
        }).filter(c => c !== null);
        
        quiz = {
          queue: reQueue,
          done: saved.done,
          correct: saved.correct,
          total: saved.total,
          phase: "ask",
          grades: saved.grades || { easy: 0, good: 0, hard: 0, again: 0 }
        };
        route();
      });
      $("#discardQuiz").addEventListener("click", () => {
        if (confirm("Are you sure you want to discard your saved session progress?")) {
          localStorage.removeItem("lexicon_quiz_save_" + DS.id);
          route();
        }
      });
    } else {
      view.querySelectorAll(".session-size-selector button").forEach((btn) => {
        btn.addEventListener("click", () => {
          G.sessionSize = btn.dataset.size;
          saveG();
          route();
        });
      });
      $("#startDue").addEventListener("click", () => { startQuiz(shuffle(due)); });
      $("#startCram").addEventListener("click", () => { startQuiz(shuffle(buildDeck(content).slice())); });
    }
  }
  function startQuiz(cards) {
    localStorage.removeItem("lexicon_quiz_save_" + DS.id);
    const limit = G.sessionSize === "all" ? cards.length : parseInt(G.sessionSize, 10);
    quiz = { queue: cards.slice(0, limit), done: 0, correct: 0, total: Math.min(cards.length, limit), phase: "ask", grades: { easy: 0, good: 0, hard: 0, again: 0 } };
    route();
  }
  function renderQuizCard(view) {
    if (quiz.queue.length === 0) return renderQuizSummary(view);
    const card = quiz.queue[0];
    const w = card.w, key = wordKey(w);
    const progress = quiz.total ? (quiz.done / quiz.total) * 100 : 0;
    let body;
    if (card.kind === "production") {
      const prompt = w.example && new RegExp(key, "i").test(w.example)
        ? `<div style="font-size:1.05rem;color:var(--ink-soft);font-style:italic">“${esc(w.example).replace(new RegExp(esc(w.word), "i"), '<span class="blank">?</span>')}”</div><div style="margin-top:.7rem">${esc(w.meaning)}</div>`
        : esc(w.meaning);
      body = `<div class="quiz-kind">Production — type the word</div>
        <div class="quiz-prompt">${prompt}</div>
        <input class="quiz-input" id="qIn" autocomplete="off" autocapitalize="off" placeholder="type the word…">
        <div class="grade-row single" style="margin-top:1rem"><button class="btn block" id="qCheck">Check</button></div>`;
    } else {
      body = `<div class="quiz-kind">Recognition — do you know this word?</div>
        <div class="quiz-prompt">${esc(w.word)} <span class="detail-pos">${esc(w.pos || "")}</span></div>
        <div class="grade-row single"><button class="btn block" id="qReveal">Show meaning</button></div>`;
    }
    view.innerHTML = `
      <div class="quiz-stage">
        <div class="quiz-topbar">
          <button class="icon-btn" id="qQuit" title="End session">✕</button>
          <button class="icon-btn" id="qSave" title="Save progress" style="margin-left:.5rem">💾</button>
          <div class="quiz-bar"><i style="width:${progress}%"></i></div>
          <div style="font-size:.82rem;color:var(--ink-soft);white-space:nowrap">${quiz.done}/${quiz.total}</div>
        </div>
        <div class="quiz-card" id="qCard">${body}</div>
      </div>`;
    $("#qQuit").addEventListener("click", () => { quiz = null; route(); });
    $("#qSave").addEventListener("click", () => {
      const data = {
        queue: quiz.queue.map((c) => ({ id: c.id, kind: c.kind, word: c.w.word })),
        done: quiz.done,
        correct: quiz.correct,
        total: quiz.total,
        grades: quiz.grades
      };
      localStorage.setItem("lexicon_quiz_save_" + DS.id, JSON.stringify(data));
      toast("Progress saved!");
      quiz = null;
      route();
    });
    if (card.kind === "production") {
      const inp = $("#qIn"); inp.focus();
      const submit = () => checkProduction(card, inp.value);
      $("#qCheck").addEventListener("click", submit);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    } else {
      $("#qReveal").addEventListener("click", () => revealRecognition(card));
    }
  }
  function gradeButtons(includeAgain) {
    const g = [
      includeAgain ? `<button class="grade g-again" data-g="again">Again<small>&lt;1m</small></button>` : "",
      `<button class="grade g-hard" data-g="hard">Hard<small>early</small></button>`,
      `<button class="grade g-good" data-g="good">Good<small>on time</small></button>`,
      `<button class="grade g-easy" data-g="easy">Easy<small>later</small></button>`
    ].join("");
    return `<div class="grade-row ${includeAgain ? "" : ""}">${g}</div>`;
  }
  function checkProduction(card, val) {
    const w = card.w, correct = val.trim().toLowerCase() === w.word.toLowerCase();
    const cardEl = $("#qCard");
    if (correct) {
      cardEl.innerHTML = `<div class="quiz-kind">Production</div>
        <div class="quiz-result ok">✓ Correct — <span class="quiz-answer">${esc(w.word)}</span></div>
        <div style="color:var(--ink-soft)">${esc(w.meaning)}</div>
        <p style="font-size:.82rem;color:var(--ink-faint);margin-top:.6rem">How easily did it come?</p>
        ${gradeButtons(false)}`;
      wireGrades(card, true);
    } else {
      cardEl.innerHTML = `<div class="quiz-kind">Production</div>
        <div class="quiz-result no">✗ Not quite — the word was <span class="quiz-answer">${esc(w.word)}</span></div>
        <div style="color:var(--ink-soft)">${esc(w.meaning)}</div>
        <div class="grade-row single" style="margin-top:1rem"><button class="grade g-again" data-g="again">Got it — continue</button></div>`;
      wireGrades(card, false);
    }
  }
  function revealRecognition(card) {
    const w = card.w;
    $("#qCard").innerHTML = `<div class="quiz-kind">Recognition</div>
      <div class="quiz-prompt" style="font-size:1.3rem">${esc(w.word)}</div>
      <div style="color:var(--ink)">${esc(w.meaning)}</div>
      ${w.example ? `<p class="detail-ex">“${esc(w.example)}”</p>` : ""}
      <p style="font-size:.82rem;color:var(--ink-faint);margin-top:.6rem">Did you know it?</p>
      ${gradeButtons(true)}`;
    wireGrades(card, null);
  }
  function wireGrades(card, correct) {
    $("#qCard").querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => {
      const g = b.dataset.g;
      const wasCorrect = correct == null ? (g !== "again") : correct;
      gradeCard(card.id, g, wasCorrect);
      if (quiz.grades) quiz.grades[g] = (quiz.grades[g] || 0) + 1;
      quiz.done++; if (wasCorrect) quiz.correct++;
      quiz.queue.shift();
      if (g === "again") quiz.queue.push(card); // requeue lapses at the end
      route();
    }));
  }
  function renderQuizSummary(view) {
    const acc = quiz.done ? Math.round((quiz.correct / quiz.done) * 100) : 0;
    const total = quiz.total;
    const grades = quiz.grades || { easy: 0, good: 0, hard: 0, again: 0 };
    quiz = null;
    localStorage.removeItem("lexicon_quiz_save_" + DS.id);

    if (typeof confetti === "function" && acc >= 80) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }

    view.innerHTML = `
      <div class="quiz-stage">
        <div class="quiz-card">
          <div style="font-size:3rem">🎉</div>
          <h2 style="margin:.4rem 0">Session complete</h2>
          <div class="summary-stat">
            <div class="stat"><div class="n">${total}</div><div class="l">reviewed</div></div>
            <div class="stat"><div class="n">${acc}%</div><div class="l">accuracy</div></div>
            <div class="stat"><div class="n">${streak()}</div><div class="l">day streak</div></div>
          </div>
          
          <div style="font-size: 0.85rem; color: var(--ink-soft); margin: 1.2rem 0; text-align: left; background: var(--surface-2); padding: 1rem; border-radius: var(--r)">
            <h4 style="margin-top:0; margin-bottom:.5rem; font-family:var(--serif); color:var(--ink)">Response Breakdown</h4>
            <div style="display:flex; justify-content:space-between; margin-bottom:.3rem">
              <span>🟢 Easy:</span><strong>${grades.easy || 0}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:.3rem">
              <span>🔵 Good:</span><strong>${grades.good || 0}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:.3rem">
              <span>🟡 Hard:</span><strong>${grades.hard || 0}</strong>
            </div>
            <div style="display:flex; justify-content:space-between">
              <span>🔴 Again:</span><strong>${grades.again || 0}</strong>
            </div>
          </div>

          <div style="display:flex;gap:.6rem;justify-content:center">
            <a class="btn" href="#/dashboard">Dashboard</a>
            <button class="btn ghost" id="again">Review more</button>
          </div>
        </div>
      </div>`;
    $("#again").addEventListener("click", () => route());
  }

  // ---- Flashcards ----
  let flash = null;
  VIEWS.flashcards = function (view) {
    view.className = "view";
    if (!flash) {
      const roots = [{ id: "all", label: "All words" }, { id: "bm", label: "★ Bookmarked" }]
        .concat(content.roots.map((r) => ({ id: r.id, label: r.label })));
      view.innerHTML = `
        <div class="view-head"><h1>Flashcards</h1><p>Lightweight flip-and-browse — no scheduling, just practice. Pick a set.</p></div>
        <div class="grid cols-3">
          ${roots.map((r) => `<button class="card" style="text-align:left;cursor:pointer" data-set="${esc(r.id)}">
            <div style="font-family:var(--serif);font-size:1.1rem;font-weight:700">${esc(r.label)}</div>
            <div style="color:var(--ink-soft);font-size:.82rem;margin-top:.2rem">${flashCount(r.id)} cards</div></button>`).join("")}
        </div>`;
      view.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
        const set = flashSet(b.dataset.set);
        if (!set.length) { toast("No cards in that set", "🤔"); return; }
        flash = { cards: shuffle(set), i: 0, flipped: false }; route();
      }));
      return;
    }
    renderFlashcard(view);
  };
  function flashSet(id) {
    let ws = allWords(content);
    if (id === "bm") ws = ws.filter((w) => wordState(wordKey(w)).bookmarked);
    else if (id !== "all") ws = ws.filter((w) => w.rootId === id);
    return ws;
  }
  function flashCount(id) { return flashSet(id).length; }
  function renderFlashcard(view) {
    const w = flash.cards[flash.i];
    view.innerHTML = `
      <div class="flash-stage">
        <div class="quiz-topbar">
          <button class="icon-btn" id="fQuit">✕</button>
          <div class="quiz-bar"><i style="width:${((flash.i + 1) / flash.cards.length) * 100}%"></i></div>
          <div style="font-size:.82rem;color:var(--ink-soft)">${flash.i + 1}/${flash.cards.length}</div>
        </div>
        <div class="flashcard ${flash.flipped ? "flipped" : ""}" id="fCard">
          <div class="flashcard-inner">
            <div class="flash-face front"><div><div class="flash-word">${esc(w.word)}</div>
              <div class="detail-pos">${esc(w.pos || "")}</div></div><div class="flash-hint">tap to flip</div></div>
            <div class="flash-face back"><div><div style="font-size:1.05rem">${esc(w.meaning)}</div>
              ${w.example ? `<p class="detail-ex" style="margin-top:.8rem">“${esc(w.example)}”</p>` : ""}</div>
              <div class="flash-hint">tap to flip</div></div>
          </div>
        </div>
        <div class="flash-controls">
          <button class="btn ghost" id="fPrev">← Prev</button>
          <button class="btn ghost" id="fShuffle">⤨ Shuffle</button>
          <button class="btn" id="fNext">Next →</button>
        </div>
      </div>`;
    $("#fCard").addEventListener("click", () => { flash.flipped = !flash.flipped; $("#fCard").classList.toggle("flipped"); });
    $("#fQuit").addEventListener("click", () => { flash = null; route(); });
    $("#fPrev").addEventListener("click", () => { flash.i = (flash.i - 1 + flash.cards.length) % flash.cards.length; flash.flipped = false; route(); });
    $("#fNext").addEventListener("click", () => { flash.i = (flash.i + 1) % flash.cards.length; flash.flipped = false; route(); });
    $("#fShuffle").addEventListener("click", () => { flash.cards = shuffle(flash.cards); flash.i = 0; flash.flipped = false; route(); toast("Shuffled", "⤨"); });
  }

  // ---- Add Word / Root ----
  let addDraft = null; // when editing, holds the word being edited (by original key)
  let rootDraft = null; // when editing, holds the root being edited (by original key/id)
  let addViewMode = "word"; // "word" | "root"
  let preselectedRootId = null; // sets the default selected root when adding a word

  const POS_OPTIONS = [
    { value: "", label: "— none —" },
    { value: "n", label: "Noun (n)" },
    { value: "v", label: "Verb (v)" },
    { value: "adj", label: "Adjective (adj)" },
    { value: "adv", label: "Adverb (adv)" },
    { value: "pron", label: "Pronoun (pron)" },
    { value: "prep", label: "Preposition (prep)" },
    { value: "conj", label: "Conjunction (conj)" },
    { value: "interj", label: "Interjection (interj)" },
    { value: "phrase", label: "Phrase" }
  ];
  const ORIGIN_OPTIONS = [
    { value: "latin", label: "Latin" }, { value: "greek", label: "Greek" }, { value: "french", label: "French" }
  ];

  /* Reusable in-flow dropdown. Renders a trigger + a panel that lives in normal
     flow (pushes content below down), matches parent width, and scrolls past a
     max height. No detached/floating overlay. Current value is kept on the
     element's data-value so save logic can read it. */
  function ddSingle(name, options, current, placeholder, searchable) {
    const cur = options.find((o) => o.value === current);
    const opts = options.map((o) => ddOpt(o.label, o.value, o.value === current)).join("");
    const search = searchable ? `<input class="dd-search" data-dd-search placeholder="Search…" autocomplete="off">` : "";
    return `<div class="dd" data-dd="${esc(name)}" data-value="${esc(current || "")}">
      <button type="button" class="dd-trigger" data-dd-trigger>
        <span class="dd-value ${cur ? "" : "ph"}">${cur ? esc(cur.label) : esc(placeholder || "Choose…")}</span>
        <span class="dd-caret">▾</span>
      </button>
      <div class="dd-panel">${search}<div class="dd-opts">${opts}</div></div>
    </div>`;
  }
  function ddOpt(label, value, on) {
    return `<button type="button" class="dd-opt ${on ? "sel" : ""}" data-val="${esc(value)}">
      <span>${esc(label)}</span>${on ? '<span class="dd-check">✓</span>' : ""}</button>`;
  }
  function filterDDOpts(dd, q) {
    q = (q || "").trim().toLowerCase();
    let shown = 0;
    dd.querySelectorAll(".dd-opt").forEach((o) => {
      const keep = o.dataset.val === "__new__" || !q || o.textContent.toLowerCase().includes(q);
      o.classList.toggle("dd-hide", !keep);
      if (keep && o.dataset.val && o.dataset.val !== "__new__") shown += 1;
    });
    let empty = dd.querySelector(".dd-empty");
    if (!shown && q) {
      if (!empty) { empty = document.createElement("div"); empty.className = "dd-empty"; dd.querySelector(".dd-opts").appendChild(empty); }
      empty.textContent = "No matching roots";
      empty.style.display = "";
    } else if (empty) { empty.style.display = "none"; }
  }
  function wireDDSingle(scope, name, onSelect) {
    const dd = scope.querySelector(`[data-dd="${name}"]`); if (!dd) return;
    const search = dd.querySelector("[data-dd-search]");
    dd.querySelector("[data-dd-trigger]").addEventListener("click", () => {
      const open = dd.classList.toggle("open");
      if (open && search) { search.value = ""; filterDDOpts(dd, ""); search.focus(); }
    });
    if (search) {
      search.addEventListener("click", (e) => e.stopPropagation());
      search.addEventListener("input", () => filterDDOpts(dd, search.value));
    }
dd.querySelectorAll(".dd-opt").forEach((o) => o.addEventListener("click", () => {
      dd.dataset.value = o.dataset.val;
      dd.querySelectorAll(".dd-opt").forEach((x) => { x.classList.remove("sel"); const c = x.querySelector(".dd-check"); if (c) c.remove(); });
      o.classList.add("sel");
      const chk = document.createElement("span"); chk.className = "dd-check"; chk.textContent = "✓"; o.appendChild(chk);
      const val = dd.querySelector(".dd-value"); val.textContent = o.querySelector("span").textContent; val.classList.remove("ph");
      dd.classList.remove("open");
      if (onSelect) onSelect(o.dataset.val);
    }));
  }

  VIEWS.add = function (view) {
    view.className = "view";
    
    // Check if we have preselected a root from Explore view
    if (preselectedRootId) {
      addViewMode = "word";
      addDraft = null;
      rootDraft = null;
    }

    const mode = addViewMode; // "word" or "root"
    let html = "";
    
    // Header with mode buttons
    html += `
      <div class="view-head">
        <h1>Add or Edit Content</h1>
        <p>Manage your custom roots and vocabulary words here.</p>
      </div>
      
      <div class="pill-row" style="margin-bottom: 1.2rem">
        <button class="pill ${mode === 'word' ? 'active' : ''}" id="modeWordBtn">Add Word</button>
        <button class="pill ${mode === 'root' ? 'active' : ''}" id="modeRootBtn">Add Root</button>
      </div>
    `;
    
    if (mode === "word") {
      // WORD MODE
      const d = addDraft || {};
      const editing = !!addDraft;
      
      // If we had a preselected root, use it (and make sure we don't overwrite if editing)
      if (preselectedRootId && !editing) {
        d.rootId = preselectedRootId;
        preselectedRootId = null; // Clear it after reading
      }
      
      const rootOptions = [{ value: "", label: "— choose a root —" }]
        .concat(content.roots.map((r) => ({ value: r.id, label: r.label + " — " + r.meaning })))
        .concat([{ value: "__new__", label: "＋ Create a new root…" }]);
      let related = (d.related || []).slice();
      const mine = (S.custom.words || []).slice().reverse();
      
      html += `
        <div class="grid cols-2" style="align-items:start">
          <div class="card">
            <h3 style="margin-bottom:1rem">${editing ? "Edit word" : "Add a word"}</h3>
            <div class="field"><label>Word *</label><input class="inp" id="fWord" value="${esc(d.word || "")}" autocomplete="off" placeholder="e.g. cardiologist"></div>
            <div class="field"><label>Part of speech</label>${ddSingle("pos", POS_OPTIONS, d.pos || "", "— none —")}</div>
            <div class="field"><label>Meaning *</label><textarea class="inp" id="fMean" rows="2" placeholder="a short, precise definition">${esc(d.meaning || "")}</textarea></div>
            <div class="field"><label>Example sentence</label><textarea class="inp" id="fEx" rows="2" placeholder="a natural sentence using the word">${esc(d.example || "")}</textarea></div>
            <div class="field"><label>Contrast / nuance</label><textarea class="inp" id="fContrast" rows="2" placeholder="how it differs from a near-synonym (optional)">${esc(d.contrast || "")}</textarea></div>

            <div class="field"><label>Root *</label>${ddSingle("root", rootOptions, d.rootId || "", "— choose a root —", true)}</div>
            <div id="newRoot" class="newroot" style="display:none">
              <div class="field"><label>New root label *</label><input class="inp" id="fRootLabel" placeholder="e.g. CARDIO"></div>
              <div class="grid cols-2">
                <div class="field"><label>Origin</label>${ddSingle("origin", ORIGIN_OPTIONS, "latin", "Latin")}</div>
                <div class="field"><label>Root meaning *</label><input class="inp" id="fRootMeaning" placeholder="e.g. heart"></div>
              </div>
            </div>

            <div class="field"><label>Related words</label>
              <div class="chips" id="relChips" style="margin-bottom:.4rem">${related.map(relChip).join("")}</div>
              <div class="dd" data-dd="related">
                <button type="button" class="dd-trigger" data-dd-trigger><span class="dd-value ph">Link related words…</span><span class="dd-caret">▾</span></button>
                <div class="dd-panel">
                  <input class="dd-search" id="relSearch" placeholder="Search words…" autocomplete="off">
                  <div class="dd-opts" id="relOpts">${relOptionsHTML(related, "")}</div>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:.6rem;margin-top:.4rem">
              <button class="btn" id="fSave">${editing ? "Save changes" : "Add word"}</button>
              ${editing ? '<button class="btn ghost" id="fCancel">Cancel</button>' : ""}
            </div>
          </div>

          <div class="card">
            <div class="card-lead"><h3>My words</h3><span style="color:var(--ink-soft);font-size:.82rem">${(S.custom.words || []).length} added</span></div>
            ${mine.length ? `<div class="mywords">${mine.map(myWordRow).join("")}</div>`
              : `<div class="empty-note" style="padding:1.5rem 0">Nothing yet. Words you add appear here.</div>`}
          </div>
        </div>
      `;
    } else {
      // ROOT MODE
      const rd = rootDraft || {};
      const editing = !!rootDraft;
      const mineRoots = (S.custom.roots || []).slice().reverse();
      
      html += `
        <div class="grid cols-2" style="align-items:start">
          <div class="card">
            <h3 style="margin-bottom:1rem">${editing ? "Edit root word" : "Add a root word"}</h3>
            <div class="field"><label>Root label *</label><input class="inp" id="fRootLabelOnly" value="${esc(rd.label || "")}" placeholder="e.g. CARDIO"></div>
            <div class="field"><label>Origin</label>${ddSingle("originOnly", ORIGIN_OPTIONS, rd.origin || "latin", "Latin")}</div>
            <div class="field"><label>Meaning *</label><input class="inp" id="fRootMeaningOnly" value="${esc(rd.meaning || "")}" placeholder="e.g. heart"></div>
            
            <div style="display:flex;gap:.6rem;margin-top:.4rem">
              <button class="btn" id="fSaveRoot">${editing ? "Save changes" : "Add root"}</button>
              ${editing ? '<button class="btn ghost" id="fCancelRoot">Cancel</button>' : ""}
            </div>
          </div>

          <div class="card">
            <div class="card-lead"><h3>My roots</h3><span style="color:var(--ink-soft);font-size:.82rem">${(S.custom.roots || []).length} added</span></div>
            ${mineRoots.length ? `<div class="mywords">${mineRoots.map(myRootRow).join("")}</div>`
              : `<div class="empty-note" style="padding:1.5rem 0">Nothing yet. Roots you add appear here.</div>`}
          </div>
        </div>
      `;
    }
    
    view.innerHTML = html;
    
    // Wire up events based on the active mode
    // Common tab buttons
    $("#modeWordBtn").addEventListener("click", () => { addViewMode = "word"; route(); });
    $("#modeRootBtn").addEventListener("click", () => { addViewMode = "root"; route(); });
    
    if (mode === "word") {
      const d = addDraft || {};
      const editing = !!addDraft;
      
      // Wire POS dropdown
      wireDDSingle(view, "pos");
      
      // Wire root dropdown
      const newRoot = $("#newRoot");
      wireDDSingle(view, "root", (val) => { newRoot.style.display = val === "__new__" ? "block" : "none"; });
      if ((d.rootId || "") === "__new__") newRoot.style.display = "block";
      
      // Wire origin dropdown (inside new root panel)
      wireDDSingle(view, "origin");
      
      // Related words logic
      let related = (d.related || []).slice();
      const relDD = view.querySelector('[data-dd="related"]');
      const relSearch = $("#relSearch");
      relDD.querySelector("[data-dd-trigger]").addEventListener("click", () => relDD.classList.toggle("open"));
      relSearch.addEventListener("click", (e) => e.stopPropagation());
      relSearch.addEventListener("input", () => { $("#relOpts").innerHTML = relOptionsHTML(related, relSearch.value); wireRelOpts(); });
      
      function wireRelOpts() {
        view.querySelectorAll("#relOpts .dd-opt").forEach((o) =>
          o.addEventListener("click", (e) => { e.stopPropagation(); toggleRel(o.dataset.val); }));
      }
      function toggleRel(word) {
        const i = related.findIndex((r) => r.toLowerCase() === word.toLowerCase());
        if (i >= 0) related.splice(i, 1); else related.push(word);
        $("#relOpts").innerHTML = relOptionsHTML(related, relSearch.value); wireRelOpts();
        drawRelChips();
      }
      function drawRelChips() {
        $("#relChips").innerHTML = related.map(relChip).join("");
        view.querySelectorAll("#relChips [data-rmrel]").forEach((b) => b.addEventListener("click", () => toggleRel(b.dataset.rmrel)));
      }
      wireRelOpts(); drawRelChips();
      
      $("#fSave").addEventListener("click", () => saveWord(related, editing ? d.__key : null));
      if (editing) $("#fCancel").addEventListener("click", () => { addDraft = null; route(); });
      
      view.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => beginEdit(b.dataset.edit)));
      view.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteWord(b.dataset.del)));
    } else {
      const rd = rootDraft || {};
      const editing = !!rootDraft;
      
      // Wire Origin dropdown for roots form
      wireDDSingle(view, "originOnly");
      
      $("#fSaveRoot").addEventListener("click", () => saveRoot(editing ? rd.__key : null));
      if (editing) $("#fCancelRoot").addEventListener("click", () => { rootDraft = null; route(); });
      
      view.querySelectorAll("[data-edit-root]").forEach((b) => b.addEventListener("click", () => beginEditRoot(b.dataset.editRoot)));
      view.querySelectorAll("[data-del-root]").forEach((b) => b.addEventListener("click", () => deleteRoot(b.dataset.delRoot)));
    }
  };

  function relOptionsHTML(related, q) {
    q = (q || "").trim().toLowerCase();
    const words = allWords(content).filter((w) => !q || w.word.toLowerCase().includes(q));
    if (!words.length) return '<div class="dd-empty">No matching words</div>';
    return words.map((w) => {
      const on = related.some((r) => r.toLowerCase() === w.word.toLowerCase());
      const root = content.roots.find((r) => r.id === w.rootId);
      return `<button type="button" class="dd-opt ${on ? "sel" : ""}" data-val="${esc(w.word)}">
        <span>${esc(w.word)} <small style="color:var(--ink-faint)">${esc(root ? root.label : "")}</small></span>
        ${on ? '<span class="dd-check">✓</span>' : ""}</button>`;
    }).join("");
  }

  function relChip(w) { return `<span class="chip">${esc(w)} <button data-rmrel="${esc(w.toLowerCase())}" style="border:none;background:none;color:inherit;cursor:pointer;padding:0 0 0 .2rem">✕</button></span>`; }
  function myWordRow(w) {
    const root = content.roots.find((r) => r.id === w.rootId);
    return `<div class="myword">
      <div><span style="font-family:var(--serif);font-weight:700">${esc(w.word)}</span>
        <span style="color:var(--ink-faint);font-size:.78rem"> · ${esc(root ? root.label : w.rootId)}</span>
        <div style="color:var(--ink-soft);font-size:.82rem">${esc(w.meaning)}</div></div>
      <div style="display:flex;gap:.3rem;flex:none">
        <button class="mini-btn" data-edit="${esc(w.word.toLowerCase())}">Edit</button>
        <button class="mini-btn" data-del="${esc(w.word.toLowerCase())}">Delete</button>
      </div></div>`;
  }

  function myRootRow(r) {
    return `<div class="myword ${oc(r.origin)}">
      <div>
        <span class="root-label" style="font-size:1.05rem;color:var(--oc);font-family:var(--serif);font-weight:700">${esc(r.label)}</span>
        <span class="badge" style="margin-left:.3rem">${esc(cap(r.origin))}</span>
        <div style="color:var(--ink-soft);font-size:.82rem">“${esc(r.meaning)}”</div>
      </div>
      <div style="display:flex;gap:.3rem;flex:none;align-items:center">
        <button class="mini-btn" data-edit-root="${esc(r.id)}">Edit</button>
        <button class="mini-btn" data-del-root="${esc(r.id)}">Delete</button>
      </div>
    </div>`;
  }

  function saveWord(related, editKey) {
    const word = $("#fWord").value.trim();
    const meaning = $("#fMean").value.trim();
    let rootId = $('[data-dd="root"]').dataset.value;
    if (!word) return toast("Enter a word", "⚠️");
    if (!meaning) return toast("Enter a meaning", "⚠️");
    if (!rootId) return toast("Choose or create a root", "⚠️");

    const key = word.toLowerCase();
    // duplicate check (allow if editing the same word)
    const existing = findWord(key);
    if (existing && (!editKey || editKey !== key)) return toast('"' + word + '" already exists', "⚠️");

    if (rootId === "__new__") {
      const label = $("#fRootLabel").value.trim();
      const meaningR = $("#fRootMeaning").value.trim();
      const origin = $('[data-dd="origin"]').dataset.value || "latin";
      if (!label || !meaningR) return toast("Fill in the new root's label and meaning", "⚠️");
      rootId = "custom-" + slug(label);
      if (!S.custom.roots.some((r) => r.id === rootId) && !DS.roots.some((r) => r.id === rootId))
        S.custom.roots.push({ id: rootId, label: label, origin: origin, meaning: meaningR });
    }

    const entry = { rootId: rootId, word: word, pos: $('[data-dd="pos"]').dataset.value || "",
      meaning: meaning, example: $("#fEx").value.trim(), contrast: $("#fContrast").value.trim(),
      related: related.slice(), custom: true };

    if (editKey) S.custom.words = S.custom.words.filter((w) => w.word.toLowerCase() !== editKey);
    S.custom.words.push(entry);
    persist(); rebuildContent(); addDraft = null;
    toast(editKey ? "Word updated" : "Word added — it's now in Roots & Quiz", "✅");
    checkAchievements(); route();
  }

  function saveRoot(editKey) {
    const label = $("#fRootLabelOnly").value.trim().toUpperCase();
    const meaning = $("#fRootMeaningOnly").value.trim();
    const origin = $('[data-dd="originOnly"]').dataset.value || "latin";
    
    if (!label) return toast("Enter a root label", "⚠️");
    if (!meaning) return toast("Enter a root meaning", "⚠️");
    
    const rootId = "custom-" + slug(label);
    
    // check duplicate
    const isDup = S.custom.roots.some((r) => r.id === rootId && (!editKey || editKey !== r.id)) ||
                  DS.roots.some((r) => r.id === rootId);
    if (isDup) return toast('Root "' + label + '" already exists', "⚠️");
    
    const entry = { id: rootId, label: label, origin: origin, meaning: meaning };
    
    if (editKey) {
      // update any words that were pointing to the old rootId
      S.custom.words.forEach((w) => {
        if (w.rootId === editKey) w.rootId = rootId;
      });
      S.custom.roots = S.custom.roots.filter((r) => r.id !== editKey);
    }
    
    S.custom.roots.push(entry);
    persist(); rebuildContent();
    rootDraft = null;
    toast(editKey ? "Root updated" : "Root added — you can now attach words to it", "✅");
    route();
  }

  function beginEdit(key) {
    const w = S.custom.words.find((x) => x.word.toLowerCase() === key); if (!w) return;
    addDraft = Object.assign({}, w, { __key: key });
    route(); window.scrollTo(0, 0);
  }

  function beginEditRoot(id) {
    const r = S.custom.roots.find((x) => x.id === id); if (!r) return;
    rootDraft = Object.assign({}, r, { __key: id });
    route(); window.scrollTo(0, 0);
  }

  function deleteWord(key) {
    S.custom.words = S.custom.words.filter((w) => w.word.toLowerCase() !== key);
    persist(); rebuildContent(); toast("Word deleted", "🗑️"); route();
  }

  function deleteRoot(id) {
    const hasWords = allWords(content).some((w) => w.rootId === id);
    if (hasWords) {
      return toast("Cannot delete root: words are attached to it", "⚠️");
    }
    S.custom.roots = S.custom.roots.filter((r) => r.id !== id);
    persist(); rebuildContent(); toast("Root deleted", "🗑️"); route();
  }

  VIEWS.stats = function (view) {
    view.className = "view";
    const c = counts(content);
    const last14 = reviewsByDay(14);
    const maxDay = Math.max(1, ...last14.map((d) => d.n));
    const retention = retentionByDay(14);
    view.innerHTML = `
      <div class="view-head"><h1>Progress</h1><p>Your learning history for ${esc(DS.title)}.</p></div>

      <div class="grid cols-4">
        ${statTile(c.mastered, "mastered", "")}
        ${statTile(c.learning, "learning", "")}
        ${statTile(S.log.length, "reviews", "")}
        ${statTile(streak(), "day streak", "")}
      </div>

      <div class="grid cols-3" style="margin-top:1rem">
        <div class="card">
          <div class="card-lead"><h3>Mastery</h3><span style="color:var(--ink-soft);font-size:.82rem">${c.total} words</span></div>
          <div class="stacked">
            <i style="width:${bar(c.mastered, c.total)}%;background:var(--good)"></i>
            <i style="width:${bar(c.learning, c.total)}%;background:var(--warn)"></i>
          </div>
          <div class="legend">
            <b><span class="dot" style="background:var(--good)"></span>Mastered ${c.mastered}</b>
            <b><span class="dot" style="background:var(--warn)"></span>Learning ${c.learning}</b>
            <b><span class="dot" style="background:var(--rule)"></span>New ${c.new}</b>
          </div>
        </div>
        <div class="card">
          <div class="card-lead"><h3>Reviews · last 14 days</h3></div>
          <div class="bars">${last14.map((d) => `<div class="bar ${d.n ? "" : "empty"}" style="height:${Math.max(3, (d.n / maxDay) * 100)}%" title="${d.n} on ${d.label}"></div>`).join("")}</div>
          <div class="bar-labels">${last14.map((d, i) => `<span>${i % 2 === 0 ? d.short : ""}</span>`).join("")}</div>
        </div>
        <div class="card">
          <div class="card-lead"><h3>Retention · last 14 days</h3></div>
          <div class="bars">${retention.map((d) => `<div class="bar ${d.count ? "" : "empty"}" style="height:${Math.max(3, d.rate)}%;background:var(--good)" title="${d.rate}% retention (${d.count} reviews) on ${d.label}"></div>`).join("")}</div>
          <div class="bar-labels">${retention.map((d, i) => `<span>${i % 2 === 0 ? d.short : ""}</span>`).join("")}</div>
        </div>
      </div>

      <div class="card" style="margin-top:1rem">
        <div class="card-lead"><h3>Progress by root</h3></div>
        ${content.roots.map((r) => {
          const m = r.words.filter((w) => wordStatus(wordKey(w)) === "mastered").length;
          const pct = Math.round(bar(m, r.words.length));
          return `<div class="rootbar"><span class="name ${oc(r.origin)}" style="color:var(--oc)">${esc(r.label)}</span>
            <span class="track"><i style="width:${pct}%"></i></span><span class="pct">${m}/${r.words.length}</span></div>`;
        }).join("")}
      </div>

      <div class="card" style="margin-top:1rem">
        <div class="card-lead"><h3>Achievements</h3><span style="color:var(--ink-soft);font-size:.82rem">${ACHS.filter((a) => S.achievements[a.id]).length}/${ACHS.length}</span></div>
        <div class="ach-grid">${ACHS.map(achCard).join("")}</div>
      </div>

      <div class="card" style="margin-top:1rem">
        <div class="card-lead"><h3>Cloud Sync</h3></div>
        <p style="color:var(--ink-soft);margin:0 0 .8rem">
          ${db ? "☁️ Connected to your Firestore database." : "🔌 Cloud sync is disabled. Configure Firebase Firestore to enable multi-device sync."}
        </p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button class="btn" id="cfgSyncBtn">🔑 Configure Sync</button>
          ${db ? `
            <button class="btn ghost" id="testSyncBtn" style="color:var(--good)">🔄 Sync Now</button>
            <button class="btn ghost" id="resetSyncBtn" style="color:var(--bad)">✕ Disconnect</button>
          ` : ""}
        </div>
        <div id="syncConfigForm" style="display:none;margin-top:1rem;background:var(--surface-2);padding:1rem;border-radius:var(--r)">
          <p style="margin-top:0;font-size:0.85rem;color:var(--ink-soft)">Paste the Firebase configuration credentials block here:</p>
          <textarea id="syncCfgVal" rows="8" style="width:100%;font-family:monospace;font-size:0.8rem;padding:0.5rem;background:var(--surface-1);color:var(--ink);border:1px solid var(--rule);border-radius:4px" placeholder='{\n  "apiKey": "AIzaSy...",\n  "authDomain": "...",\n  "projectId": "..."\n}'></textarea>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
            <button class="btn" id="saveSyncCfgBtn">Save & Connect</button>
            <button class="btn ghost" id="closeSyncCfgBtn">Cancel</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:1rem">
        <div class="card-lead"><h3>Your data</h3></div>
        <p style="color:var(--ink-soft);margin:0 0 .8rem">Progress is saved in this browser. Export a snapshot to back it up or share it with your teacher; import to restore.</p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button class="btn ghost" id="expBtn">⬇ Export progress</button>
          <button class="btn ghost" id="impBtn">⬆ Import</button>
          <input type="file" id="impFile" accept="application/json" style="display:none">
        </div>
      </div>`;

    $("#expBtn").addEventListener("click", exportProgress);
    $("#impBtn").addEventListener("click", () => $("#impFile").click());
    $("#impFile").addEventListener("change", importProgress);

    const cfgForm = $("#syncConfigForm");
    const cfgVal = $("#syncCfgVal");

    $("#cfgSyncBtn").addEventListener("click", () => {
      const stored = localStorage.getItem("vocabApp:v1:firebaseConfig");
      if (stored) {
        try {
          cfgVal.value = JSON.stringify(JSON.parse(stored), null, 2);
        } catch (e) {
          cfgVal.value = stored;
        }
      }
      cfgForm.style.display = cfgForm.style.display === "none" ? "block" : "none";
    });

    $("#saveSyncCfgBtn").addEventListener("click", () => {
      let config = cfgVal.value.trim();
      if (!config) {
        alert("Please enter a valid Firebase Configuration.");
        return;
      }
      try {
        // Extract only the object braces to strip out code wrappers
        const start = config.indexOf("{");
        const end = config.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          config = config.substring(start, end + 1);
        }

        // Native JS evaluation handles any quoted/unquoted keys and colons inside strings correctly
        const parsed = new Function("return (" + config + ")")();
        if (!parsed.apiKey || !parsed.projectId) {
          throw new Error("Missing apiKey or projectId");
        }
        localStorage.setItem("vocabApp:v1:firebaseConfig", JSON.stringify(parsed));
        toast("Configuration saved! Reloading...", "🔑");
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        alert("Error parsing config. Make sure you copy and paste the config object correctly.\n\nDetails: " + err.message);
      }
    });

    $("#closeSyncCfgBtn").addEventListener("click", () => {
      cfgForm.style.display = "none";
    });

    if (db) {
      $("#testSyncBtn").addEventListener("click", () => {
        toast("Manual sync triggered...", "🔄");
        syncCloud(true);
      });
      $("#resetSyncBtn").addEventListener("click", () => {
        if (confirm("Disconnect database sync? Your local progress will not be deleted, but cloud backups will stop.")) {
          localStorage.removeItem("vocabApp:v1:firebaseConfig");
          toast("Disconnected! Reloading...", "✕");
          setTimeout(() => location.reload(), 1000);
        }
      });
    }
  };

  function reviewsByDay(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const t = Date.now() - i * DAY, d = new Date(t);
      out.push({ n: S.days[dayKey(t)] || 0, label: d.toLocaleDateString(), short: d.getDate() + "" });
    }
    return out;
  }
  function retentionByDay(n) {
    const out = [];
    const logsByDay = {};
    (S.log || []).forEach((entry) => {
      const k = dayKey(entry.t);
      if (!logsByDay[k]) logsByDay[k] = { total: 0, correct: 0 };
      logsByDay[k].total++;
      if (entry.correct) logsByDay[k].correct++;
    });
    for (let i = n - 1; i >= 0; i--) {
      const t = Date.now() - i * DAY, d = new Date(t);
      const k = dayKey(t);
      const dayData = logsByDay[k];
      const rate = dayData && dayData.total ? Math.round((dayData.correct / dayData.total) * 100) : 0;
      out.push({ rate: rate, count: dayData ? dayData.total : 0, label: d.toLocaleDateString(), short: d.getDate() + "" });
    }
    return out;
  }
  function exportProgress() {
    const blob = new Blob([JSON.stringify({ dataset: DS.id, exportedFor: DS.title, state: S }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "lexicon-" + DS.id + "-progress.json"; a.click(); URL.revokeObjectURL(a.href);
    toast("Progress exported", "⬇");
  }
  function importProgress(e) {
    const file = e.target.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        const st = data.state || data;
        if (!st.cards) throw new Error("bad file");
        S = Object.assign({ cards: {}, words: {}, log: [], days: {}, achievements: {}, settings: {}, custom: { roots: [], words: [] } }, st);
        if (!S.custom) S.custom = { roots: [], words: [] };
        persist(); rebuildContent(); toast("Progress imported", "✅"); route();
      } catch (err) { toast("Could not read that file", "⚠️"); }
    };
    rd.readAsText(file);
  }

  /* ---------------- shared ---------------- */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------------- 8. init ---------------- */
  if (!DATASETS.length) { document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">No dataset loaded.</p>'; return; }
  window.addEventListener("hashchange", () => {
    if (currentRoute() !== "quiz") quiz = null;
    if (currentRoute() !== "flashcards") flash = null;
    if (currentRoute() !== "add") { addDraft = null; rootDraft = null; addViewMode = "word"; }
    if (currentRoute() !== "morphology") { morphMode = "pos"; activeNounToAdjIndex = 0; activeAdjToNounIndex = 0; }
    route();
  });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (G.theme === "system") applyTheme(); });

  // Close any open in-flow dropdown when clicking outside of it.
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".dd.open").forEach((dd) => { if (!dd.contains(e.target)) dd.classList.remove("open"); });
  });

  rebuildContent();
  renderShell();
  if (!location.hash) location.hash = "#/dashboard";
  route();
  if (db) syncCloud();
})();
