(function () {
  var session = InterviewData.getSession();
  var questions = [];
  var index = 0;
  var answers = [];
  var scores = [];
  var question = document.getElementById("ai-question");
  var transcript = document.getElementById("ai-transcript");
  var answer = document.getElementById("ai-answer");
  var submit = document.getElementById("ai-submit");
  var result = document.getElementById("ai-result");

  function scoreAnswer(item, response) {
    if (!response) return 0;
    if (item.type === "objective") return response.length >= 12 ? 70 : 45;
    var hits = (item.keywords || []).filter(function (keyword) {
      return response.toLowerCase().indexOf(keyword.toLowerCase()) >= 0;
    }).length;
    return Math.min(
      100,
      Math.round((hits / Math.max(3, item.keywords.length)) * 100),
    );
  }

  function followUp(item, score) {
    if (score >= 75) {
      return {
        id: item.id + "-deep",
        prompt:
          "Strong start. Explain one practical trade-off or edge case related to " +
          item.topic +
          ".",
        type: "descriptive",
        keywords: item.keywords,
      };
    }
    if (score >= 40) {
      return {
        id: item.id + "-clarify",
        prompt:
          "Your answer has a useful idea. Which important detail would you add to make your explanation of " +
          item.topic +
          " complete?",
        type: "descriptive",
        keywords: item.keywords,
      };
    }
    return {
      id: item.id + "-diagnostic",
      prompt:
        "Let's approach " +
        item.topic +
        " step by step. What is the basic definition or purpose of this concept?",
      type: "descriptive",
      keywords: item.keywords,
    };
  }

  function render() {
    var item = questions[index];
    question.textContent = item.prompt;
    transcript.textContent =
      "Question " +
      (index + 1) +
      " of " +
      questions.length +
      " · Rule-based adaptive demo";
    answer.value = answers[index] || "";
    answer.disabled = false;
    result.innerHTML = "";
  }

  function start() {
    var role = document.getElementById("ai-role").value;
    questions = InterviewData.getQuestions(role, "Mixed").slice(0, 2);
    index = 0;
    answers = [];
    scores = [];
    if (!questions.length) {
      question.textContent =
        "No questions are available for this configuration.";
      submit.disabled = true;
      return;
    }
    render();
    submit.disabled = false;
    document.getElementById("ai-start").textContent = "Restart session";
  }

  document.getElementById("ai-start").addEventListener("click", start);
  submit.addEventListener("click", function () {
    if (!questions.length) return;
    var response = answer.value.trim();
    answers[index] = response;
    scores[index] = scoreAnswer(questions[index], response);
    if (index === questions.length - 1) {
      var average = Math.round(
        scores.reduce(function (sum, value) {
          return sum + value;
        }, 0) / scores.length,
      );
      var topic = document.getElementById("ai-topic").value;
      InterviewData.savePractice({
        candidateId: session.id,
        activityType: "AI interview practice",
        topic: topic,
        difficulty: "Configured demo",
        score: average,
        evidence:
          "Adaptive text responses; deterministic keyword and completeness rubric",
        responseScores: scores,
      });
      question.textContent = "Session complete";
      transcript.textContent =
        "The simulated interviewer saved this result to your feedback history.";
      answer.value = "";
      answer.disabled = true;
      submit.disabled = true;
      result.innerHTML =
        "<div class='notice'>Practice score: " +
        average +
        "%. " +
        (average >= 70
          ? "Try a harder topic or continue with an advanced follow-up."
          : "Review this topic in the Preparation Center and try again.") +
        "</div>";
      return;
    }
    var next = followUp(questions[index], scores[index]);
    questions.splice(index + 1, 0, next);
    index++;
    render();
  });
})();
