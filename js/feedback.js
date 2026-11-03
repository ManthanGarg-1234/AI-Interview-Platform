(function () {
  var user = InterviewData.currentUser(),
    items = InterviewData.getPractice(user.id),
    leetRecords = InterviewData.getLeetCodeRecords(user.id),
    leetEvidence = InterviewData.getLeetCodeEvidence(user.id),
    avg = items.length
      ? Math.round(
          items.reduce(function (sum, item) {
            return sum + Number(item.score || 0);
          }, 0) / items.length,
        )
      : 0;
  document.getElementById("activity-count").textContent =
    items.length + leetEvidence.length;
  document.getElementById("evidence-score").textContent = items.length
    ? avg + "%"
    : "Manual tracker only";
  var grouped = {};
  items.forEach(function (item) {
    grouped[item.topic] = grouped[item.topic] || [];
    grouped[item.topic].push(item.score);
  });
  var solved = leetRecords.filter(function (item) {
    return item.status === "Solved";
  }).length;
  document.getElementById("recommendations").innerHTML =
    Object.keys(grouped).length || leetRecords.length
      ? Object.keys(grouped)
          .sort(function (a, b) {
            return (
              grouped[a].reduce(function (x, y) {
                return x + y;
              }, 0) /
                grouped[a].length -
              grouped[b].reduce(function (x, y) {
                return x + y;
              }, 0) /
                grouped[b].length
            );
          })
          .slice(0, 3)
          .map(function (topic) {
            var score = Math.round(
              grouped[topic].reduce(function (a, b) {
                return a + b;
              }, 0) / grouped[topic].length,
            );
            return (
              "<article class='application-card'><div><strong>Strengthen " +
              escapeHtml(topic) +
              "</strong><span class='muted'>Evidence average: " +
              score +
              "% · " +
              grouped[topic].length +
              " activity record(s)</span></div><a class='text-link' href='prep.html'>Practice this topic →</a></article>"
            );
          })
          .join("") +
        "<article class='application-card'><div><strong>LeetCode manual progress</strong><span class='muted'>" +
        solved +
        " problem(s) marked solved · not independently verified</span></div><a class='text-link' href='leetcode.html'>Review DSA practice →</a></article>"
      : "<div class='empty-state'><strong>Not enough evidence yet</strong><p>Complete technical practice or record a manual LeetCode activity to receive supported recommendations.</p><a class='button primary' href='prep.html'>Open preparation center</a></div>";
})();
