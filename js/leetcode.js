(function () {
  var user = InterviewData.currentUser(),
    catalogue = window.LeetCodeCatalogue || [],
    records = InterviewData.getLeetCodeRecords(user.id),
    selectedProblem = null;
  var difficultyRank = { Easy: 1, Medium: 2, Hard: 3 };
  var byId = function (id) {
    return catalogue.find(function (problem) {
      return problem.id === id;
    });
  };
  var recordFor = function (id) {
    return (
      records.find(function (record) {
        return record.problemId === id;
      }) || { status: "Not Started", bookmarked: false }
    );
  };
  var problemUrl = function (problem) {
    return "https://leetcode.com/problems/" + problem.slug + "/";
  };
  function refreshRecords() {
    records = InterviewData.getLeetCodeRecords(user.id);
  }
  function notify(message, kind) {
    showNotice("leetcode-message", message, kind || "success");
  }
  function renderProfile() {
    var profile = InterviewData.getLeetCodeProfile(user.id),
      status = document.getElementById("profile-status"),
      description = document.getElementById("profile-description"),
      link = document.getElementById("profile-link"),
      input = document.getElementById("leetcode-username"),
      disconnect = document.getElementById("disconnect-profile");
    if (profile) {
      status.textContent = "Linked: " + profile.username;
      description.textContent =
        "Profile link saved locally. Ownership is not verified and live synchronization is not enabled.";
      link.href = profile.profileUrl;
      link.textContent = "Open " + profile.profileUrl;
      link.classList.remove("hidden");
      input.value = profile.username;
      disconnect.classList.remove("hidden");
    } else {
      status.textContent = "No profile linked";
      description.textContent =
        "Link your public username for a convenient profile shortcut. This does not verify ownership or sync live statistics.";
      link.classList.add("hidden");
      input.value = "";
      disconnect.classList.add("hidden");
    }
  }
  function renderMetrics() {
    var solved = records.filter(function (record) {
      return record.status === "Solved";
    });
    ["Easy", "Medium", "Hard"].forEach(function (difficulty) {
      document.getElementById(
        difficulty.toLowerCase() + "-solved",
      ).textContent = solved.filter(function (record) {
        var problem = byId(record.problemId);
        return problem && problem.difficulty === difficulty;
      }).length;
    });
    document.getElementById("total-solved").textContent = solved.length;
  }
  function renderTopics() {
    var topics = {};
    catalogue.forEach(function (problem) {
      problem.topics.forEach(function (topic) {
        topics[topic] = topics[topic] || { total: 0, solved: 0, practiced: 0 };
        topics[topic].total += 1;
        var record = recordFor(problem.id);
        if (record.status === "Solved") topics[topic].solved += 1;
        if (record.status !== "Not Started") topics[topic].practiced += 1;
      });
    });
    document.getElementById("topic-progress").innerHTML = Object.keys(topics)
      .sort()
      .map(function (topic) {
        var item = topics[topic],
          percent = Math.round((item.solved / item.total) * 100);
        return (
          "<div class='topic-score'><div><strong>" +
          escapeHtml(topic) +
          "</strong><span class='muted'>" +
          item.solved +
          "/" +
          item.total +
          " solved · " +
          item.practiced +
          " practiced</span></div><div class='progress-bar'><span style='width:" +
          percent +
          "%'></span></div></div>"
        );
      })
      .join("");
  }
  function renderWeekly() {
    var now = Date.now(),
      week = records.filter(function (record) {
        return (
          record.lastPracticed &&
          now - new Date(record.lastPracticed + "T23:59:59").getTime() <
            7 * 86400000
        );
      }),
      goals = InterviewData.getLeetCodeGoals(user.id),
      target = goals.weeklyTarget;
    document.getElementById("weekly-summary").innerHTML =
      "<strong>" +
      week.length +
      "/" +
      target +
      "</strong><span>problems recorded in the last 7 days · " +
      escapeHtml(goals.targetDifficulty) +
      " focus</span>";
    document.getElementById("weekly-activity").innerHTML = Array.from(
      { length: 7 },
      function (_, index) {
        var date = new Date(now - (6 - index) * 86400000),
          key = date.toISOString().slice(0, 10),
          count = records.filter(function (record) {
            return record.lastPracticed === key;
          }).length;
        return (
          "<span title='" +
          key +
          ": " +
          count +
          " record(s)' style='height:" +
          Math.max(12, Math.min(100, count * 32 + 12)) +
          "%'></span>"
        );
      },
    ).join("");
  }
  function renderLists() {
    var revision = records.filter(function (record) {
        return record.status === "Needs Revision";
      }),
      recent = records
        .filter(function (record) {
          return record.lastPracticed || record.updatedAt;
        })
        .sort(function (a, b) {
          return (
            new Date(b.lastPracticed || b.updatedAt) -
            new Date(a.lastPracticed || a.updatedAt)
          );
        })
        .slice(0, 5);
    document.getElementById("revision-count").textContent = revision.length;
    document.getElementById("revision-queue").innerHTML = revision.length
      ? revision
          .map(function (record) {
            var problem = byId(record.problemId);
            return (
              "<div class='application-card compact-record'><div><strong>" +
              escapeHtml(problem.title) +
              "</strong><span class='muted'>" +
              escapeHtml(problem.difficulty) +
              " · " +
              escapeHtml(record.approach || "Add an approach when revising") +
              "</span></div><button class='button secondary edit-problem' data-id='" +
              problem.id +
              "'>Update</button></div>"
            );
          })
          .join("")
      : "<div class='empty-state'><strong>Your revision queue is clear</strong><p>Mark a record as Needs Revision when you want to revisit it.</p></div>";
    document.getElementById("recent-activity").innerHTML = recent.length
      ? recent
          .map(function (record) {
            var problem = byId(record.problemId);
            return (
              "<div class='application-card compact-record'><div><strong>" +
              escapeHtml(problem.title) +
              "</strong><span class='muted'>" +
              escapeHtml(record.status) +
              " · " +
              formatDate(record.lastPracticed || record.updatedAt) +
              "</span></div><span class='status " +
              statusClass(record.status) +
              "'>Manual</span></div>"
            );
          })
          .join("")
      : "<div class='empty-state'><strong>No recorded practice yet</strong><p>Update a problem to start building your activity history.</p></div>";
    bindEditButtons();
  }
  function renderExplorer() {
    var search = (
        document.getElementById("problem-search").value || ""
      ).toLowerCase(),
      topic = document.getElementById("topic-filter").value,
      difficulty = document.getElementById("difficulty-filter").value,
      status = document.getElementById("status-filter").value,
      bookmarked = document.getElementById("bookmark-filter").checked,
      sort = document.getElementById("sort-filter").value;
    var items = catalogue.filter(function (problem) {
      var record = recordFor(problem.id);
      return (
        (!search ||
          (problem.title + " " + problem.number)
            .toLowerCase()
            .indexOf(search) >= 0) &&
        (!topic || problem.topics.indexOf(topic) >= 0) &&
        (!difficulty || problem.difficulty === difficulty) &&
        (!status || record.status === status) &&
        (!bookmarked || record.bookmarked)
      );
    });
    items.sort(function (a, b) {
      var ar = recordFor(a.id),
        br = recordFor(b.id);
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "difficulty")
        return (
          difficultyRank[a.difficulty] - difficultyRank[b.difficulty] ||
          a.number - b.number
        );
      if (sort === "recent")
        return (
          new Date(br.lastPracticed || 0) - new Date(ar.lastPracticed || 0)
        );
      return a.number - b.number;
    });
    document.getElementById("result-count").textContent =
      items.length + " problem(s)";
    document.getElementById("problem-list").innerHTML = items.length
      ? items
          .map(function (problem) {
            var record = recordFor(problem.id);
            return (
              "<tr><td><strong>#" +
              problem.number +
              " " +
              escapeHtml(problem.title) +
              "</strong></td><td><span class='status difficulty-" +
              problem.difficulty.toLowerCase() +
              "'>" +
              problem.difficulty +
              "</span></td><td><span class='problem-topics'>" +
              problem.topics.map(escapeHtml).join(", ") +
              "</span></td><td><span class='status " +
              statusClass(record.status) +
              "'>" +
              escapeHtml(record.status) +
              "</span></td><td>" +
              formatDate(record.lastPracticed) +
              "</td><td><button class='button secondary edit-problem' data-id='" +
              problem.id +
              "'>" +
              (record.bookmarked ? "★ " : "") +
              "Edit</button></td></tr>"
            );
          })
          .join("")
      : "<tr><td colspan='6'><div class='empty-state'><strong>No problems match</strong><p>Try a different filter.</p></div></td></tr>";
    bindEditButtons();
  }
  function bindEditButtons() {
    document.querySelectorAll(".edit-problem").forEach(function (button) {
      button.addEventListener("click", function () {
        openEditor(button.getAttribute("data-id"));
      });
    });
  }
  function openEditor(id) {
    selectedProblem = byId(id);
    var record = recordFor(id);
    document.getElementById("problem-editor").classList.remove("hidden");
    document.getElementById("editor-title").textContent =
      "#" + selectedProblem.number + " " + selectedProblem.title;
    document.getElementById("editor-problem-id").value = id;
    document.getElementById("editor-status").value = record.status;
    document.getElementById("editor-date").value = record.lastPracticed || "";
    document.getElementById("editor-bookmarked").checked = !!record.bookmarked;
    document.getElementById("editor-notes").value = record.notes || "";
    document.getElementById("editor-approach").value = record.approach || "";
    document.getElementById("editor-time").value = record.timeComplexity || "";
    document.getElementById("editor-space").value =
      record.spaceComplexity || "";
    document
      .getElementById("problem-editor")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function render() {
    refreshRecords();
    renderProfile();
    renderMetrics();
    renderTopics();
    renderWeekly();
    renderLists();
    renderExplorer();
  }
  catalogue.reduce(function (topics, problem) {
    problem.topics.forEach(function (topic) {
      topics[topic] = true;
    });
    return topics;
  }, {});
  Object.keys(
    catalogue.reduce(function (topics, problem) {
      problem.topics.forEach(function (topic) {
        topics[topic] = true;
      });
      return topics;
    }, {}),
  )
    .sort()
    .forEach(function (topic) {
      document
        .getElementById("topic-filter")
        .insertAdjacentHTML(
          "beforeend",
          "<option>" + escapeHtml(topic) + "</option>",
        );
    });
  document
    .getElementById("profile-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      var username = document.getElementById("leetcode-username").value.trim();
      if (!/^[A-Za-z0-9_-]{1,30}$/.test(username)) {
        notify(
          "Use 1-30 letters, numbers, underscores, or hyphens for the username.",
          "error",
        );
        return;
      }
      InterviewData.saveLeetCodeProfile(user.id, username);
      notify(
        "LeetCode profile link saved. Ownership and live statistics are not verified.",
      );
      renderProfile();
    });
  document
    .getElementById("disconnect-profile")
    .addEventListener("click", function () {
      InterviewData.removeLeetCodeProfile(user.id);
      notify("LeetCode profile link disconnected.");
      renderProfile();
    });
  document
    .getElementById("problem-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      var id = document.getElementById("editor-problem-id").value,
        status = document.getElementById("editor-status").value,
        date = document.getElementById("editor-date").value;
      if (status !== "Not Started" && !date) {
        notify(
          "Add a practice date for an attempted or solved record.",
          "error",
        );
        return;
      }
      InterviewData.saveLeetCodeRecord(user.id, id, {
        status: status,
        lastPracticed: date,
        bookmarked: document.getElementById("editor-bookmarked").checked,
        notes: document.getElementById("editor-notes").value.trim(),
        approach: document.getElementById("editor-approach").value.trim(),
        timeComplexity: document.getElementById("editor-time").value.trim(),
        spaceComplexity: document.getElementById("editor-space").value.trim(),
      });
      notify("Manual record saved. This is not independently verified.");
      render();
    });
  document
    .getElementById("close-editor")
    .addEventListener("click", function () {
      document.getElementById("problem-editor").classList.add("hidden");
    });
  document
    .getElementById("open-problem")
    .addEventListener("click", function () {
      if (selectedProblem)
        window.open(
          problemUrl(selectedProblem),
          "_blank",
          "noopener,noreferrer",
        );
    });
  document
    .getElementById("leetcode-goal-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      InterviewData.saveLeetCodeGoals(user.id, {
        weeklyTarget: document.getElementById("weekly-target").value,
        targetDifficulty: document.getElementById("target-difficulty").value,
      });
      notify("LeetCode preparation goal saved.");
      renderWeekly();
    });
  var goals = InterviewData.getLeetCodeGoals(user.id);
  document.getElementById("weekly-target").value = goals.weeklyTarget;
  document.getElementById("target-difficulty").value = goals.targetDifficulty;
  [
    "problem-search",
    "topic-filter",
    "difficulty-filter",
    "status-filter",
    "sort-filter",
    "bookmark-filter",
  ].forEach(function (id) {
    document.getElementById(id).addEventListener("input", renderExplorer);
    document.getElementById(id).addEventListener("change", renderExplorer);
  });
  render();
})();
