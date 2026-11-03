(function () {
  var id = new URLSearchParams(window.location.search).get("id"),
    record = InterviewData.getInterview(id),
    draft = InterviewData.getDraft(),
    index = draft && draft.id === id ? draft.current : 0,
    answers =
      draft && draft.id === id ? draft.answers : record && record.answers,
    marked =
      draft && draft.id === id
        ? draft.marked || []
        : (record && record.marked) || [];
  if (!record || record.status === "Submitted") {
    window.location.href = record ? "result.html?id=" + id : "candidate.html";
    return;
  }
  var timerSeconds = record.duration * 60,
    timerNode = document.getElementById("timer"),
    content = document.getElementById("question-content");
  document.getElementById("interview-role").textContent = record.role;
  document.getElementById("interview-difficulty").textContent =
    record.difficulty + " difficulty";
  function save() {
    InterviewData.setDraft({
      id: id,
      current: index,
      answers: answers,
      marked: marked,
    });
    InterviewData.updateInterview(id, { answers: answers, marked: marked });
  }
  function render() {
    var q = record.questions[index],
      bookmarks = InterviewData.getBookmarks();
    document.getElementById("question-count").textContent =
      "Question " + (index + 1) + " of " + record.questions.length;
    document.getElementById("progress-percent").textContent =
      Math.round(((index + 1) / record.questions.length) * 100) + "%";
    document.getElementById("progress-fill").style.width =
      ((index + 1) / record.questions.length) * 100 + "%";
    content.innerHTML =
      "<div class='question-meta'><span class='eyebrow'>" +
      (q.type === "objective" ? "Multiple choice" : "Written response") +
      "</span><span class='topic-tag'>" +
      escapeHtml(q.topic) +
      "</span></div><h2>" +
      escapeHtml(q.prompt) +
      "</h2>" +
      (q.type === "objective"
        ? "<div class='answer-options'>" +
          q.options
            .map(function (option, i) {
              return (
                "<label class='answer-option'><input type='radio' name='answer' value='" +
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
            .join("") +
          "</div>"
        : "<textarea id='written-answer' maxlength='1000' rows='8' placeholder='Write your answer here...'>" +
          escapeHtml(answers[index]) +
          "</textarea><small class='char-count' id='char-count'>" +
          String(answers[index] || "").length +
          "/1000</small>");
    document.getElementById("previous-button").disabled = index === 0;
    document
      .getElementById("next-button")
      .classList.toggle("hidden", index === record.questions.length - 1);
    document
      .getElementById("submit-button")
      .classList.toggle("hidden", index !== record.questions.length - 1);
    document.getElementById("mark-button").textContent =
      marked.indexOf(q.id) >= 0 ? "★ Marked" : "☆ Mark for review";
    document.getElementById("bookmark-button").textContent =
      bookmarks.indexOf(q.id) >= 0 ? "★ Saved" : "☆ Bookmark";
    document.getElementById("question-palette").innerHTML = record.questions
      .map(function (item, i) {
        return (
          "<button class='palette-button " +
          (answers[i] ? "answered " : "") +
          (marked.indexOf(item.id) >= 0 ? "marked " : "") +
          (i === index ? "current" : "") +
          "' data-index='" +
          i +
          "'>" +
          (i + 1) +
          "</button>"
        );
      })
      .join("");
    if (document.getElementById("written-answer"))
      document
        .getElementById("written-answer")
        .addEventListener("input", function () {
          document.getElementById("char-count").textContent =
            this.value.length + "/1000";
        });
    document.querySelectorAll("[data-index]").forEach(function (button) {
      button.addEventListener("click", function () {
        capture();
        index = Number(button.getAttribute("data-index"));
        render();
      });
    });
  }
  function capture() {
    var selected = document.querySelector("input[name=answer]:checked"),
      written = document.getElementById("written-answer");
    if (selected) answers[index] = selected.value;
    else if (written) answers[index] = written.value.trim();
    save();
  }
  function submit(expired) {
    capture();
    if (
      !expired &&
      !window.confirm(
        "Submit this interview? You will not be able to change your answers afterwards.",
      )
    )
      return;
    var result = InterviewEvaluation.evaluate(record, answers);
    InterviewData.updateInterview(id, {
      answers: answers,
      score: result.score,
      percentage: result.percentage,
      objectiveCorrect: result.objectiveCorrect,
      feedback: result.feedback,
      topicScores: result.topicScores,
      status: "Submitted",
      submittedAt: new Date().toISOString(),
    });
    InterviewData.clearDraft();
    window.location.href = "result.html?id=" + id;
  }
  document
    .getElementById("previous-button")
    .addEventListener("click", function () {
      capture();
      index--;
      render();
    });
  document.getElementById("next-button").addEventListener("click", function () {
    capture();
    index++;
    render();
  });
  document.getElementById("mark-button").addEventListener("click", function () {
    capture();
    var markIndex = marked.indexOf(record.questions[index].id);
    if (markIndex >= 0) marked.splice(markIndex, 1);
    else marked.push(record.questions[index].id);
    save();
    render();
  });
  document
    .getElementById("bookmark-button")
    .addEventListener("click", function () {
      var bookmarks = InterviewData.getBookmarks(),
        qid = record.questions[index].id,
        bookmarkIndex = bookmarks.indexOf(qid);
      if (bookmarkIndex >= 0) bookmarks.splice(bookmarkIndex, 1);
      else bookmarks.push(qid);
      InterviewData.setBookmarks(bookmarks);
      render();
    });
  document
    .getElementById("submit-button")
    .addEventListener("click", function () {
      submit(false);
    });
  var interval = setInterval(function () {
    timerSeconds--;
    var minutes = Math.floor(timerSeconds / 60),
      seconds = timerSeconds % 60;
    timerNode.textContent = minutes + ":" + String(seconds).padStart(2, "0");
    if (timerSeconds <= 0) {
      clearInterval(interval);
      submit(true);
    }
  }, 1000);
  window.addEventListener("beforeunload", capture);
  render();
})();
