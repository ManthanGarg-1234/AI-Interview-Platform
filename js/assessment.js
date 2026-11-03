(function () {
  var user = InterviewData.currentUser(),
    topic = new URLSearchParams(window.location.search).get("topic") || "DSA",
    bank = InterviewData.quizBank[topic] || InterviewData.quizBank.DSA,
    index = 0,
    answers = new Array(bank.length).fill(""),
    submitted = false;
  var question = document.getElementById("assessment-question"),
    options = document.getElementById("assessment-options");
  document.getElementById("assessment-title").textContent =
    topic + " assessment";
  function render() {
    var item = bank[index];
    document.getElementById("assessment-progress").textContent =
      "Question " + (index + 1) + " of " + bank.length;
    document.getElementById("assessment-fill").style.width =
      ((index + 1) / bank.length) * 100 + "%";
    question.innerHTML =
      "<h2>" +
      escapeHtml(item[0]) +
      "</h2><p class='muted'>" +
      escapeHtml(item[5]) +
      "</p>";
    options.innerHTML = item[1]
      .map(function (option, i) {
        return (
          "<label class='answer-option'><input type='radio' name='quiz-answer' value='" +
          i +
          "' " +
          (String(answers[index]) === String(i) ? "checked" : "") +
          "><span class='option-key'>" +
          String.fromCharCode(65 + i) +
          "</span><span>" +
          escapeHtml(option) +
          "</span></label>"
        );
      })
      .join("");
    document.getElementById("assessment-prev").disabled = index === 0;
    document
      .getElementById("assessment-next")
      .classList.toggle("hidden", index === bank.length - 1);
    document
      .getElementById("assessment-submit")
      .classList.toggle("hidden", index !== bank.length - 1);
  }
  function capture() {
    var selected = document.querySelector("input[name=quiz-answer]:checked");
    answers[index] = selected ? selected.value : "";
  }
  document
    .getElementById("assessment-prev")
    .addEventListener("click", function () {
      capture();
      index--;
      render();
    });
  document
    .getElementById("assessment-next")
    .addEventListener("click", function () {
      capture();
      index++;
      render();
    });
  document
    .getElementById("assessment-submit")
    .addEventListener("click", function () {
      if (submitted) return;
      capture();
      var correct = answers.reduce(function (total, answer, i) {
          return total + (String(bank[i][3]) === String(answer) ? 1 : 0);
        }, 0),
        score = Math.round((correct / bank.length) * 100);
      submitted = true;
      InterviewData.savePractice({
        candidateId: user.id,
        activityType: "Topic assessment",
        topic: topic,
        difficulty: "Foundations",
        score: score,
        correct: correct,
        total: bank.length,
        evidence: "Objective quiz result",
      });
      document.getElementById("assessment-result").innerHTML =
        "<div class='notice'>Assessment complete: " +
        correct +
        "/" +
        bank.length +
        " correct (" +
        score +
        "%). Explanation: results are stored as objective practice evidence.</div>";
      document.getElementById("assessment-submit").disabled = true;
    });
  render();
})();
