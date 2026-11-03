(function () {
  var session = InterviewData.getSession();
  var records = InterviewData.getInterviews().filter(function (r) {
    return r.candidateId === session.id && r.status === "Submitted";
  });
  var goals = InterviewData.getGoals();
  document.getElementById("welcome-title").textContent =
    "Good morning, " + session.name.split(" ")[0];
  document.getElementById("attempted-count").textContent = records.length;
  document.getElementById("average-score").textContent = records.length
    ? Math.round(
        records.reduce(function (a, r) {
          return a + r.percentage;
        }, 0) / records.length,
      ) + "%"
    : "—";
  document.getElementById("latest-status").textContent = records[0]
    ? records[0].recruiterDecision
    : "No attempts";
  var completedThisWeek = records.filter(function (r) {
    return new Date(r.submittedAt) >= new Date(Date.now() - 7 * 86400000);
  }).length;
  var goalProgress = document.getElementById("goal-progress");
  if (goalProgress) {
    goalProgress.textContent = completedThisWeek + "/" + goals.weeklyGoal;
    document.getElementById("goal-fill").style.width =
      Math.min(
        100,
        Math.round((completedThisWeek / Math.max(1, goals.weeklyGoal)) * 100),
      ) + "%";
  }
  document.getElementById("candidate-history").innerHTML = records.length
    ? "<div class='table-wrap'><table><thead><tr><th>Role</th><th>Difficulty</th><th>Score</th><th>Date</th><th>Decision</th><th></th></tr></thead><tbody>" +
      records
        .slice()
        .reverse()
        .map(function (r) {
          return (
            "<tr><td><strong>" +
            escapeHtml(r.role) +
            "</strong></td><td>" +
            r.difficulty +
            "</td><td><strong>" +
            r.percentage +
            "%</strong></td><td>" +
            formatDate(r.submittedAt) +
            "</td><td><span class='status " +
            statusClass(r.recruiterDecision) +
            "'>" +
            r.recruiterDecision +
            "</span></td><td><a class='text-link' href='result.html?id=" +
            r.id +
            "'>View result →</a></td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    : "<div class='empty-state'><span>▣</span><strong>No completed interviews yet</strong><p>Your completed interviews will appear here.</p></div>";
  document
    .getElementById("setup-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      var role = document.getElementById("job-role").value;
      var difficulty = document.querySelector("input[name=difficulty]:checked");
      var mode = document.getElementById("interview-mode").value;
      var category = document.getElementById("interview-category").value;
      var count = Number(
        document.getElementById("question-count-select").value,
      );
      var duration = Number(document.getElementById("duration-select").value);
      if (!role || !difficulty) {
        showNotice(
          "candidate-message",
          "Choose a role and difficulty before starting.",
          "error",
        );
        return;
      }
      try {
        var record = InterviewData.createInterview(
          role,
          difficulty.value,
          session,
          { mode: mode, category: category, count: count, duration: duration },
        );
        InterviewData.setDraft({
          id: record.id,
          current: 0,
          answers: record.answers,
          marked: [],
        });
        window.location.href = "interview.html?id=" + record.id;
      } catch (error) {
        showNotice("candidate-message", error.message, "error");
      }
    });
  var goalForm = document.getElementById("goal-form");
  if (goalForm)
    goalForm.addEventListener("submit", function (event) {
      event.preventDefault();
      InterviewData.setGoals({
        targetScore: Number(document.getElementById("target-score").value),
        weeklyGoal: Number(document.getElementById("weekly-goal").value),
        completedTasks: goals.completedTasks || [],
      });
      showNotice("candidate-message", "Preparation goals saved.", "success");
    });
  var jobSearch = document.getElementById("job-search");
  function renderJobs() {
    var term = (jobSearch.value || "").toLowerCase(),
      applications = InterviewData.getApplications().filter(function (a) {
        return a.candidateId === session.id;
      });
    document.getElementById("jobs-list").innerHTML =
      InterviewData.getJobs()
        .filter(function (j) {
          return (
            j.status === "Published" &&
            (!term ||
              (j.title + " " + j.company + " " + j.role)
                .toLowerCase()
                .indexOf(term) >= 0)
          );
        })
        .map(function (job) {
          var applied = applications.some(function (a) {
            return a.jobId === job.id;
          });
          return (
            "<article class='job-card'><div class='job-card-head'><span class='metric-icon purple'>↗</span><span class='status published'>" +
            job.status +
            "</span></div><h3>" +
            escapeHtml(job.title) +
            "</h3><p class='muted'>" +
            escapeHtml(job.company) +
            " · " +
            escapeHtml(job.location) +
            "</p><p>" +
            escapeHtml(job.description) +
            "</p><div class='skill-list'>" +
            job.requiredSkills
              .map(function (skill) {
                return "<span>" + escapeHtml(skill) + "</span>";
              })
              .join("") +
            "</div><button class='button " +
            (applied ? "secondary" : "primary") +
            " full apply-job' data-job='" +
            job.id +
            "' " +
            (applied ? "disabled" : "") +
            ">" +
            (applied ? "Application submitted" : "Apply to role") +
            "</button></article>"
          );
        })
        .join("") ||
      "<div class='empty-state'><strong>No published jobs match</strong><p>Recruiter job postings will appear here.</p></div>";
    document.querySelectorAll(".apply-job").forEach(function (button) {
      button.addEventListener("click", function () {
        var job = InterviewData.getJobs().find(function (item) {
          return item.id === button.getAttribute("data-job");
        });
        if (job && InterviewData.addApplication(job, session)) {
          showNotice(
            "candidate-message",
            "Application submitted. Your recruiter tracker is now active.",
            "success",
          );
          renderJobs();
          renderApplications();
        }
      });
    });
  }
  function renderApplications() {
    var applications = InterviewData.getApplications().filter(function (a) {
      return a.candidateId === session.id;
    });
    document.getElementById("applications-list").innerHTML = applications.length
      ? "<div class='application-cards'>" +
        applications
          .slice()
          .reverse()
          .map(function (a) {
            return (
              "<article class='application-card'><div><strong>" +
              escapeHtml(a.jobTitle) +
              "</strong><span class='muted'>" +
              escapeHtml(a.company) +
              "</span></div><span class='status " +
              statusClass(a.status) +
              "'>" +
              escapeHtml(a.status) +
              "</span><div class='pipeline'><span class='active'>" +
              escapeHtml(a.currentStage) +
              "</span><small>Applied " +
              formatDate(a.createdAt) +
              "</small></div></article>"
            );
          })
          .join("") +
        "</div>"
      : "<div class='empty-state'><strong>No applications yet</strong><p>Compare your skills with a demo role and apply when ready.</p></div>";
  }
  if (jobSearch) {
    jobSearch.addEventListener("input", renderJobs);
    renderJobs();
    renderApplications();
  }
  var scheduled = InterviewData.getScheduled().filter(function (item) {
    return item.candidateId === session.id;
  });
  var upcoming = document.getElementById("upcoming-interviews");
  if (upcoming)
    upcoming.innerHTML = scheduled.length
      ? "<div class='application-cards'>" +
        scheduled
          .slice()
          .reverse()
          .map(function (item) {
            return (
              "<article class='application-card'><div><strong>" +
              escapeHtml(item.title) +
              "</strong><span class='muted'>" +
              escapeHtml(item.jobTitle) +
              " · " +
              escapeHtml(item.type) +
              "</span></div><span class='status " +
              statusClass(item.status) +
              "'>" +
              item.status +
              "</span><div class='pipeline'><span>" +
              new Date(item.scheduledAt).toLocaleString() +
              " · " +
              item.duration +
              " min</span><a class='text-link' href='lobby.html?id=" +
              item.id +
              "'>Open details →</a></div></article>"
            );
          })
          .join("") +
        "</div>"
      : "<div class='empty-state'><strong>No recruiter interviews scheduled</strong><p>Scheduled interviews will appear here when a recruiter creates one.</p></div>";
})();
