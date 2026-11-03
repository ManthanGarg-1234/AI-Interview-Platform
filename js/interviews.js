(function () {
  var user = InterviewData.currentUser(),
    records = InterviewData.getScheduled().filter(function (r) {
      return r.candidateId === user.id;
    });
  document.getElementById("interviews-list").innerHTML = records.length
    ? records
        .map(function (r) {
          return (
            "<article class='job-card'><span class='status " +
            statusClass(r.status) +
            "'>" +
            r.status +
            "</span><h3>" +
            escapeHtml(r.title) +
            "</h3><p class='muted'>" +
            escapeHtml(r.jobTitle) +
            " · " +
            escapeHtml(r.type) +
            "</p><p>" +
            new Date(r.scheduledAt).toLocaleString() +
            " · " +
            r.duration +
            " minutes</p><p>" +
            escapeHtml(
              r.instructions || "Review the role details before joining.",
            ) +
            "</p>" +
            (r.status !== "Cancelled"
              ? "<a class='button primary full' href='lobby.html?id=" +
                r.id +
                "'>Open pre-interview lobby</a>"
              : "") +
            "</article>"
          );
        })
        .join("")
    : "<div class='card empty-state'><strong>No interviews yet</strong><p>Recruiter-scheduled interviews will appear here.</p></div>";
})();
