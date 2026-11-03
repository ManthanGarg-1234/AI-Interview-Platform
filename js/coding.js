(function () {
  var api = "http://127.0.0.1:3000/api",
    user = InterviewData.currentUser(),
    problems = [],
    selected = null,
    submissions = [],
    busy = false;
  var $ = function (id) {
    return document.getElementById(id);
  };
  function message(text, kind) {
    showNotice("coding-message", text, kind || "success");
  }
  function headers() {
    return { "content-type": "application/json", "x-demo-user-id": user.id };
  }
  function request(path, options) {
    return fetch(api + path, options).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok)
          throw new Error(body.error || "Coding service request failed.");
        return body;
      });
    });
  }
  function renderProblems() {
    var term = ($("coding-search").value || "").toLowerCase();
    $("coding-problem-list").innerHTML =
      problems
        .filter(function (problem) {
          return (
            !term ||
            (problem.title + " " + problem.topics.join(" "))
              .toLowerCase()
              .indexOf(term) >= 0
          );
        })
        .map(function (problem) {
          return (
            "<button class='coding-problem " +
            (selected && selected.id === problem.id ? "selected" : "") +
            "' data-id='" +
            problem.id +
            "'><strong>" +
            escapeHtml(problem.title) +
            "</strong><span class='status difficulty-" +
            problem.difficulty.toLowerCase() +
            "'>" +
            problem.difficulty +
            "</span><small>" +
            escapeHtml(problem.topics.join(" · ")) +
            "</small></button>"
          );
        })
        .join("") ||
      "<div class='empty-state'><strong>No matching problems</strong></div>";
    document.querySelectorAll(".coding-problem").forEach(function (button) {
      button.addEventListener("click", function () {
        selectProblem(button.dataset.id);
      });
    });
  }
  function renderHistory() {
    var items = submissions
      .filter(function (item) {
        return !selected || item.problemId === selected.id;
      })
      .slice()
      .reverse();
    $("submission-history").innerHTML = items.length
      ? "<table><thead><tr><th>Type</th><th>Verdict</th><th>Tests</th><th>Date</th></tr></thead><tbody>" +
        items
          .map(function (item) {
            return (
              "<tr><td>" +
              item.type +
              "</td><td><span class='status " +
              statusClass(item.verdict) +
              "'>" +
              escapeHtml(item.verdict) +
              "</span></td><td>" +
              (item.passedTests == null
                ? "—"
                : item.passedTests + "/" + item.totalTests) +
              "</td><td>" +
              formatDate(item.createdAt) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table>"
      : "<div class='empty-state'><strong>No submissions yet</strong><p>Your actual judge results will appear here.</p></div>";
  }
  function selectProblem(id) {
    selected = problems.find(function (problem) {
      return problem.id === id;
    });
    if (!selected) return;
    $("coding-title").textContent = selected.title;
    $("coding-difficulty").textContent =
      selected.difficulty + " · " + selected.format;
    $("coding-topics").innerHTML = selected.topics
      .map(function (topic) {
        return "<span>" + escapeHtml(topic) + "</span>";
      })
      .join("");
    $("coding-description").textContent = selected.description;
    $("coding-examples").innerHTML =
      "<h3>Examples</h3>" +
      selected.examples
        .map(function (example) {
          return (
            "<pre>Input:\n" +
            escapeHtml(example.input) +
            "\nOutput:\n" +
            escapeHtml(example.output) +
            "</pre>"
          );
        })
        .join("");
    $("coding-constraints").innerHTML =
      "<h3>Constraints</h3><ul>" +
      selected.constraints
        .map(function (constraint) {
          return "<li>" + escapeHtml(constraint) + "</li>";
        })
        .join("") +
      "</ul>";
    $("source-code").value =
      localStorage.getItem("coding-draft-" + selected.id) ||
      selected.starterCode;
    ["source-code", "custom-input"].forEach(function (id) {
      $(id).disabled = false;
    });
    ["run-code", "submit-code", "reset-code"].forEach(function (id) {
      $(id).disabled = false;
    });
    renderProblems();
    renderHistory();
  }
  function execute(type) {
    if (!selected || busy) return;
    busy = true;
    $("run-code").disabled = true;
    $("submit-code").disabled = true;
    $("execution-status").textContent = "Processing…";
    $("execution-output").textContent =
      "Sending code to the server-side judge…";
    var key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    request("/submissions/" + type, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        problemId: selected.id,
        sourceCode: $("source-code").value,
        input: $("custom-input").value,
        idempotencyKey: key,
      }),
    })
      .then(function (body) {
        var result = body.data;
        submissions.push(result);
        $("execution-status").textContent = result.verdict;
        $("execution-meta").textContent =
          result.passedTests == null
            ? ""
            : result.passedTests + "/" + result.totalTests + " tests";
        $("execution-output").textContent =
          result.errorSummary || "Judge completed without an error message.";
        renderHistory();
      })
      .catch(function (error) {
        $("execution-status").textContent = "Judge unavailable";
        $("execution-output").textContent = error.message;
        message(error.message, "error");
      })
      .finally(function () {
        busy = false;
        $("run-code").disabled = false;
        $("submit-code").disabled = false;
      });
  }
  $("coding-search").addEventListener("input", renderProblems);
  $("run-code").addEventListener("click", function () {
    execute("run");
  });
  $("submit-code").addEventListener("click", function () {
    execute("submit");
  });
  $("reset-code").addEventListener("click", function () {
    if (selected) {
      $("source-code").value = selected.starterCode;
      localStorage.removeItem("coding-draft-" + selected.id);
    }
  });
  $("source-code").addEventListener("input", function () {
    if (selected)
      localStorage.setItem(
        "coding-draft-" + selected.id,
        $("source-code").value,
      );
  });
  $("source-code").addEventListener("keydown", function (event) {
    if (event.key === "Tab") {
      event.preventDefault();
      var start = this.selectionStart;
      this.value =
        this.value.slice(0, start) +
        "    " +
        this.value.slice(this.selectionEnd);
      this.selectionStart = this.selectionEnd = start + 4;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      execute("run");
    }
  });
  request("/problems")
    .then(function (body) {
      problems = body.data;
      renderProblems();
      return request("/users/me/submissions", { headers: headers() });
    })
    .then(function (body) {
      submissions = body.data;
      renderHistory();
    })
    .catch(function (error) {
      message(
        error.message + " Start the coding API before using the workspace.",
        "error",
      );
    });
})();
