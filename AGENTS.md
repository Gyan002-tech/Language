# AGENTS.md — Project Orientation for AI Agents

**Read this first.** This workspace is one folder holding **two intertwined but distinct projects**. Knowing which files belong to which role is essential before you touch anything — the `assets/` folder in particular is *shared* between both.

- **Role 1 — Teach English:** curate spoken-English lessons one-by-one for the user (Satyam). This was the original purpose.
- **Role 2 — Vocabulary Interface ("Lexicon"):** a browser app where words are entered chapter-by-chapter with full metadata, for easy reference and spaced-repetition review.

The two roles are bridged: the *Word Power Made Easy* book (in `Books/`) is both the vocabulary app's word source (Role 2) and the root-word vehicle for the teaching course's vocabulary module (Role 1). See `learning-records/0004-passive-active-vocabulary-gap.md`.

**Orient yourself by reading, in order:**
1. `.agents/skills/teach/SKILL.md` — the rulebook that drives Role 1 (how lessons, references, learning-records work).
2. `MISSION.md` — *why* the user is learning (the spoken-English fluency gap).
3. `NOTES.md` — teaching preferences + the 5-module course plan.

---

## Role 1 — English Language Teaching (curated lessons)

**The teaching loop** (governed by `.agents/skills/teach/SKILL.md`):
read `MISSION.md` + `learning-records/` → find the user's zone of proximal development → produce **one** short, self-contained HTML lesson tied to the mission → optionally distill a quick-reference doc → log a learning record. Lessons are numbered `0001+`, beautiful/Tufte-style, and reuse shared components from `assets/`.

**Files:**
- `MISSION.md` — why Satyam is learning (comprehension is strong, spoken *production* is weak); success criteria + the ~10–15 min/day, solo-practice constraints. Grounds every lesson.
- `NOTES.md` — teaching preferences (wants **multiple concrete worked examples per real-world context** before advancing) + the **5-module course plan**: 1) Structure/PREP → 2) Word-selection confidence → 3) Pronunciation → 4) Fluency & delivery → 5) Integration.
- `RESOURCES.md` — vetted external knowledge & community (wisdom) sources, each with a "use for" note. Never trust parametric knowledge; ground lessons in these and cite them.
- `lessons/*.html` — the lessons themselves (`0001`–`0004`), each self-contained, linking `assets/style.css` and `assets/quiz.js`.
- `reference/*.html` — compressed cheat-sheets distilled from lessons, designed for re-visiting (`0001` PREP framework, `0002` meeting phrase-bank).
- `learning-records/*.md` — ADR-style records of what was learned and key decisions (`0001`–`0004`); these drive what to teach next.
- `assets/style.css` — shared stylesheet for **all lessons and reference docs** (warm paper/ink palette; makes the course look consistent).
- `assets/quiz.js` — reusable multiple-choice quiz widget with immediate feedback; auto-inits `.quiz-q` elements in lessons.
- `.agents/skills/teach/` — the `teach` skill: `SKILL.md` (rulebook) + `*-FORMAT.md` templates for MISSION / RESOURCES / LEARNING-RECORD / GLOSSARY. (`.claude/skills/teach` is a **symlink** to this dir, not a copy.)
- `skills-lock.json` — pins the `teach` skill to its source/version (`mattpocock/skills`).

> **Open gap:** `GLOSSARY-FORMAT.md` exists but **no `GLOSSARY.md` has been created yet.** Once the course has enough shared terminology, build one and adhere to it in every lesson.

---

## Role 2 — Vocabulary Interface ("Lexicon" app)

**Goal:** enter words **chapter-by-chapter** with full metadata into a book-agnostic spaced-repetition app, so the user can explore roots, quiz, use flashcards, and track progress. Words are sourced from *Word Power Made Easy* (Norman Lewis).

The app is a zero-build vanilla-JS SPA that runs straight from `file://` — just open `app/index.html`. Its views: **Dashboard, Roots, Morphology, Quiz, Flashcards, Add Word, Progress.**

