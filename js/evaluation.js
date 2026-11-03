(function () {
  function evaluate(record, answers) {
    var correct = 0,
      points = 0,
      topics = {};
    record.questions.forEach(function (q, i) {
      var answer = String(answers[i] || "").trim(),
        earned = 0;
      if (q.type === "objective") {
        if (answer === String(q.correctIndex)) {
          correct++;
          earned = 100;
        }
      } else {
        var hits = q.keywords.filter(function (word) {
          return answer.toLowerCase().indexOf(word) >= 0;
        }).length;
        earned = Math.min(
          100,
          Math.round((hits / Math.max(3, q.keywords.length)) * 100),
        );
      }
      points += earned;
      topics[q.topic] = topics[q.topic] || { total: 0, count: 0 };
      topics[q.topic].total += earned;
      topics[q.topic].count++;
    });
    var percentage = Math.round(points / record.questions.length),
      feedback =
        percentage >= 80
          ? "Excellent performance. Your answers demonstrate strong role readiness."
          : percentage >= 60
            ? "Good foundation. Strengthen a few concepts to become more consistent."
            : "Keep practicing the fundamentals and explain your reasoning with more detail.";
    return {
      score: percentage,
      percentage: percentage,
      objectiveCorrect: correct,
      feedback: feedback,
      topicScores: Object.keys(topics).map(function (topic) {
        return {
          topic: topic,
          score: Math.round(topics[topic].total / topics[topic].count),
        };
      }),
    };
  }
  window.InterviewEvaluation = { evaluate: evaluate };
  var result = document.getElementById("result-content");
  if (!result) return;
  var record = InterviewData.getInterview(
    new URLSearchParams(window.location.search).get("id"),
  );
  if (!record || record.status !== "Submitted") {
    result.innerHTML =
      "<div class='card empty-state'><strong>Result not found</strong><p>This interview may be invalid or still in progress.</p><a class='button primary' href='candidate.html'>Back to dashboard</a></div>";
    return;
  }
  var session = InterviewData.getSession(),
    topicScores = record.topicScores || [];
  result.innerHTML =
    "<section class='result-hero'><div><span class='eyebrow'>Completed " +
    formatDate(record.submittedAt) +
    "</span><h2>" +
    escapeHtml(record.role) +
    "</h2><p>" +
    record.difficulty +
    " difficulty · " +
    escapeHtml(session.name) +
    " · " +
    record.mode +
    " mode</p></div><div class='score-ring'><strong>" +
    record.percentage +
    "%</strong><span>Score</span></div></section><section class='result-grid'><div class='card feedback-card'><span class='eyebrow'>System feedback</span><h2>" +
    escapeHtml(record.feedback) +
    "</h2><p>Evaluation is deterministic and keyword-based in this prototype; it is not an AI model.</p><div class='result-stats'><span><strong>" +
    record.objectiveCorrect +
    "/" +
    record.questions.filter(function (q) {
      return q.type === "objective";
    }).length +
    "</strong> objective correct</span><span><strong>" +
    record.answers.filter(function (a) {
      return !a;
    }).length +
    "</strong> unanswered</span></div></div><div class='card'><span class='eyebrow'>Topic intelligence</span><h3>Strengths and gaps</h3>" +
    (topicScores.length
      ? topicScores
          .map(function (t) {
            return (
              "<div class='topic-score'><div><span>" +
              escapeHtml(t.topic) +
              "</span><strong>" +
              t.score +
              "%</strong></div><div class='progress-bar'><span style='width:" +
              t.score +
              "%'></span></div></div>"
            );
          })
          .join("")
      : "<p>Topic insights will appear after evaluation.</p>") +
    "<a class='button secondary' href='candidate.html'>Back to dashboard</a></div></section><section class='card answer-review'><div class='section-heading'><div><span class='eyebrow'>Detailed review</span><h2>Your responses</h2></div></div>" +
    record.questions
      .map(function (q, i) {
        var answer = record.answers[i] || "No answer provided";
        return (
          "<article class='answer-item'><div><span class='question-number'>0" +
          (i + 1) +
          "</span><strong>" +
          escapeHtml(q.prompt) +
          "</strong></div><p><b>Your answer:</b> " +
          escapeHtml(
            q.type === "objective" && q.options[Number(answer)]
              ? q.options[Number(answer)]
              : answer,
          ) +
          "</p>" +
          (q.type === "objective"
            ? "<p class='correct-answer'><b>Correct answer:</b> " +
              escapeHtml(q.options[q.correctIndex]) +
              "</p>"
            : "<p class='muted'><b>Heuristic rubric:</b> keyword coverage is used for this descriptive response.</p>") +
          "</article>"
        );
      })
      .join("") +
    "</section>";
})();
