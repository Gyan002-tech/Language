/* Reusable multiple-choice quiz widget with immediate feedback.
   Usage: <div class="quiz-q" data-correct="1">
            <div class="prompt">...</div>
            <div class="options">
              <button class="quiz-option">...</button>  (index 0)
              <button class="quiz-option">...</button>  (index 1, correct)
            </div>
            <div class="quiz-feedback"></div>
          </div>
   Call initQuizzes() after DOM load. */

function initQuizzes() {
  document.querySelectorAll(".quiz-q").forEach((q) => {
    const correctIndex = parseInt(q.dataset.correct, 10);
    const options = Array.from(q.querySelectorAll(".quiz-option"));
    const feedback = q.querySelector(".quiz-feedback");
    let answered = false;

    options.forEach((opt, i) => {
      opt.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        options.forEach((o, j) => {
          if (j === correctIndex) o.classList.add("correct");
          else if (j === i) o.classList.add("incorrect");
        });
        feedback.textContent = i === correctIndex
          ? (opt.dataset.explain || "Correct.")
          : (options[correctIndex].dataset.explain || "Not quite — see the highlighted answer.");
        feedback.className = "quiz-feedback " + (i === correctIndex ? "correct" : "incorrect");
      });
    });
  });
}

function initReveals() {
  document.querySelectorAll("[data-reveal-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = document.getElementById(btn.dataset.revealTarget);
      if (box) box.classList.toggle("shown");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initQuizzes();
  initReveals();
});
