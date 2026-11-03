(function () {
  var session = InterviewData.getSession(),
    search = document.getElementById("history-search"),
    sort = document.getElementById("history-sort");
  function draw() {
    var term = search.value.toLowerCase(),
      records = InterviewData.getInterviews().filter(function (r) {
        return (
          r.candidateId === session.id &&
          r.status === "Submitted" &&
          (!term ||
            (
              r.role +
              " " +
              r.questions
                .map(function (q) {
                  return q.topic;
                })
                .join(" ")
            )
              .toLowerCase()
              .indexOf(term) >= 0)
        );
      });
    records.sort(function (a, b) {
      return sort.value === "score"
        ? b.percentage - a.percentage
        : new Date(b.submittedAt) - new Date(a.submittedAt);
    });
    document.getElementById("history-table").innerHTML = records.length
      ? "<div class='table-wrap'><table><thead><tr><th>Role</th><th>Mode</th><th>Difficulty</th><th>Score</th><th>Completed</th><th></th></tr></thead><tbody>" +
        records
          .map(function (r) {
            return (
              "<tr><td><strong>" +
              escapeHtml(r.role) +
              "</strong><small class='table-subtitle'>" +
              escapeHtml(
                r.questions
                  .map(function (q) {
                    return q.topic;
                  })
                  .filter(function (v, i, a) {
                    return a.indexOf(v) === i;
                  })
                  .join(", "),
              ) +
              "</small></td><td>" +
              r.mode +
              "</td><td>" +
              r.difficulty +
              "</td><td><strong>" +
              r.percentage +
              "%</strong></td><td>" +
              formatDate(r.submittedAt) +
              "</td><td><a class='text-link' href='result.html?id=" +
              r.id +
              "'>Review →</a></td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : "<div class='empty-state'><strong>No completed interviews match</strong><p>Try another filter or launch a new session.</p><a class='button primary' href='candidate.html#start'>Practice now</a></div>";
  }
  search.addEventListener("input", draw);
  sort.addEventListener("change", draw);
  draw();
})();
