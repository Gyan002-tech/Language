/* Simplified spaced-repetition engine, modeled on Anki's four-button grading
   (Again / Hard / Good / Easy). New cards pass through short learning steps
   before graduating into day-scale review intervals. */

const SRS_LEARNING_STEPS_MIN = [1, 10];
const SRS_GOOD_GRADUATE_DAYS = 1;
const SRS_EASY_GRADUATE_DAYS = 4;
const SRS_MIN_EASE = 1.3;
const SRS_START_EASE = 2.5;
const SRS_MATURE_DAYS = 21;

function srsNewCard() {
  return {
    phase: "learning",
    step: 0,
    interval: 0,
    ease: SRS_START_EASE,
    reps: 0,
    lapses: 0,
    due: Date.now(),
  };
}

function srsGrade(card, grade) {
  const now = Date.now();
  const c = Object.assign({}, card);
  const minute = 60 * 1000;
  const day = 24 * 60 * minute;

  if (c.phase === "learning" || c.phase === "relearning") {
    if (grade === "again") {
      c.step = 0;
      c.due = now + SRS_LEARNING_STEPS_MIN[0] * minute;
    } else if (grade === "hard") {
      c.due = now + SRS_LEARNING_STEPS_MIN[c.step] * minute;
    } else if (grade === "good") {
      c.step += 1;
      if (c.step >= SRS_LEARNING_STEPS_MIN.length) {
        c.phase = "review";
        c.interval = SRS_GOOD_GRADUATE_DAYS;
        c.due = now + c.interval * day;
        c.reps += 1;
      } else {
        c.due = now + SRS_LEARNING_STEPS_MIN[c.step] * minute;
      }
    } else if (grade === "easy") {
      c.phase = "review";
      c.interval = SRS_EASY_GRADUATE_DAYS;
      c.due = now + c.interval * day;
      c.reps += 1;
    }
    return c;
  }

  // c.phase === "review"
  if (grade === "again") {
    c.lapses += 1;
    c.ease = Math.max(SRS_MIN_EASE, c.ease - 0.2);
    c.interval = 1;
    c.phase = "relearning";
    c.step = 0;
    c.due = now + SRS_LEARNING_STEPS_MIN[0] * minute;
  } else if (grade === "hard") {
    c.ease = Math.max(SRS_MIN_EASE, c.ease - 0.15);
    c.interval = Math.max(1, Math.round(c.interval * 1.2));
    c.due = now + c.interval * day;
    c.reps += 1;
  } else if (grade === "good") {
    c.interval = Math.max(1, Math.round(c.interval * c.ease));
    c.due = now + c.interval * day;
    c.reps += 1;
  } else if (grade === "easy") {
    c.interval = Math.max(1, Math.round(c.interval * c.ease * 1.3));
    c.ease = c.ease + 0.15;
    c.due = now + c.interval * day;
    c.reps += 1;
  }
  return c;
}

function srsIsDue(card, now) {
  return card.due <= (now || Date.now());
}

function srsIsMature(card) {
  return card.phase === "review" && card.interval >= SRS_MATURE_DAYS;
}