### How to add words (two paths)

**1. Bulk / by-the-book — an agent edits the dataset file** *(the canonical way to add a chapter's words)*
Edit `data/wpme.js`. Push word objects onto an existing root's `words[]`, or add a new root object to `roots[]`, following the existing shape.

Data shapes:
```js
// A root (a Greek/Latin/French root and its word family)
{ id: "ego", label: "EGO", origin: "latin", meaning: "I, self", words: [ /* word objects */ ] }

// A word object
{ word: "egoist",
  pos: "n",                          // part of speech
  meaning: "one guided chiefly by self-interest",
  example: "The egoist made every decision based on personal gain.",
  contrast: "an altruist is the opposite",   // optional
  related: ["altruist"],                      // optional: links to other words
  unit: 1 }                           // which Session (unitLabel) the word belongs to
```
- `origin` is one of `latin` | `greek` | `french` (drives color coding).
- `unit` = the book's **Session** number. The dataset's `chapterOf` map (e.g. `{1:3, 2:3, 3:3}`) resolves each Session to its **book Chapter**, which is how the UI renders "Chapter 3 · Session 1". When you add words for a new session, extend `chapterOf` accordingly.
- **To add a whole new book:** create `data/<id>.js` that pushes a new object onto `window.VocabDatasets` with the same shape, then link it in `app/index.html`. Progress is keyed per-dataset, so books don't clobber each other's history.

**2. In-app — the user adds words live**
The **"Add Word" view** lets the user add custom roots/words through the UI. These are stored in `localStorage`, marked ✎ "added by me", and merged with the book dataset at runtime.

### Files
- `app/index.html` — the app shell. Loads the dataset(s) (`data/wpme.js`) + engine (`assets/srs.js`, `assets/app.js`). This is the file you open to run the app.
- `data/wpme.js` — the vocabulary **dataset**: the chapter/session-by-chapter word data. **This is the file an agent edits to add words in bulk.**
- `assets/app.js` — the Lexicon SPA engine: utils, dataset registry, per-dataset `localStorage` state, deck/SRS, achievements, router + views. Book-agnostic — everything reads from the active dataset.
- `assets/app.css` — the app's own design system and view styles (nav, cards, charts).
- `assets/srs.js` — spaced-repetition scheduling engine, Anki-style four-button grading (Again / Hard / Good / Easy).

---

## Shared / infrastructure

- `Books/Word Power Made Easy … .pdf` — **the source feeding both roles**: the vocab dataset's words (Role 2) and the root-word material for the teaching vocabulary module (Role 1).
- `assets/` — **shared folder, split by role:**
  - Role 1: `style.css`, `quiz.js`
  - Role 2: `app.css`, `app.js`, `srs.js`
  - (Both role stylesheets reuse the same warm paper/ink palette, so keep colors consistent when editing either.)
- `.claude/settings.local.json` — local Claude Code permissions allowlist (project infra).
- `.claude/skills/teach` — symlink to `.agents/skills/teach`.

---

## Coverage checklist (every path tagged)

| Path | Role |
|------|------|
| `MISSION.md` | Role 1 |
| `NOTES.md` | Role 1 |
| `RESOURCES.md` | Role 1 |
| `lessons/` | Role 1 |
| `reference/` | Role 1 |
| `learning-records/` | Role 1 |
| `assets/style.css`, `assets/quiz.js` | Role 1 |
| `.agents/skills/teach/` (+ `.claude/skills/teach` symlink) | Role 1 (infra) |
| `skills-lock.json` | Role 1 (infra) |
| `app/index.html` | Role 2 |
| `data/wpme.js` | Role 2 |
| `assets/app.js`, `assets/app.css`, `assets/srs.js` | Role 2 |
| `Books/*.pdf` | Shared (source for both) |
| `assets/` (folder) | Shared (files split above) |
| `.claude/settings.local.json` | Shared (infra) |
