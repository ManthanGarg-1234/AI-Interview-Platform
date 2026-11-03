(function () {
  var details = document.getElementById("details-content");
  function renderApplications() {
    var term = (
        document.getElementById("search-input").value || ""
      ).toLowerCase(),
      filter = document.getElementById("status-filter").value,
      apps = InterviewData.getApplications().filter(function (a) {
        return (
          (!filter || a.status === filter || a.currentStage === filter) &&
          (!term ||
            (a.candidateName + " " + a.role + " " + a.jobTitle)
              .toLowerCase()
              .indexOf(term) >= 0)
        );
      });
    document.getElementById("applications-table").innerHTML = apps.length
      ? "<div class='table-wrap'><table><thead><tr><th>Candidate</th><th>Job</th><th>Stage</th><th>Applied</th><th>Action</th></tr></thead><tbody>" +
        apps
          .slice()
          .reverse()
          .map(function (a) {
            return (
              "<tr><td><strong>" +
              escapeHtml(a.candidateName) +
              "</strong></td><td>" +
              escapeHtml(a.jobTitle) +
              "</td><td><span class='status " +
              statusClass(a.status) +
              "'>" +
              escapeHtml(a.status) +
              "</span><small class='table-subtitle'>" +
              escapeHtml(a.currentStage) +
              "</small></td><td>" +
              formatDate(a.createdAt) +
              "</td><td><select class='stage-select' data-app='" +
              a.id +
              "'><option>Applied</option><option>Under Review</option><option>Assessment</option><option>Interview</option><option>Shortlisted</option><option>Rejected</option></select></td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : "<div class='empty-state'><strong>No applications yet</strong><p>Applications from the student portal will appear here.</p></div>";
    document.querySelectorAll(".stage-select").forEach(function (select) {
      var app = apps.find(function (a) {
        return a.id === select.getAttribute("data-app");
      });
      select.value = app.status;
      select.addEventListener("change", function () {
        InterviewData.updateApplication(app.id, {
          status: select.value,
          currentStage: select.value,
        });
        renderApplications();
      });
    });
  }
  function renderScheduled() {
    var select = document.getElementById("schedule-candidate");
    if (!select) return;
    var apps = InterviewData.getApplications();
    select.innerHTML =
      "<option value=''>Select candidate application</option>" +
      apps
        .map(function (a) {
          return (
            "<option value='" +
            a.candidateId +
            "'>" +
            escapeHtml(a.candidateName + " · " + a.jobTitle) +
            "</option>"
          );
        })
        .join("");
    var records = InterviewData.getScheduled();
    document.getElementById("scheduled-table").innerHTML = records.length
      ? "<div class='table-wrap'><table><thead><tr><th>Candidate</th><th>Interview</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>" +
        records
          .slice()
          .reverse()
          .map(function (r) {
            return (
              "<tr><td><strong>" +
              escapeHtml(r.candidateName) +
              "</strong></td><td>" +
              escapeHtml(r.title) +
              "<small class='table-subtitle'>" +
              escapeHtml(r.type) +
              " · " +
              r.duration +
              " min</small></td><td>" +
              new Date(r.scheduledAt).toLocaleString() +
              "</td><td><span class='status " +
              statusClass(r.status) +
              "'>" +
              r.status +
              "</span></td><td><button class='button danger cancel-schedule' data-id='" +
              r.id +
              "'>Cancel</button></td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : "<div class='empty-state'><strong>No shared interviews scheduled</strong><p>Schedule a meeting and it will appear in the student portal.</p></div>";
    document.querySelectorAll(".cancel-schedule").forEach(function (button) {
      button.addEventListener("click", function () {
        if (window.confirm("Cancel this interview?")) {
          InterviewData.updateScheduled(button.getAttribute("data-id"), {
            status: "Cancelled",
          });
          renderScheduled();
        }
      });
    });
  }
  function metrics() {
    var submitted = InterviewData.getInterviews().filter(function (r) {
        return r.status === "Submitted";
      }),
      apps = InterviewData.getApplications();
    document.getElementById("total-submitted").textContent = submitted.length;
    document.getElementById("pending-reviews").textContent =
      apps.filter(function (a) {
        return a.status === "Applied" || a.status === "Under Review";
      }).length +
      submitted.filter(function (r) {
        return r.recruiterDecision === "Pending";
      }).length;
    document.getElementById("shortlisted-count").textContent =
      apps.filter(function (a) {
        return a.status === "Shortlisted";
      }).length +
      submitted.filter(function (r) {
        return r.recruiterDecision === "Shortlisted";
      }).length;
    document.getElementById("rejected-count").textContent =
      apps.filter(function (a) {
        return a.status === "Rejected";
      }).length +
      submitted.filter(function (r) {
        return r.recruiterDecision === "Rejected";
      }).length;
  }
  if (details) {
    var record = InterviewData.getInterview(
      new URLSearchParams(window.location.search).get("id"),
    );
    if (!record) {
      details.innerHTML =
        "<div class='card empty-state'><strong>Interview not found</strong><a class='button primary' href='recruiter.html'>Back to submissions</a></div>";
      return;
    }
    details.innerHTML =
      "<section class='result-hero'><div><span class='eyebrow'>Candidate submission</span><h2>" +
      escapeHtml(record.candidateName) +
      "</h2><p>" +
      escapeHtml(record.role) +
      " · " +
      record.difficulty +
      " difficulty · Submitted " +
      formatDate(record.submittedAt) +
      "</p></div><div class='score-ring'><strong>" +
      record.percentage +
      "%</strong><span>Score</span></div></section><section class='card decision-card'><div><span class='eyebrow'>Recruiter decision</span><h2>Review outcome</h2><p>System feedback: " +
      escapeHtml(record.feedback) +
      "</p></div><div class='decision-actions'><button class='button success' data-decision='Shortlisted'>✓ Shortlist</button><button class='button danger' data-decision='Rejected'>× Reject</button><span class='status " +
      statusClass(record.recruiterDecision) +
      "'>" +
      record.recruiterDecision +
      "</span></div></section><section class='card answer-review'><div class='section-heading'><div><span class='eyebrow'>Response review</span><h2>Questions and answers</h2></div></div>" +
      record.questions
        .map(function (q, i) {
          var answer = record.answers[i] || "No answer provided";
          return (
            "<article class='answer-item'><div><span class='question-number'>0" +
            (i + 1) +
            "</span><strong>" +
            escapeHtml(q.prompt) +
            "</strong></div><p><b>Candidate answer:</b> " +
            escapeHtml(
              q.type === "objective" && q.options[Number(answer)]
                ? q.options[Number(answer)]
                : answer,
            ) +
            "</p></article>"
          );
        })
        .join("") +
      "</section>";
    document.querySelectorAll("[data-decision]").forEach(function (button) {
      button.addEventListener("click", function () {
        var decision = button.getAttribute("data-decision");
        if (window.confirm("Mark this candidate as " + decision + "?")) {
          InterviewData.updateInterview(record.id, {
            recruiterDecision: decision,
          });
          window.location.reload();
        }
      });
    });
  } else {
    metrics();
    renderApplications();
    renderScheduled();
    document
      .getElementById("search-input")
      .addEventListener("input", renderApplications);
    document
      .getElementById("status-filter")
      .addEventListener("change", renderApplications);
    document
      .getElementById("job-form")
      .addEventListener("submit", function (event) {
        event.preventDefault();
        InterviewData.saveJob({
          id: "job-" + Date.now().toString(36),
          title: document.getElementById("new-job-title").value.trim(),
          company: document.getElementById("new-job-company").value.trim(),
          role: document.getElementById("new-job-role").value,
          description: "A new demo opportunity published by the recruiter.",
          requiredSkills: document
            .getElementById("new-job-skills")
            .value.split(",")
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean),
          location: "Remote",
          type: "Full-time",
          status: "Published",
          stages: [
            "Application review",
            "Assessment",
            "Interview",
            "Final decision",
          ],
          createdAt: new Date().toISOString(),
        });
        event.target.reset();
        renderJobs();
      });
    function renderJobs() {
      document.getElementById("recruiter-jobs").innerHTML =
        InterviewData.getJobs()
          .map(function (job) {
            return (
              "<article class='job-card'><span class='status published'>" +
              job.status +
              "</span><h3>" +
              escapeHtml(job.title) +
              "</h3><p class='muted'>" +
              escapeHtml(job.company) +
              "</p></article>"
            );
          })
          .join("");
    }
    renderJobs();
    document
      .getElementById("schedule-form")
      .addEventListener("submit", function (event) {
        event.preventDefault();
        var candidateId = document.getElementById("schedule-candidate").value,
          application = InterviewData.getApplications().find(function (a) {
            return a.candidateId === candidateId;
          }),
          when = new Date(document.getElementById("schedule-time").value);
        if (!application || isNaN(when) || when <= new Date()) {
          window.alert("Select a candidate and a future interview time.");
          return;
        }
        var candidate = InterviewData.getUser(candidateId),
          current = InterviewData.currentUser();
        InterviewData.scheduleInterview({
          candidateId: candidateId,
          candidateName: candidate
            ? candidate.fullName
            : application.candidateName,
          recruiterName: current ? current.fullName : "Demo Recruiter",
          jobTitle: application.jobTitle,
          title: document.getElementById("schedule-title").value.trim(),
          type: document.getElementById("schedule-type").value,
          scheduledAt: when.toISOString(),
          duration: Number(document.getElementById("schedule-duration").value),
          instructions: document
            .getElementById("schedule-instructions")
            .value.trim(),
        });
        event.target.reset();
        renderScheduled();
      });
  }
})();
