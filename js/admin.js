(function () {
  var all = InterviewData.getInterviews(),
    completed = all.filter(function (r) {
      return r.status === "Submitted";
    }),
    shortlisted = completed.filter(function (r) {
      return r.recruiterDecision === "Shortlisted";
    }),
    rejected = completed.filter(function (r) {
      return r.recruiterDecision === "Rejected";
    });
  document.getElementById("started-count").textContent = all.length;
  document.getElementById("completed-count").textContent = completed.length;
  document.getElementById("admin-shortlisted").textContent = shortlisted.length;
  document.getElementById("admin-rejected").textContent = rejected.length;
  var rate = all.length ? Math.round((completed.length / all.length) * 100) : 0;
  document.getElementById("completion-rate").textContent = rate + "%";
  document.getElementById("completion-fill").style.width = rate + "%";
  function draw() {
    var filter = document.getElementById("admin-status-filter").value,
      records = completed.filter(function (r) {
        return !filter || r.recruiterDecision === filter;
      });
    document.getElementById("admin-table").innerHTML = records.length
      ? "<div class='table-wrap'><table><thead><tr><th>Candidate</th><th>Role</th><th>Score</th><th>Date</th><th>Status</th></tr></thead><tbody>" +
        records
          .slice()
          .reverse()
          .map(function (r) {
            return (
              "<tr><td><strong>" +
              escapeHtml(r.candidateName) +
              "</strong></td><td>" +
              escapeHtml(r.role) +
              "</td><td>" +
              r.percentage +
              "%</td><td>" +
              formatDate(r.submittedAt) +
              "</td><td><span class='status " +
              statusClass(r.recruiterDecision) +
              "'>" +
              r.recruiterDecision +
              "</span></td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : "<div class='empty-state'><strong>No records yet</strong><p>Completed interviews will appear here.</p></div>";
  }
  function audit() {
    var events = InterviewData.getAudits();
    document.getElementById("audit-table").innerHTML = events.length
      ? "<div class='table-wrap'><table><thead><tr><th>Event</th><th>Entity</th><th>Actor</th><th>Time</th></tr></thead><tbody>" +
        events
          .slice()
          .reverse()
          .map(function (e) {
            return (
              "<tr><td><strong>" +
              escapeHtml(e.action) +
              "</strong><small class='table-subtitle'>" +
              escapeHtml(e.details) +
              "</small></td><td>" +
              escapeHtml(e.entity) +
              "</td><td>" +
              escapeHtml(e.actor) +
              "</td><td>" +
              formatDate(e.createdAt) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : "<div class='empty-state'><strong>No audit events yet</strong><p>Applications, jobs, and interview activity will be recorded here.</p></div>";
  }
  draw();
  audit();
  document
    .getElementById("admin-status-filter")
    .addEventListener("change", draw);
})();
